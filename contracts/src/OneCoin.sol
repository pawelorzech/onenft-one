// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {VRFConsumerV2Plus} from "./vrf/VRFConsumerV2Plus.sol";
import {IVRFCoordinatorV2Plus} from "./vrf/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vrf/VRFV2PlusClient.sol";
import {ICoinRenderer, CoinView} from "./ICoinRenderer.sol";

/// @title ONE, a coin that holds its own backing
/// @notice Every coin is one share position in an ERC-4626 USDC vault. A mint pays the
/// backing, 10, 25 or 50 USDC, and nothing on top; the coin holds the shares that money
/// bought. `claim` pays out the yield the coin has earned, `redeem` burns the coin and
/// pays out everything it holds. The author takes ten percent of yield and nothing else.
///
/// The contract has no admin over the pool. There is no pause, no upgrade, no key to the
/// funds and no function that moves a coin's shares anywhere but to that coin's owner.
/// The owner may only point new coins at a new renderer, lock that door for good, and
/// take the fees the contract has already set aside as treasury shares.
///
/// Ten thousand coins make a series, series without end. Fifty slots of every series are
/// master coins, one of one; the rest are procedural. Which slot a coin lands on comes
/// from Chainlink VRF v2.5 through a lazy Fisher-Yates urn over the series' ten thousand
/// slots, so exactly fifty masters exist per series and nobody, the author included, can
/// steer them. A coin is sealed between its mint and the VRF answer; `retry` reopens a
/// request the coordinator never answered, so no coin can stay sealed forever.
///
/// A coin cannot be redeemed for thirty days after its mint, and not while it is sealed unless
/// half a year has passed. That second door is for the day Chainlink drops a request: the
/// coordinator treats it as pending forever and will not release the subscription, so without a
/// way out that batch's USDC would be stranded. After half a year no answer is on its way and
/// there is nothing left to steer. The
/// first rule is what stops a holder from watching Chainlink's answer in the mempool and burning
/// chosen sealed coins of a batch to push the coins behind them onto a master slot. The second,
/// with the randomness fee the minter pays in ETH at mint, is what stops a bot from cycling the
/// same USDC through the urn, keeping the masters, burning the rest and billing the author's VRF
/// subscription for every round. Claiming yield stays open at any time.
///
/// Fifty founder coins a series are reserved for the author, free. Their backing is not paid at
/// mint: the contract fills it from the author's ten percent of yield, oldest founder coin
/// first, until each holds fifty USDC. Nobody else's money ever backs one. They are paced: the
/// series is cut into fifty bands of two hundred coins, and founder coin k must be minted inside
/// band k or not at all, so a band that closes empty forfeits that coin for good. The author can
/// neither hold a free mint back for a moment when the urn is dense with masters nor bring one
/// forward. Band fifty is coins 9801 to 10000, so the last founder coin can close its series.
///
/// The image is drawn by a separate renderer from the coin's own numbers. The renderer
/// address is pinned per coin at mint, so `setRenderer` touches future coins only, and
/// `lockRenderer` closes even that door, one way.
contract OneCoin is ERC721, Ownable, ReentrancyGuard, VRFConsumerV2Plus {
    using SafeERC20 for IERC20;

    // ---- constants ----

    /// @notice Coins per series. Fifty of them are masters, fifty are the founder reserve.
    uint256 public constant SERIES_SIZE = 10000;
    /// @notice Master recipes per series, drawn as slots 0..49 of the urn.
    uint256 public constant MASTERS = 50;
    /// @notice Founder coins the author may mint per series.
    uint256 public constant FOUNDERS_PER_SERIES = 50;
    /// @notice Coins per mint transaction. The cap is the gas of the VRF callback, not policy.
    uint8 public constant MAX_BATCH = 10;
    /// @notice The author's cut of yield, in basis points. Ten percent.
    uint256 public constant FEE_BPS = 1000;
    uint256 public constant BPS = 10000;
    /// @notice `yieldBps` handed to the renderer stops here, at one thousand percent.
    uint32 public constant MAX_YIELD_BPS = 100000;
    /// @notice The three backing classes in USDC units, six decimals.
    uint256 public constant BACKING_10 = 10e6;
    uint256 public constant BACKING_25 = 25e6;
    uint256 public constant BACKING_50 = 50e6;
    /// @notice What a founder coin is filled to from the fees, in USDC units.
    uint256 public constant FOUNDER_BACKING = BACKING_50;
    /// @notice The least `callbackGas` a deploy may ask for. The costly callback is a batch of
    /// ten that straddles a series boundary, because it writes into two urns: measured at
    /// 408,324 gas. This floor keeps that under sixty percent of what the coordinator grants,
    /// which matters because a callback that runs out of gas leaves those coins sealed and a
    /// retry would fail the same way every time.
    uint32 public constant MIN_CALLBACK_GAS = 800_000;
    /// @notice The most it may ask for. Chainlink holds the lane's worst case, callbackGas times
    /// the lane's maximum gas price plus the premium, against the subscription balance before it
    /// will answer at all, so asking for headroom nobody needs stalls the request.
    uint32 public constant MAX_CALLBACK_GAS = 2_500_000;
    /// @notice Block confirmations the coordinator waits before answering.
    uint16 public constant REQUEST_CONFIRMATIONS = 3;
    /// @notice Blocks after a request before anyone may `retry` it. Four hours of Base blocks.
    uint256 public constant RETRY_BLOCKS = 7200;
    /// @notice A founder coin is only unlocked once the series has this many coins per founder
    /// coin already minted, so the author's free mints are spread across the series.
    uint256 public constant FOUNDER_PACE = 200;
    /// @notice How long after its mint a coin has to wait before it can be burned. Claiming the
    /// yield is open the whole time; this stops churn, not withdrawal.
    uint256 public constant REDEEM_LOCK = 30 days;
    /// @notice After this long a coin can be burned even if the VRF never answered for it. The
    /// coordinator counts an unfulfilled request as pending and will not let a subscription
    /// migrate or a consumer leave while one is open, so without this door a request the node
    /// drops would put that batch's USDC out of reach for good.
    uint256 public constant SEALED_ESCAPE = 180 days;
    /// @notice VRF is paid in native ETH from the subscription, not in LINK.
    bool public constant NATIVE_PAYMENT = true;
    /// @notice `slot` of a coin the VRF has not answered for yet.
    uint16 public constant SEALED_SLOT = type(uint16).max;
    /// @notice `master` of a coin that is procedural, not one of one.
    uint8 public constant NO_MASTER = 255;

    // ---- immutables ----

    /// @notice The USDC the coins are backed in.
    IERC20 public immutable USDC;
    /// @notice The ERC-4626 vault the backing sits in. Its asset is USDC, checked at deploy.
    IERC4626 public immutable VAULT;
    /// @notice The author. Owner of this contract and the wallet the founder coins go to.
    address public immutable author;
    /// @notice The VRF v2.5 key hash of the lane the requests go to.
    bytes32 public immutable keyHash;
    /// @notice The VRF v2.5 subscription that pays for the requests.
    uint256 public immutable subId;
    /// @notice The least ETH a mint must send. The whole value sent goes on to the subscription
    /// in the same transaction, so the minter pays for their own randomness.
    uint256 public immutable vrfFeeWei;
    /// @notice Gas the coordinator is asked to give `fulfillRandomWords`, enough for a full batch
    /// of MAX_BATCH coins and no more. Set at deploy because the right number depends on the
    /// lane: the coordinator will not answer until the subscription covers this figure at the
    /// lane's maximum gas price, so a generous limit on an expensive lane leaves coins sealed.
    uint32 public immutable callbackGas;

    // ---- storage ----

    /// @dev One coin. The first five fields share a slot, 64 + 40 + 16 + 8 + 8 = 136 bits, and
    /// the renderer takes the next one.
    struct Coin {
        uint64 seed;
        uint40 mintedAt;
        uint16 slot;
        uint8 backingClass;
        bool founder;
        address renderer;
        uint256 shares;
        uint256 principal;
        uint256 claimed;
        uint256 requestId;
    }

    /// @dev One open VRF request. Packs into one slot.
    /// `replaced` marks a request `retry` has already asked again for. It stays open, because a
    /// coin takes whichever answer lands first, but it cannot be retried a second time: only
    /// the newest request of a batch can, so retries form a chain and not a doubling tree.
    struct Request {
        uint64 firstId;
        uint16 count;
        uint64 blockNumber;
        bool replaced;
    }

    /// @dev The lazy Fisher-Yates urn of one series. `swaps` holds slot + 1, so 0 means unset.
    struct Urn {
        bool started;
        uint16 left;
        uint16 mastersDrawn;
        mapping(uint16 index => uint16 slotPlusOne) swaps;
    }

    mapping(uint256 tokenId => Coin) internal _coins;
    mapping(uint256 requestId => Request) public requests;
    mapping(uint256 series => Urn) internal _urns;
    /// @notice Founder coins minted so far, per series.
    mapping(uint256 series => uint16 minted) public founderMinted;
    /// @notice The band the last founder coin of a series took. Bands are spent in order and a
    /// band that closes without its coin is gone, so this is not the same as `founderMinted`.
    mapping(uint256 series => uint16 band) public lastFounderBand;

    /// @notice The renderer new coins are pinned to.
    address public renderer;
    /// @notice Once true, `setRenderer` is closed for good.
    bool public rendererLocked;
    /// @notice The id the next coin will take.
    uint256 public nextId = 1;
    /// @notice Coins minted so far, founders included. Burns do not lower it.
    uint256 public minted;
    /// @notice Vault shares the contract holds for the author: the fee on yield, not yet withdrawn.
    uint256 public treasuryShares;
    /// @notice Every founder coin ever minted, in mint order.
    uint256[] public founderIds;
    /// @notice Index into `founderIds` of the first founder coin that is not full yet.
    uint256 public nextFounderToFund;

    // ---- events ----

    event Minted(uint256 indexed id, address indexed to, uint8 backingClass, uint256 requestId);
    event Requested(uint256 indexed requestId, uint256 firstId, uint16 count);
    event Revealed(uint256 indexed id, uint64 seed, uint16 slot);
    event Retried(uint256 indexed oldRequestId, uint256 indexed newRequestId);
    event Claimed(uint256 indexed id, address indexed to, uint256 assets, uint256 fee);
    event Redeemed(uint256 indexed id, address indexed to, uint256 assets, uint256 fee);
    event FounderFunded(uint256 indexed id, uint256 assets, uint256 shares);
    event TreasuryWithdrawn(address indexed to, uint256 assets);
    event RendererSet(address indexed renderer);
    event RendererLocked();

    // ---- errors ----

    error BadBackingClass(uint8 backingClass);
    error BadCount(uint8 count);
    error BadRecipient();
    error BadRenderer(address renderer);
    error BadVault(address vault, address asset);
    error RendererIsLocked();
    error OwnershipIsPermanent();
    error NotOwnerNorApproved(uint256 id, address caller);
    error NothingToClaim(uint256 id);
    error SeriesBoundary(uint256 firstId, uint256 lastId);
    error FounderReserveFull(uint256 series, uint16 minted_, uint8 count);
    error NoSuchRequest(uint256 requestId);
    error NothingToRetry(uint256 requestId);
    error AlreadyRetried(uint256 requestId);
    error BadDeposit(uint256 assets, uint256 shares);
    error SealedCoin(uint256 id);
    error TooSoon(uint256 id, uint256 redeemableAt);
    error FeeTooLow(uint256 want, uint256 got);
    error FounderTooEarly(uint256 series, uint256 k, uint256 opensAt);
    error FounderBandMissed(uint256 series, uint256 k, uint256 closedAt);
    error VaultFull(uint256 assets, uint256 maxDeposit);
    error VaultIlliquid(uint256 needed, uint256 available);
    error PayoutFailed();
    error BadCallbackGas(uint32 callbackGas);
    error RetryTooEarly(uint256 requestId, uint256 openAtBlock);
    error RequestIdInUse(uint256 requestId);
    error FoundersUnfunded(uint256 firstUnfunded);
    error NothingInTreasury();
    error UrnEmpty(uint256 series);

    // ---- deploy ----

    /// @param author_ the author: owner of this contract and holder of the founder coins
    /// @param usdc_ the USDC token
    /// @param vault_ an ERC-4626 vault whose asset is `usdc_`
    /// @param renderer_ the first renderer; new coins pin whatever `renderer` holds at mint
    /// @param coordinator_ the Chainlink VRF v2.5 coordinator on this chain
    /// @param keyHash_ the VRF lane
    /// @param subId_ the VRF subscription this contract is a consumer of
    /// @param vrfFeeWei_ the least ETH a mint must send on to that subscription
    /// @param callbackGas_ gas for the VRF callback, between MIN_CALLBACK_GAS and MAX_CALLBACK_GAS
    constructor(
        string memory name_,
        string memory symbol_,
        address author_,
        address usdc_,
        address vault_,
        address renderer_,
        address coordinator_,
        bytes32 keyHash_,
        uint256 subId_,
        uint256 vrfFeeWei_,
        uint32 callbackGas_
    ) ERC721(name_, symbol_) Ownable(author_) VRFConsumerV2Plus(coordinator_) {
        if (callbackGas_ < MIN_CALLBACK_GAS || callbackGas_ > MAX_CALLBACK_GAS) {
            revert BadCallbackGas(callbackGas_);
        }
        if (author_ == address(0) || coordinator_ == address(0)) revert BadRecipient();
        address asset = IERC4626(vault_).asset();
        if (asset != usdc_) revert BadVault(vault_, asset);
        _checkRenderer(renderer_);
        USDC = IERC20(usdc_);
        VAULT = IERC4626(vault_);
        author = author_;
        keyHash = keyHash_;
        subId = subId_;
        vrfFeeWei = vrfFeeWei_;
        callbackGas = callbackGas_;
        renderer = renderer_;
        emit RendererSet(renderer_);
    }

    /// @dev A renderer is pinned per coin forever, so it must at least answer and know the
    /// fifty masters before any coin points at it. The check stays cheap on purpose: a full
    /// `tokenURI` walks four thousand pixels and would put the deploy near the block gas limit.
    function _checkRenderer(address renderer_) internal view {
        if (renderer_.code.length == 0) revert BadRenderer(renderer_);
        ICoinRenderer r = ICoinRenderer(renderer_);
        if (r.masterCount() != MASTERS) revert BadRenderer(renderer_);
        if (bytes(r.masterName(0)).length == 0) revert BadRenderer(renderer_);
        if (bytes(r.masterName(uint8(MASTERS - 1))).length == 0) revert BadRenderer(renderer_);
    }

    // ---- series arithmetic ----

    /// @return the series a token id belongs to, counted from 1
    function seriesOf(uint256 id) public pure returns (uint256) {
        return (id - 1) / SERIES_SIZE + 1;
    }

    /// @return the coin's place inside its series, 1..SERIES_SIZE
    function numberOf(uint256 id) public pure returns (uint256) {
        return (id - 1) % SERIES_SIZE + 1;
    }

    /// @dev The place the next coin of `series` would take inside it, 1..SERIES_SIZE. A series
    /// already behind reads as SERIES_SIZE + 1, one past its end, and one not yet reached reads
    /// as 0, so no band is ever open in either.
    function _nextPosition(uint256 series) internal view returns (uint256) {
        uint256 current = seriesOf(nextId);
        if (series < current) return SERIES_SIZE + 1;
        // A series nobody has reached yet holds no position at all, so no band in it is open.
        if (series > current) return 0;
        return numberOf(nextId);
    }

    /// @return the band the next founder coin of a series would take, 1..50 while any is left
    function founderBand(uint256 series) public view returns (uint256) {
        uint256 position = _nextPosition(series);
        uint256 band = (position + FOUNDER_PACE - 1) / FOUNDER_PACE;
        if (band == 0) band = 1;
        uint256 spent = lastFounderBand[series];
        return band > spent ? band : uint256(spent) + 1;
    }

    /// @notice Where the next founder coin of a series can be minted, for the site to show.
    /// @return k the band, 1..50
    /// @return opensAt the first position of that band
    /// @return closesAt the last position of that band
    /// @return open true when the series is standing inside the band right now
    function founderWindow(uint256 series)
        external
        view
        returns (uint256 k, uint256 opensAt, uint256 closesAt, bool open)
    {
        k = founderBand(series);
        opensAt = FOUNDER_PACE * (k - 1) + 1;
        closesAt = FOUNDER_PACE * k;
        uint256 position = _nextPosition(series);
        open = k <= FOUNDERS_PER_SERIES && position >= opensAt && position <= closesAt;
    }

    /// @return the backing of a class in USDC units, six decimals
    function backingOf(uint8 backingClass) public pure returns (uint256) {
        if (backingClass == 0) return BACKING_10;
        if (backingClass == 1) return BACKING_25;
        if (backingClass == 2) return BACKING_50;
        revert BadBackingClass(backingClass);
    }

    /// @return the backing of a class in whole USDC: 10, 25 or 50
    function backingDollarsOf(uint8 backingClass) public pure returns (uint8) {
        if (backingClass == 0) return 10;
        if (backingClass == 1) return 25;
        if (backingClass == 2) return 50;
        revert BadBackingClass(backingClass);
    }

    // ---- mint ----

    /// @notice Buy `count` coins of one backing class for `to`. The price is the backing and
    /// nothing else; every unit of it goes into the vault and stays the coins'.
    /// @dev The caller must have approved this contract for `count * backingOf(backingClass)` USDC.
    /// The shares the deposit bought split evenly across the batch, the remainder to the last coin.
    /// @return firstId the id of the first coin of the batch; the batch runs to firstId + count - 1
    function mint(uint8 backingClass, uint8 count, address to)
        external
        payable
        nonReentrant
        returns (uint256 firstId)
    {
        if (msg.value < vrfFeeWei) revert FeeTooLow(vrfFeeWei, msg.value);
        if (count == 0 || count > MAX_BATCH) revert BadCount(count);
        if (to == address(0)) revert BadRecipient();
        uint256 backing = backingOf(backingClass);
        uint256 total = backing * count;
        uint256 room = VAULT.maxDeposit(address(this));
        if (total > room) revert VaultFull(total, room);

        USDC.safeTransferFrom(msg.sender, address(this), total);
        USDC.forceApprove(address(VAULT), total);
        // What the vault says it minted is not evidence. Measure the shares this contract
        // actually gained, so a vault that reports one number and credits another is caught.
        uint256 held = VAULT.balanceOf(address(this));
        VAULT.deposit(total, address(this));
        uint256 shares = VAULT.balanceOf(address(this)) - held;
        // A vault that quietly takes less than it was approved would leave a dangling
        // allowance, so close it either way.
        USDC.forceApprove(address(VAULT), 0);
        // A deposit that buys fewer shares than there are coins would mint a coin backed by
        // nothing while the money stays with the vault's other holders. Refuse the trade.
        if (shares < count) revert BadDeposit(total, shares);
        // And the shares have to be worth what was paid, give or take one unit of rounding a
        // coin. Anything worse is the vault taking a cut this contract did not agree to.
        if (VAULT.convertToAssets(shares) + count < total) revert BadDeposit(total, shares);

        uint256 per = shares / count;
        firstId = nextId;
        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            uint256 mine = i + 1 == count ? shares - per * (count - 1) : per;
            _newCoin(id, to, backingClass, false, mine, backing);
        }
        nextId = firstId + count;
        minted += count;

        uint256 requestId = _requestWords(firstId, count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            _coins[id].requestId = requestId;
            emit Minted(id, to, backingClass, requestId);
        }
    }

    /// @notice Mint founder coins for `to`, free and unbacked. Their backing arrives later,
    /// from the author's share of yield, through `fundFounders`.
    /// @dev A batch may not cross a series boundary: the founder reserve is counted per series.
    /// @return firstId the id of the first coin of the batch
    function mintFounder(uint8 count, address to)
        external
        payable
        onlyOwner
        nonReentrant
        returns (uint256 firstId)
    {
        if (msg.value < vrfFeeWei) revert FeeTooLow(vrfFeeWei, msg.value);
        if (count == 0 || count > MAX_BATCH) revert BadCount(count);
        if (to == address(0)) revert BadRecipient();
        firstId = nextId;
        uint256 lastId = firstId + count - 1;
        uint256 series = seriesOf(firstId);
        if (seriesOf(lastId) != series) revert SeriesBoundary(firstId, lastId);
        uint16 already = founderMinted[series];
        if (already + count > FOUNDERS_PER_SERIES) revert FounderReserveFull(series, already, count);
        // The series is cut into fifty bands of two hundred coins, and founder coin k has to be
        // minted inside band k or not at all. A band that closes without its coin is forfeited,
        // which is why the band comes from where the series has reached and not from how many
        // founder coins exist. The author cannot hold a free mint back for a moment when the urn
        // is dense with masters, and cannot bring one forward either.
        uint256 k = founderBand(series);
        if (k + count - 1 > FOUNDERS_PER_SERIES) revert FounderReserveFull(series, already, count);
        for (uint256 i = 0; i < count; i++) {
            uint256 band = k + i;
            uint256 position = numberOf(firstId + i);
            uint256 opensAt = FOUNDER_PACE * (band - 1) + 1;
            if (position < opensAt) revert FounderTooEarly(series, band, opensAt);
            uint256 closesAt = FOUNDER_PACE * band;
            if (position > closesAt) revert FounderBandMissed(series, band, closesAt);
        }
        lastFounderBand[series] = uint16(k + count - 1);
        founderMinted[series] = already + count;

        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            // Class 2 is the 50 USDC class: a founder coin is a fifty once it is full.
            _newCoin(id, to, 2, true, 0, 0);
            founderIds.push(id);
        }
        nextId = firstId + count;
        minted += count;

        uint256 requestId = _requestWords(firstId, count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            _coins[id].requestId = requestId;
            emit Minted(id, to, 2, requestId);
        }
    }

    /// @dev Writes one sealed coin and mints it. `_mint`, not `_safeMint`: after EIP-7702 a
    /// normal wallet can carry delegation code that does not answer onERC721Received.
    function _newCoin(uint256 id, address to, uint8 backingClass, bool founder, uint256 shares, uint256 principal)
        internal
    {
        Coin storage c = _coins[id];
        c.seed = 0;
        c.slot = SEALED_SLOT;
        c.mintedAt = uint40(block.timestamp);
        c.backingClass = backingClass;
        c.founder = founder;
        c.renderer = renderer;
        c.shares = shares;
        c.principal = principal;
        _mint(to, id);
    }

    // ---- randomness ----

    /// @dev Opens one VRF request for `count` words and records which coins it answers for.
    function _requestWords(uint256 firstId, uint8 count) internal returns (uint256 requestId) {
        // The minter's ETH goes straight to the subscription that will pay for these words, so
        // the randomness funds itself and this contract is never left holding ETH. `retry`
        // sends nothing and is skipped here.
        if (msg.value > 0) {
            IVRFCoordinatorV2Plus(vrfCoordinator).fundSubscriptionWithNative{value: msg.value}(subId);
        }
        requestId = IVRFCoordinatorV2Plus(vrfCoordinator).requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit: callbackGas,
                numWords: count,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: NATIVE_PAYMENT}))
            })
        );
        if (requests[requestId].count != 0) revert RequestIdInUse(requestId);
        requests[requestId] =
            Request({firstId: uint64(firstId), count: count, blockNumber: uint64(block.number), replaced: false});
        emit Requested(requestId, firstId, count);
    }

    /// @notice The coordinator's answer. Sets the seed and draws the art slot of every coin
    /// of the request, in id order.
    /// @dev Never reverts on an id it does not know: a request that `retry` has replaced is
    /// forgotten, and a late answer to it must not brick the coordinator's callback. A short
    /// answer leaves the request open so `retry` can still recover it.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata words) internal override {
        Request memory r = requests[requestId];
        if (r.count == 0) return;
        if (words.length < r.count) return;
        delete requests[requestId];
        // A batch is answered once, and the whole batch at once. `retry` leaves the request it
        // replaced open, so a second answer can still arrive for a batch already revealed; the
        // first coin of the batch decides that for all of them, because it is sealed until the
        // batch is answered and a sealed coin cannot be redeemed. One read, no loop, and above
        // all no test on any individual coin: the number of urn draws a batch costs is fixed at
        // mint and cannot be changed by anything a holder does afterwards.
        if (_coins[r.firstId].slot != SEALED_SLOT) return;
        for (uint256 i = 0; i < r.count; i++) {
            uint256 id = uint256(r.firstId) + i;
            Coin storage c = _coins[id];
            uint64 seed = uint64(words[i]);
            uint16 slot = _draw(seriesOf(id), words[i] >> 64);
            c.seed = seed;
            c.slot = slot;
            c.requestId = 0;
            emit Revealed(id, seed, slot);
        }
    }

    /// @notice Ask the coordinator again for a request it never answered. Anyone may call,
    /// once `RETRY_BLOCKS` have passed.
    /// @dev The replaced request stays open. That is deliberate: a VRF answer is public in the
    /// mempool before it lands, and if a retry could throw away the request that carries it, a
    /// holder who did not like the slot could front-run the fulfilment and draw again. Because
    /// both requests stay live and a coin reveals from whichever answer arrives first, a retry
    /// can only add a chance of an answer, never discard one. The replaced request is marked and
    /// cannot be retried again, so a batch gains at most one request per window however many
    /// answers are outstanding.
    /// Any ETH sent with the call goes on to the subscription, the same way a mint's fee does.
    /// The mint paid for one answer; if the subscription has since run dry, whoever wants the
    /// coins open can pay for the next attempt rather than leave the batch sealed for good.
    /// @return newRequestId the id of the fresh request
    function retry(uint256 requestId) external payable nonReentrant returns (uint256 newRequestId) {
        Request memory r = requests[requestId];
        if (r.count == 0) revert NoSuchRequest(requestId);
        // Only the newest request of a batch may be retried. Without this every open request
        // could spawn its own child each window and the count would double every window.
        if (r.replaced) revert AlreadyRetried(requestId);
        uint256 openAt = uint256(r.blockNumber) + RETRY_BLOCKS;
        if (block.number <= openAt) revert RetryTooEarly(requestId, openAt + 1);

        // A sibling request answered this batch already, so there is nothing left to ask for.
        if (_coins[r.firstId].slot != SEALED_SLOT) revert NothingToRetry(requestId);

        requests[requestId].replaced = true;
        newRequestId = _requestWords(r.firstId, uint8(r.count));
        for (uint256 i = 0; i < r.count; i++) {
            _coins[uint256(r.firstId) + i].requestId = newRequestId;
        }
        emit Retried(requestId, newRequestId);
    }

    // ---- the urn ----

    /// @dev Lazy Fisher-Yates over the series' slots. `swaps` holds slot + 1 so an unset entry
    /// reads as its own index. After SERIES_SIZE draws every slot 0..SERIES_SIZE-1 came out once.
    function _draw(uint256 series, uint256 rand) internal returns (uint16 slot) {
        Urn storage u = _urns[series];
        if (!u.started) {
            u.started = true;
            u.left = uint16(SERIES_SIZE);
        }
        uint16 left = u.left;
        if (left == 0) revert UrnEmpty(series);
        uint16 pick = uint16(rand % left);
        slot = _at(u, pick);
        u.swaps[pick] = _at(u, left - 1) + 1;
        u.left = left - 1;
        if (slot < MASTERS) u.mastersDrawn += 1;
    }

    function _at(Urn storage u, uint16 k) internal view returns (uint16) {
        uint16 v = u.swaps[k];
        return v == 0 ? k : v - 1;
    }

    /// @return how many slots of a series are still in the urn
    function urnLeft(uint256 series) external view returns (uint256) {
        Urn storage u = _urns[series];
        return u.started ? u.left : SERIES_SIZE;
    }

    /// @return how many master slots of a series nobody has drawn yet
    function mastersLeft(uint256 series) external view returns (uint256) {
        return MASTERS - _urns[series].mastersDrawn;
    }

    // ---- money ----

    /// @return the USDC the coin's shares are worth right now, in units
    function nav(uint256 id) public view returns (uint256) {
        return VAULT.convertToAssets(_coins[id].shares);
    }

    /// @return the yield the coin is sitting on and has not claimed yet, in USDC units
    function profit(uint256 id) public view returns (uint256) {
        uint256 n = nav(id);
        uint256 p = _coins[id].principal;
        return n > p ? n - p : 0;
    }

    /// @return every unit of yield the coin has ever earned, claimed or not. Claims do not
    /// reset it and transfers do not reset it.
    function lifetime(uint256 id) public view returns (uint256) {
        return _coins[id].claimed + profit(id);
    }

    /// @return lifetime yield over backing in basis points, capped at MAX_YIELD_BPS
    function yieldBps(uint256 id) public view returns (uint32) {
        uint256 p = _coins[id].principal;
        if (p == 0) return 0;
        uint256 bps = lifetime(id) * BPS / p;
        return bps > MAX_YIELD_BPS ? MAX_YIELD_BPS : uint32(bps);
    }

    /// @dev The shares that stand for `assets` out of a position of `shares` worth `nav_`.
    /// Proportional on purpose: it can never hand out more shares than the position holds,
    /// which `convertToShares` could do on a vault that rounds the other way.
    function _sharesFor(uint256 shares, uint256 nav_, uint256 assets) internal pure returns (uint256) {
        if (nav_ == 0) return 0;
        return shares * assets / nav_;
    }

    /// @notice Take the coin's yield without giving up the coin. The author's ten percent stays
    /// behind as treasury shares; the rest leaves the vault straight to the coin's owner.
    /// @dev Reverts when there is no yield. Pays one founder coin's backing forward on the way
    /// out. When the vault cannot free the whole payout the claim takes what it can and books
    /// only that, so the rest stays in the coin and can be claimed later.
    /// @return paid the USDC the owner received, in units
    function claim(uint256 id) external nonReentrant returns (uint256 paid) {
        address to = _requireAuthorized(id);
        Coin storage c = _coins[id];
        uint256 shares = c.shares;
        uint256 nav_ = VAULT.convertToAssets(shares);
        uint256 principal = c.principal;
        uint256 gain = nav_ > principal ? nav_ - principal : 0;
        if (gain == 0) revert NothingToClaim(id);

        // The holder's ninety percent of the whole gain, before the vault has its say.
        uint256 wantShares = _sharesFor(shares, nav_, gain - gain * FEE_BPS / BPS);
        // The vault may not be able to hand it all back today. Take what it can and leave the
        // rest earning; the holder comes back for it. This is why the payout is capped rather
        // than reverted: a claim is not a burn and nothing is lost by waiting.
        uint256 available = VAULT.maxRedeem(address(this));
        uint256 outShares = wantShares > available ? available : wantShares;
        // A gain too small to be worth a single share would pay nothing while still raising
        // `claimed`, and the same gain could be claimed again and again. Wait for a real one.
        if (outShares == 0) revert NothingToClaim(id);
        // The fee is a ninth of what the holder actually got, which is ten percent of the gain
        // released. Taking ten percent of the gain on paper would charge the part the vault
        // could not free, and charge it again on the next claim.
        // It rounds down, and that direction is not a preference. Rounding up would charge a
        // whole share on a release of one share, which is half of it and not a tenth, and a
        // vault handing back a share at a time would compound that into most of the yield. The
        // author gives up at most one share unit a claim; the holder can never be overcharged.
        uint256 feeShares = outShares * FEE_BPS / (BPS - FEE_BPS);
        // The fee never eats into what the coin keeps beyond its own share of the gain.
        if (feeShares + outShares > shares) feeShares = shares - outShares;
        uint256 feeAssets = VAULT.convertToAssets(feeShares);

        c.shares = shares - feeShares - outShares;
        treasuryShares += feeShares;

        // Pay the founder queue before the vault is touched, so the only interaction
        // left after the last state change is the redeem that sends USDC to the owner.
        _fundFounders(1);

        paid = VAULT.redeem(outShares, to, address(this));
        // The shares were worth something on paper and nothing on withdrawal. Book no yield
        // for a payout that did not happen; the whole call unwinds.
        if (paid == 0) revert NothingToClaim(id);
        // Book what moved, never what the arithmetic hoped for. `lifetime` is a record of money
        // that changed hands, so it can never claim more than the holder and the author got.
        // This write follows the redeem because only the redeem knows the number; `nonReentrant`
        // is what makes that safe.
        c.claimed += paid + feeAssets;
        emit Claimed(id, to, paid, feeAssets);
    }

    /// @notice Burn the coin and take everything it holds: the backing plus the yield, less the
    /// author's ten percent of the yield. When the vault lost money there is no fee and the
    /// owner gets what is left.
    /// @dev Only once the coin is revealed and thirty days past its mint. Claiming the yield has
    /// neither restriction.
    /// @return assets the USDC the owner received, in units
    function redeem(uint256 id) external nonReentrant returns (uint256 assets) {
        address to = _requireAuthorized(id);
        Coin storage c = _coins[id];
        // A sealed coin stays put, at first. Burning one early is how a holder would steer the
        // coins behind it: the random words are public in the mempool before they land. After
        // SEALED_ESCAPE no answer is coming, there is nothing left to steer, and the money must
        // not be trapped by a request the node dropped.
        if (c.slot == SEALED_SLOT && block.timestamp < uint256(c.mintedAt) + SEALED_ESCAPE) {
            revert SealedCoin(id);
        }
        uint256 ready = uint256(c.mintedAt) + REDEEM_LOCK;
        if (block.timestamp < ready) revert TooSoon(id, ready);
        uint256 shares = c.shares;
        uint256 nav_ = VAULT.convertToAssets(shares);
        uint256 principal = c.principal;
        uint256 gain = nav_ > principal ? nav_ - principal : 0;

        uint256 fee = gain * FEE_BPS / BPS;
        // Down, for the same reason as in `claim`: on a coin holding very few shares, rounding
        // up could take the whole position and leave the owner with nothing.
        uint256 feeShares = _sharesFor(shares, nav_, fee);
        uint256 outShares = shares - feeShares;
        // A burn is one shot, so a vault that cannot pay today must not be allowed to swallow
        // the coin. The holder keeps it and comes back when the liquidity is there.
        uint256 available = VAULT.maxRedeem(address(this));
        if (outShares > available) revert VaultIlliquid(outShares, available);

        // Zero the money, keep the art. `fulfillRandomWords` reads the first coin of a batch to
        // tell whether the batch was answered, and after SEALED_ESCAPE that coin can be gone; a
        // `delete` here would read back as answered and a late reply would draw nothing for the
        // whole batch. What a batch costs the urn is fixed at mint and stays fixed.
        c.shares = 0;
        c.principal = 0;
        c.claimed = 0;
        c.requestId = 0;
        _burn(id);
        treasuryShares += feeShares;

        assets = outShares == 0 ? 0 : VAULT.redeem(outShares, to, address(this));
        emit Redeemed(id, to, assets, fee);
    }

    /// @dev Reverts unless the caller owns the coin or is approved for it.
    /// @return owner the coin's owner, who is the only address the money may go to
    function _requireAuthorized(uint256 id) internal view returns (address owner) {
        owner = _requireOwned(id);
        if (!_isAuthorized(owner, msg.sender, id)) revert NotOwnerNorApproved(id, msg.sender);
    }

    // ---- the founder queue ----

    /// @notice Move fees from the treasury into founder coins, oldest first, until each holds
    /// fifty USDC. Anyone may call. `claim` calls it for one coin on every claim.
    /// @param max how many founder coins to look at this call
    function fundFounders(uint8 max) external nonReentrant {
        _fundFounders(max);
    }

    /// @dev Walks the founder queue from `nextFounderToFund`. Stops at the first coin it cannot
    /// finish, so the pointer only ever passes coins that are full, burned, or both.
    function _fundFounders(uint256 max) internal {
        uint256 i = nextFounderToFund;
        uint256 n = founderIds.length;
        uint256 shares = treasuryShares;
        for (uint256 steps = 0; steps < max && i < n; steps++) {
            uint256 id = founderIds[i];
            if (_ownerOf(id) == address(0)) {
                i++;
                continue;
            }
            Coin storage c = _coins[id];
            uint256 principal = c.principal;
            if (principal >= FOUNDER_BACKING) {
                i++;
                continue;
            }
            if (shares == 0) break;
            uint256 have = VAULT.convertToAssets(shares);
            if (have == 0) break;
            uint256 need = FOUNDER_BACKING - principal;
            uint256 assets = need < have ? need : have;
            // Round up, so the coin is never credited with more principal than the shares it
            // received are worth. The dust comes out of the treasury, which is the author's.
            uint256 moved = (shares * assets + have - 1) / have;
            if (moved > shares) moved = shares;
            // A move too small to buy a single share would raise the coin's principal
            // without raising what backs it. Wait for the treasury to grow instead.
            if (moved == 0) break;
            shares -= moved;
            c.shares += moved;
            c.principal = principal + assets;
            emit FounderFunded(id, assets, moved);
            if (c.principal >= FOUNDER_BACKING) i++;
        }
        treasuryShares = shares;
        nextFounderToFund = i;
    }

    /// @return the USDC the treasury shares are worth right now, in units
    function treasuryAssets() external view returns (uint256) {
        return VAULT.convertToAssets(treasuryShares);
    }

    /// @return true when no founder coin is waiting for its backing
    function foundersFunded() public view returns (bool) {
        uint256 i = nextFounderToFund;
        uint256 n = founderIds.length;
        while (i < n) {
            uint256 id = founderIds[i];
            if (_ownerOf(id) != address(0) && _coins[id].principal < FOUNDER_BACKING) return false;
            i++;
        }
        return true;
    }

    /// @return how many founder coins exist, over every series
    function founderCount() external view returns (uint256) {
        return founderIds.length;
    }

    /// @notice Take the fees the contract has set aside. The founder coins come first: while any
    /// of them is short of its fifty USDC there is nothing here to take.
    /// @dev Runs the founder queue first, so the author cannot skip it by not calling `fundFounders`.
    /// @return assets the USDC sent to `to`, in units
    function withdrawTreasury(address to) external onlyOwner nonReentrant returns (uint256 assets) {
        if (to == address(0)) revert BadRecipient();
        // Every step of `_fundFounders` either moves the pointer on or stops the walk, so
        // after a walk of the whole remaining queue the pointer is exact: it has reached the
        // end only when every founder coin is full or burned. No second pass is needed.
        _fundFounders(founderIds.length - nextFounderToFund);
        if (nextFounderToFund < founderIds.length) revert FoundersUnfunded(nextFounderToFund);
        uint256 shares = treasuryShares;
        if (shares == 0) revert NothingInTreasury();
        uint256 available = VAULT.maxRedeem(address(this));
        if (shares > available) revert VaultIlliquid(shares, available);
        treasuryShares = 0;
        assets = VAULT.redeem(shares, to, address(this));
        emit TreasuryWithdrawn(to, assets);
    }

    // ---- renderer ----

    /// @notice Point new coins at a new renderer. Coins already minted keep the one they were
    /// pinned to, so no image ever changes under its owner.
    function setRenderer(address renderer_) external onlyOwner {
        if (rendererLocked) revert RendererIsLocked();
        _checkRenderer(renderer_);
        renderer = renderer_;
        emit RendererSet(renderer_);
    }

    /// @notice ETH forced into this contract goes to the author. Nothing in the normal flow
    /// leaves any here: a mint's fee is forwarded to the subscription in the same transaction.
    /// This touches no coin's shares and no holder's USDC, only ETH that should not exist.
    function sweep() external nonReentrant {
        (bool ok,) = author.call{value: address(this).balance}("");
        if (!ok) revert PayoutFailed();
    }

    /// @notice One way. After this no renderer bug can be fixed, for minting or for metadata.
    function lockRenderer() external onlyOwner {
        rendererLocked = true;
        emit RendererLocked();
    }

    /// @dev Renouncing would strand the treasury and freeze the renderer while `rendererLocked`
    /// still reads false. `lockRenderer` is the one sanctioned way to freeze.
    function renounceOwnership() public pure override {
        revert OwnershipIsPermanent();
    }

    /// @dev Chainlink's coordinator refuses to migrate a subscription while a request is still
    /// pending, which is exactly the case a stuck request creates. The author can finish the move
    /// instead. This points the consumer somewhere else and touches no coin and no money.
    function _canSetCoordinator(address who) internal view override returns (bool) {
        return who == owner();
    }

    /// @dev `author` is immutable and takes the founder coins. If ownership could move, the owner
    /// and the author would be two different people and every rule written about "the author"
    /// would stop meaning one thing.
    function transferOwnership(address) public pure override {
        revert OwnershipIsPermanent();
    }

    // ---- views ----

    /// @dev One coin as the outside sees it: its storage plus the four numbers that come from
    /// the vault's share price.
    struct CoinInfo {
        uint64 seed;
        uint16 slot;
        uint8 backingClass;
        bool founder;
        bool sealed_;
        address renderer;
        uint256 series;
        uint256 number;
        uint256 shares;
        uint256 principal;
        uint256 claimed;
        uint256 requestId;
        uint256 mintedAt;
        uint256 redeemableAt;
        uint256 nav;
        uint256 profit;
        uint256 lifetime;
        uint32 yieldBps;
    }

    function coinOf(uint256 id) external view returns (CoinInfo memory info) {
        _requireOwned(id);
        Coin storage c = _coins[id];
        uint256 n = VAULT.convertToAssets(c.shares);
        uint256 p = n > c.principal ? n - c.principal : 0;
        uint256 life = c.claimed + p;
        uint256 bps = c.principal == 0 ? 0 : life * BPS / c.principal;
        info.seed = c.seed;
        info.slot = c.slot;
        info.backingClass = c.backingClass;
        info.founder = c.founder;
        info.sealed_ = c.slot == SEALED_SLOT;
        info.renderer = c.renderer;
        info.series = seriesOf(id);
        info.number = numberOf(id);
        info.shares = c.shares;
        info.principal = c.principal;
        info.claimed = c.claimed;
        info.requestId = c.requestId;
        info.mintedAt = c.mintedAt;
        info.redeemableAt = uint256(c.mintedAt) + REDEEM_LOCK;
        info.nav = n;
        info.profit = p;
        info.lifetime = life;
        info.yieldBps = bps > MAX_YIELD_BPS ? MAX_YIELD_BPS : uint32(bps);
    }

    /// @dev The coin as the renderer sees it. A sealed coin hands over no seed and no master.
    function viewOf(uint256 id) public view returns (CoinView memory v) {
        _requireOwned(id);
        Coin storage c = _coins[id];
        bool sealed_ = c.slot == SEALED_SLOT;
        v = CoinView({
            seed: sealed_ ? 0 : c.seed,
            number: uint16(numberOf(id)),
            series: uint16(seriesOf(id)),
            backing: backingDollarsOf(c.backingClass),
            yieldBps: yieldBps(id),
            master: sealed_ || c.slot >= MASTERS ? NO_MASTER : uint8(c.slot),
            founder: c.founder,
            sealed_: sealed_,
            fundedUnits: c.principal,
            lifetimeUnits: lifetime(id)
        });
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return ICoinRenderer(_coins[id].renderer).tokenURI(viewOf(id));
    }

    function svgOf(uint256 id) external view returns (string memory) {
        _requireOwned(id);
        return ICoinRenderer(_coins[id].renderer).svg(viewOf(id));
    }

    /// @return the coin's art slot, SEALED_SLOT while the VRF has not answered
    function slotOf(uint256 id) external view returns (uint16) {
        _requireOwned(id);
        return _coins[id].slot;
    }

    /// @return the coin's randomness, 0 while the VRF has not answered
    function seedOf(uint256 id) external view returns (uint64) {
        _requireOwned(id);
        return _coins[id].seed;
    }

    /// @return the unix time the coin was minted
    function mintedAt(uint256 id) public view returns (uint256) {
        _requireOwned(id);
        return _coins[id].mintedAt;
    }

    /// @return the first unix time the coin can be burned, thirty days after its mint
    function redeemableAt(uint256 id) public view returns (uint256) {
        _requireOwned(id);
        return uint256(_coins[id].mintedAt) + REDEEM_LOCK;
    }

    /// @return the first unix time the coin can be burned even if it never got its art
    function sealedEscapeAt(uint256 id) public view returns (uint256) {
        _requireOwned(id);
        return uint256(_coins[id].mintedAt) + SEALED_ESCAPE;
    }

    /// @return the vault shares the coin holds
    function sharesOf(uint256 id) external view returns (uint256) {
        _requireOwned(id);
        return _coins[id].shares;
    }

    /// @return the renderer this coin was pinned to at mint
    function rendererOf(uint256 id) external view returns (address) {
        _requireOwned(id);
        return _coins[id].renderer;
    }
}
