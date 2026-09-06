// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {OneCoin} from "../src/OneCoin.sol";
import {ICoinRenderer, CoinView} from "../src/ICoinRenderer.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockVault} from "./mocks/MockVault.sol";
import {MockVRFCoordinator} from "./mocks/MockVRFCoordinator.sol";
import {MockRenderer, MockRendererV2, BadMockRenderer} from "./mocks/MockRenderer.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {CoinRenderer} from "../src/CoinRenderer.sol";
import {MasterRenderer} from "../src/MasterRenderer.sol";
import {CoinMetadata} from "../src/CoinMetadata.sol";

contract OneCoinTest is Test {
    OneCoin internal token;
    MockUSDC internal usdc;
    MockVault internal vault;
    MockVRFCoordinator internal vrf;
    MockRenderer internal renderer;

    address internal author = address(0xA07401);
    address internal buyer = address(0xB0B);
    address internal holder = address(0xC01);
    address internal stranger = address(0xDEAD);

    bytes32 internal constant KEY_HASH = keccak256("base lane");
    uint256 internal constant SUB_ID = 4242;
    uint256 internal constant FEE = 0.00005 ether;
    uint32 internal constant CALLBACK_GAS = 800_000;

    /// @dev Slots of `nextId` and `minted`, from `forge inspect OneCoin storage`. Used to walk
    /// the id counter without minting thousands of coins first. `_jumpTo` checks the write
    /// landed, so a change to the storage layout fails here instead of quietly skewing tests.
    uint256 internal constant SLOT_NEXT_ID = 14;
    uint256 internal constant SLOT_MINTED = 15;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(usdc);
        vrf = new MockVRFCoordinator();
        renderer = new MockRenderer();
        token = new OneCoin(
            "ONE",
            "ONE",
            author,
            address(usdc),
            address(vault),
            address(renderer),
            address(vrf),
            KEY_HASH,
            SUB_ID,
            FEE,
            CALLBACK_GAS
        );
        vm.deal(author, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(holder, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    /// @dev Move past the thirty day lock so a revealed coin can be burned.
    function _ripen() internal {
        vm.warp(block.timestamp + token.REDEEM_LOCK());
    }

    // ---- helpers ----

    function _buy(address who, uint8 class, uint8 count, address to) internal returns (uint256 firstId) {
        uint256 total = token.backingOf(class) * count;
        usdc.mint(who, total);
        vm.startPrank(who);
        usdc.approve(address(token), total);
        firstId = token.mint{value: FEE}(class, count, to);
        vm.stopPrank();
    }

    function _lastRequest() internal view returns (uint256) {
        return vrf.lastRequestId();
    }

    function _reveal(uint256 requestId, uint256 entropy) internal {
        vrf.fulfillWithSeed(requestId, entropy);
    }

    /// @dev Move the id counter so the next mint lands on `id`.
    function _jumpTo(uint256 id) internal {
        vm.store(address(token), bytes32(SLOT_NEXT_ID), bytes32(id));
        vm.store(address(token), bytes32(SLOT_MINTED), bytes32(id - 1));
        assertEq(token.nextId(), id, "SLOT_NEXT_ID is stale, re-read forge inspect OneCoin storage");
        assertEq(token.minted(), id - 1, "SLOT_MINTED is stale, re-read forge inspect OneCoin storage");
    }

    /// @dev Walk the series to the first coin of band `k`, where founder coin k must be minted.
    function _enterBand(uint256 k) internal {
        _jumpTo(token.FOUNDER_PACE() * (k - 1) + 1);
    }

    /// @dev Mint band `k`'s founder coin. Each band holds exactly one, so a test that wants
    /// several walks several bands.
    function _founderInBand(uint256 k, address to) internal returns (uint256 id) {
        _enterBand(k);
        vm.prank(author);
        id = token.mintFounder{value: FEE}(1, to);
    }

    function _view(
        uint64 seed,
        uint16 number,
        uint16 series,
        uint8 backing,
        uint32 yieldBps,
        uint8 master,
        bool founder,
        bool sealed_,
        uint256 funded,
        uint256 life
    ) internal pure returns (CoinView memory) {
        return CoinView({
            seed: seed,
            number: number,
            series: series,
            backing: backing,
            yieldBps: yieldBps,
            master: master,
            founder: founder,
            sealed_: sealed_,
            fundedUnits: funded,
            lifetimeUnits: life
        });
    }

    // ---- deploy ----

    function test_ConstructorWiresEverything() public view {
        assertEq(token.owner(), author);
        assertEq(token.author(), author);
        assertEq(address(token.USDC()), address(usdc));
        assertEq(address(token.VAULT()), address(vault));
        assertEq(token.vrfCoordinator(), address(vrf));
        assertEq(token.keyHash(), KEY_HASH);
        assertEq(token.subId(), SUB_ID);
        assertEq(token.renderer(), address(renderer));
        assertEq(token.nextId(), 1);
        assertEq(token.urnLeft(1), 10000);
        assertEq(token.mastersLeft(1), 50);
    }

    function test_ConstructorRejectsVaultWithWrongAsset() public {
        MockUSDC other = new MockUSDC();
        MockVault wrong = new MockVault(other);
        vm.expectRevert(
            abi.encodeWithSelector(OneCoin.BadVault.selector, address(wrong), address(other))
        );
        new OneCoin(
            "ONE", "ONE", author, address(usdc), address(wrong), address(renderer), address(vrf), KEY_HASH, SUB_ID, FEE, CALLBACK_GAS
        );
    }

    function test_ConstructorRejectsRendererThatDoesNotKnowFiftyMasters() public {
        BadMockRenderer bad = new BadMockRenderer();
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRenderer.selector, address(bad)));
        new OneCoin(
            "ONE", "ONE", author, address(usdc), address(vault), address(bad), address(vrf), KEY_HASH, SUB_ID, FEE, CALLBACK_GAS
        );
    }

    function test_ConstructorRejectsRendererWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRenderer.selector, stranger));
        new OneCoin(
            "ONE", "ONE", author, address(usdc), address(vault), stranger, address(vrf), KEY_HASH, SUB_ID, FEE, CALLBACK_GAS
        );
    }

    // ---- mint ----

    function test_MintPullsExactUsdcAndDepositsIt() public {
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        uint256 firstId = token.mint{value: FEE}(1, 3, holder);
        vm.stopPrank();

        assertEq(firstId, 1);
        assertEq(usdc.balanceOf(buyer), 100e6 - 75e6, "took exactly three times 25 USDC");
        assertEq(usdc.balanceOf(address(token)), 0, "nothing stays in the token");
        assertEq(usdc.balanceOf(address(vault)), 75e6, "all of it went into the vault");
        assertEq(usdc.allowance(address(token), address(vault)), 0, "no allowance is left dangling");
        assertEq(token.balanceOf(holder), 3);
        assertEq(token.ownerOf(1), holder);
        assertEq(token.ownerOf(3), holder);
        assertEq(token.nextId(), 4);
        assertEq(token.minted(), 3);
    }

    function test_MintSplitsSharesEvenlyWithTheRemainderOnTheLastCoin() public {
        // Move the share price off 1:1 so the deposit buys a number of shares that does not
        // divide by three, and the remainder has somewhere to go.
        _buy(buyer, 0, 1, holder);
        vault.gain(7);

        uint256 before = vault.balanceOf(address(token));
        _buy(buyer, 1, 3, holder);
        uint256 bought = vault.balanceOf(address(token)) - before;

        uint256 per = bought / 3;
        assertEq(token.sharesOf(2), per);
        assertEq(token.sharesOf(3), per);
        assertEq(token.sharesOf(4), bought - per * 2);
        assertEq(token.sharesOf(2) + token.sharesOf(3) + token.sharesOf(4), bought, "no share is lost");
        assertGe(token.sharesOf(4), token.sharesOf(2), "the remainder goes to the last coin");
    }

    function test_MintSetsPrincipalAndSealsTheCoin() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        OneCoin.CoinInfo memory c = token.coinOf(id);
        assertEq(c.principal, 50e6);
        assertEq(c.claimed, 0);
        assertEq(c.backingClass, 2);
        assertFalse(c.founder);
        assertTrue(c.sealed_);
        assertEq(c.slot, token.SEALED_SLOT());
        assertEq(c.seed, 0);
        assertEq(c.renderer, address(renderer));
        assertEq(c.series, 1);
        assertEq(c.number, 1);
        assertGt(c.requestId, 0);
    }

    function test_MintOpensOneVrfRequestForTheWholeBatch() public {
        _buy(buyer, 0, 7, holder);
        assertEq(vrf.requestCount(), 1);
        uint256 rid = _lastRequest();
        assertEq(vrf.numWordsOf(rid), 7);
        assertEq(vrf.consumerOf(rid), address(token));
        for (uint256 id = 1; id <= 7; id++) {
            assertEq(token.coinOf(id).requestId, rid);
        }
    }

    function test_MintRejectsBadInput() public {
        usdc.mint(buyer, 1000e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadCount.selector, uint8(0)));
        token.mint{value: FEE}(0, 0, holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadCount.selector, uint8(11)));
        token.mint{value: FEE}(0, 11, holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRecipient.selector));
        token.mint{value: FEE}(0, 1, address(0));
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadBackingClass.selector, uint8(3)));
        token.mint{value: FEE}(3, 1, holder);
        vm.stopPrank();
    }

    function test_MintNeedsTheUsdc() public {
        vm.prank(buyer);
        vm.expectRevert();
        token.mint{value: FEE}(0, 1, holder);
    }

    // ---- founder mint ----

    function test_MintFounderIsFreeUnbackedAndSealed() public {
        uint256 f = _founderInBand(1, author);
        assertEq(f, 1, "band one is coins 1 to 200, so the first founder coin can be coin one");
        uint256 second = _founderInBand(2, author);
        assertEq(second, 201, "and the next one waits for band two");
        assertEq(usdc.balanceOf(address(vault)), 0, "no money moved");
        OneCoin.CoinInfo memory c = token.coinOf(f);
        assertTrue(c.founder);
        assertTrue(c.sealed_);
        assertEq(c.principal, 0);
        assertEq(c.shares, 0);
        assertEq(c.backingClass, 2, "a founder coin is a fifty");
        assertEq(token.ownerOf(f), author);
        assertEq(token.ownerOf(second), author);
        assertEq(token.founderCount(), 2);
        assertEq(token.founderMinted(1), 2);
    }

    function test_MintFounderOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.mintFounder{value: FEE}(1, stranger);
    }

    /// @dev Pacing counts the coin being minted, so founder coin k lands on coin 200k of the
    /// series and the fiftieth lands on coin 10000, the last one. All fifty reserved slots are
    /// reachable and the last founder coin closes its series.
    /// @dev Every one of the fifty bands can be taken, and the fiftieth is coins 9801 to 10000,
    /// so the last founder coin of a series can be its last coin.
    function test_AllFiftyBandsAreReachableAndTheFiftiethClosesTheSeries() public {
        for (uint256 band = 1; band <= 49; band++) {
            _founderInBand(band, author);
        }
        assertEq(token.founderMinted(1), 49);
        assertEq(token.lastFounderBand(1), 49);

        (uint256 k, uint256 opensAt, uint256 closesAt,) = token.founderWindow(1);
        assertEq(k, 50);
        assertEq(opensAt, 9801, "band fifty is coins 9801 to 10000");
        assertEq(closesAt, 10000);

        // The very last coin of the series is still inside band fifty.
        _jumpTo(10000);
        (,,, bool open) = token.founderWindow(1);
        assertTrue(open);
        vm.prank(author);
        uint256 id = token.mintFounder{value: FEE}(1, author);
        assertEq(id, 10000);
        assertEq(token.numberOf(id), 10000, "the fiftieth founder closes the series");
        assertEq(token.founderMinted(1), 50, "all fifty reserved slots were reachable");
    }

    function test_OneFounderCoinPerBandAndTheNextOneWaits() public {
        (uint256 k, uint256 opensAt, uint256 closesAt, bool open) = token.founderWindow(1);
        assertEq(k, 1);
        assertEq(opensAt, 1);
        assertEq(closesAt, 200);
        assertTrue(open, "band one is open from the first coin of the series");

        vm.prank(author);
        assertEq(token.mintFounder{value: FEE}(1, author), 1);
        assertEq(token.lastFounderBand(1), 1);

        // Band one is spent, so the next founder coin belongs to band two and has to wait for it.
        (k, opensAt, closesAt, open) = token.founderWindow(1);
        assertEq(k, 2);
        assertEq(opensAt, 201);
        assertEq(closesAt, 400);
        assertFalse(open, "the series is still standing in band one");

        vm.prank(author);
        vm.expectRevert(
            abi.encodeWithSelector(OneCoin.FounderTooEarly.selector, uint256(1), uint256(2), uint256(201))
        );
        token.mintFounder{value: FEE}(1, author);

        // One coin short of band two is still short.
        _jumpTo(200);
        vm.prank(author);
        vm.expectRevert(
            abi.encodeWithSelector(OneCoin.FounderTooEarly.selector, uint256(1), uint256(2), uint256(201))
        );
        token.mintFounder{value: FEE}(1, author);

        _jumpTo(201);
        (,,, open) = token.founderWindow(1);
        assertTrue(open);
        vm.prank(author);
        assertEq(token.mintFounder{value: FEE}(1, author), 201);
    }

    /// @dev A band that closes with no founder coin in it is gone. The slot is never minted and
    /// the next founder coin belongs to whatever band the series has reached, so a missed band
    /// cannot wedge the queue.
    function test_ABandThatClosesEmptyIsForfeited() public {
        // Walk straight past bands one and two without minting.
        _jumpTo(401);
        assertEq(token.founderBand(1), 3, "the series is in band three and that is what is on offer");
        (uint256 k, uint256 opensAt, uint256 closesAt, bool open) = token.founderWindow(1);
        assertEq(k, 3);
        assertEq(opensAt, 401);
        assertEq(closesAt, 600);
        assertTrue(open);

        vm.prank(author);
        uint256 id = token.mintFounder{value: FEE}(1, author);
        assertEq(id, 401);
        assertEq(token.lastFounderBand(1), 3);
        assertEq(token.founderMinted(1), 1, "one coin minted, two bands forfeited for good");
        assertLt(token.founderMinted(1), token.lastFounderBand(1));
    }

    function test_TheWindowIsShutOnASeriesThatIsOverOrHasNotStarted() public {
        _jumpTo(10001);
        (,,, bool open) = token.founderWindow(1);
        assertFalse(open, "series one is behind us");
        assertEq(token.founderBand(1), 51, "and past its last band");

        (uint256 k,,, bool openNext) = token.founderWindow(3);
        assertEq(k, 1, "series three has not started, so band one is what waits there");
        assertFalse(openNext);
    }

    /// @dev A batch is judged coin by coin, and consecutive coins cannot each sit in their own
    /// two hundred coin band. So in practice the author mints one founder coin at a time.
    function test_AFounderBatchIsJudgedCoinByCoinSoBatchesDoNotFit() public {
        _jumpTo(401);
        // Coins at 401, 402 and 403 would have to be bands 3, 4 and 5. The second one is nowhere
        // near band four, which opens at 601.
        vm.prank(author);
        vm.expectRevert(
            abi.encodeWithSelector(OneCoin.FounderTooEarly.selector, uint256(1), uint256(4), uint256(601))
        );
        token.mintFounder{value: FEE}(3, author);

        // One at a time is the way.
        vm.prank(author);
        assertEq(token.mintFounder{value: FEE}(1, author), 401);
        assertEq(token.founderMinted(1), 1);
    }

    function test_MintFounderRefusesToCrossASeriesBoundary() public {
        _jumpTo(9996);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SeriesBoundary.selector, uint256(9996), uint256(10005)));
        token.mintFounder{value: FEE}(10, author);

        // A single coin inside the series is fine, and band fifty reaches its last id.
        _jumpTo(10000);
        vm.prank(author);
        uint256 lastOfSeries = token.mintFounder{value: FEE}(1, author);
        assertEq(lastOfSeries, 10000);
        assertEq(token.seriesOf(lastOfSeries), 1);
        assertEq(token.founderMinted(1), 1);
    }

    function test_BandsAndTheReserveAreCountedPerSeries() public {
        _founderInBand(1, author);
        _founderInBand(2, author);
        assertEq(token.founderMinted(1), 2);
        assertEq(token.lastFounderBand(1), 2);

        // Series two starts again from band one: 200 coins of series two, not of the collection.
        _jumpTo(10001);
        assertEq(token.founderBand(2), 1, "a fresh series is back in band one");
        vm.prank(author);
        uint256 id = token.mintFounder{value: FEE}(1, author);
        assertEq(token.seriesOf(id), 2);
        assertEq(token.numberOf(id), 1);
        assertEq(token.founderMinted(2), 1);
        assertEq(token.lastFounderBand(2), 1);
        assertEq(token.founderMinted(1), 2, "series one is untouched");
        assertEq(token.lastFounderBand(1), 2);
    }

    // ---- reveal ----

    function test_TokenUriBeforeFulfilShowsASealedCoin() public {
        uint256 id = _buy(buyer, 1, 1, holder);
        CoinView memory want = _view(0, 1, 1, 25, 0, 255, false, true, 25e6, 0);
        assertEq(token.tokenURI(id), string.concat("uri:", renderer.encode(want)));
        assertEq(token.svgOf(id), string.concat("svg:", renderer.encode(want)));
    }

    function test_FulfilSetsSeedAndSlotInIdOrder() public {
        uint256 firstId = _buy(buyer, 0, 3, holder);
        uint256 rid = _lastRequest();

        uint256[] memory words = new uint256[](3);
        // Low 64 bits are the seed, the rest drives the urn.
        words[0] = (uint256(11) << 64) | uint256(0xAAAA);
        words[1] = (uint256(22) << 64) | uint256(0xBBBB);
        words[2] = (uint256(33) << 64) | uint256(0xCCCC);

        vrf.fulfill(rid, words);

        assertEq(token.seedOf(firstId), 0xAAAA);
        assertEq(token.seedOf(firstId + 1), 0xBBBB);
        assertEq(token.seedOf(firstId + 2), 0xCCCC);
        // The urn had 10000, 9999 and 9998 slots left when each word arrived.
        assertEq(token.slotOf(firstId), uint16(11 % 10000));
        assertEq(token.slotOf(firstId + 1), uint16(22 % 9999));
        assertEq(token.urnLeft(1), 9997);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(token.coinOf(firstId + i).requestId, 0, "the request is closed on the coin");
            assertFalse(token.coinOf(firstId + i).sealed_);
        }
        (, uint16 stillOpen,,) = _request(rid);
        assertEq(stillOpen, 0, "the request is forgotten");
    }

    function _request(uint256 rid)
        internal
        view
        returns (uint64 firstId, uint16 count, uint256 blockNumber, bool replaced)
    {
        (firstId, count, blockNumber, replaced) = token.requests(rid);
    }

    function test_RevealedCoinShowsItsMasterOrNone() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(7) << 64) | uint256(123456);
        vrf.fulfill(_lastRequest(), words);

        assertEq(token.slotOf(id), 7);
        CoinView memory v = token.viewOf(id);
        assertEq(v.master, 7, "slot below fifty is a master");
        assertEq(v.seed, 123456);
        assertFalse(v.sealed_);
        assertEq(token.tokenURI(id), string.concat("uri:", renderer.encode(_view(123456, 1, 1, 50, 0, 7, false, false, 50e6, 0))));

        uint256 id2 = _buy(buyer, 2, 1, holder);
        uint256[] memory w2 = new uint256[](1);
        // The urn now holds 9999 slots; index 60 of what is left is not a master.
        w2[0] = (uint256(60) << 64) | uint256(9);
        vrf.fulfill(_lastRequest(), w2);
        assertGe(token.slotOf(id2), 50);
        assertEq(token.viewOf(id2).master, 255, "a procedural coin has no master");
    }

    function test_OnlyTheCoordinatorCanFulfil() public {
        _buy(buyer, 0, 1, holder);
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](1);
        words[0] = 1;
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSignature("OnlyCoordinatorCanFulfill(address,address)", stranger, address(vrf))
        );
        token.rawFulfillRandomWords(rid, words);
        assertTrue(token.coinOf(1).sealed_, "the coin is still sealed");
    }

    function test_FulfilOfAnUnknownRequestIsIgnoredNotReverted() public {
        _buy(buyer, 0, 1, holder);
        uint256[] memory words = new uint256[](1);
        words[0] = 1;
        // The coordinator must never see a revert, or the callback is stuck forever.
        vm.prank(address(vrf));
        token.rawFulfillRandomWords(999999, words);
        assertTrue(token.coinOf(1).sealed_);
    }

    function test_FulfilTwiceIsIgnored() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(5) << 64) | uint256(777);
        vrf.fulfill(rid, words);
        uint64 seed = token.seedOf(id);
        uint16 slot = token.slotOf(id);

        words[0] = (uint256(9) << 64) | uint256(888);
        vrf.fulfill(rid, words);
        assertEq(token.seedOf(id), seed, "the second answer changes nothing");
        assertEq(token.slotOf(id), slot);
        assertEq(token.urnLeft(1), 9999, "and draws nothing from the urn");
    }

    function test_ShortAnswerLeavesTheRequestOpen() public {
        _buy(buyer, 0, 5, holder);
        uint256 rid = _lastRequest();
        vrf.fulfillShort(rid, 3, 1);
        assertTrue(token.coinOf(1).sealed_, "no coin was half revealed");
        (, uint16 count,,) = _request(rid);
        assertEq(count, 5, "the request stays open for retry");
    }

    // ---- retry ----

    function test_RetryIsClosedBeforeTheWindow() public {
        _buy(buyer, 0, 2, holder);
        uint256 rid = _lastRequest();
        uint256 openAt = block.number + token.RETRY_BLOCKS() + 1;

        vm.expectRevert(abi.encodeWithSelector(OneCoin.RetryTooEarly.selector, rid, openAt));
        token.retry(rid);

        vm.roll(block.number + token.RETRY_BLOCKS());
        vm.expectRevert(abi.encodeWithSelector(OneCoin.RetryTooEarly.selector, rid, openAt));
        token.retry(rid);
    }

    function test_RetryAfterTheWindowOpensAFreshRequest() public {
        uint256 firstId = _buy(buyer, 0, 2, holder);
        uint256 rid = _lastRequest();

        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.prank(stranger);
        uint256 newRid = token.retry(rid);

        assertGt(newRid, rid);
        assertEq(vrf.numWordsOf(newRid), 2);
        assertEq(token.coinOf(firstId).requestId, newRid);
        assertEq(token.coinOf(firstId + 1).requestId, newRid);
        (, uint16 oldCount,, bool replaced) = _request(rid);
        assertEq(oldCount, 2, "the replaced request stays open so its answer still counts");
        assertTrue(replaced, "but it cannot be retried again");

        _reveal(newRid, 1);
        assertFalse(token.coinOf(firstId).sealed_);
        assertFalse(token.coinOf(firstId + 1).sealed_);
    }

    function test_ALateAnswerToARetriedRequestIsIgnored() public {
        uint256 firstId = _buy(buyer, 0, 1, holder);
        uint256 rid = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 newRid = token.retry(rid);
        _reveal(newRid, 5);
        uint64 seed = token.seedOf(firstId);

        _reveal(rid, 999);
        assertEq(token.seedOf(firstId), seed, "the coin keeps the answer it got");
        assertEq(token.urnLeft(1), 9999, "and the urn was drawn from once");
    }

    function test_RetryOfAnUnknownRequestReverts() public {
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NoSuchRequest.selector, uint256(7)));
        token.retry(7);
    }

    // ---- the steering hole Cato found ----

    /// @dev The attack: Chainlink's answer is a public transaction, so a holder can read the
    /// words before they land, work out which slot each coin of the batch would get, and burn
    /// chosen sealed coins ahead of the fulfilment. Each burn used to remove one urn draw, which
    /// shifted `pick = rand % left` for every coin behind it. Two coins are enough to show it.
    function test_BurningASealedCoinCannotShiftTheSlotOfTheCoinBehindIt() public {
        uint256 firstId = _buy(buyer, 0, 2, holder);
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](2);
        words[0] = uint256(100) << 64;
        words[1] = uint256(10000) << 64;

        // The attacker reads the words and tries to burn the first coin. With both draws the
        // urn holds 9999 when the second word arrives, so 10000 % 9999 is 1 and the coin lands
        // on slot 1. Without the first draw the urn would still hold 10000, 10000 % 10000 is 0,
        // and the coin would land on slot 0 instead. Slot 0 is the master the attacker is aiming
        // at, and picking between two slots of the fifty is the whole exploit.
        _ripen();
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SealedCoin.selector, firstId));
        token.redeem(firstId);

        vrf.fulfill(rid, words);
        assertEq(token.slotOf(firstId), 100, "the first coin draws from a full urn");
        assertEq(token.slotOf(firstId + 1), 1, "and the second gets what it was always going to");
        assertTrue(token.slotOf(firstId) != 0 && token.slotOf(firstId + 1) != 0, "slot 0 stayed in the urn");
        assertEq(token.urnLeft(1), 9998, "a two coin batch always costs two draws");
        assertEq(token.mastersLeft(1), 49, "one master left the urn, the one the urn chose");
    }

    /// @dev The other half of the same fix: the number of draws a batch costs is decided at mint,
    /// so a coin the request no longer covers cannot change it. Here the batch is answered by a
    /// sibling request first, and the late answer must draw nothing at all.
    function test_ABatchCostsTheSameDrawsHoweverManyAnswersArrive() public {
        uint256 firstId = _buy(buyer, 0, 3, holder);
        uint256 a = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 b = token.retry(a);

        _reveal(b, 5);
        assertEq(token.urnLeft(1), 9997, "three coins, three draws");
        uint16 s0 = token.slotOf(firstId);
        uint16 s1 = token.slotOf(firstId + 1);
        uint16 s2 = token.slotOf(firstId + 2);

        _reveal(a, 6);
        assertEq(token.urnLeft(1), 9997, "the late answer drew nothing");
        assertEq(token.slotOf(firstId), s0, "and moved nothing");
        assertEq(token.slotOf(firstId + 1), s1);
        assertEq(token.slotOf(firstId + 2), s2);
    }

    // ---- the coordinator can hand this consumer on ----

    function test_OnlyTheCoordinatorOrTheAuthorCanMoveTheConsumer() public {
        MockVRFCoordinator next = new MockVRFCoordinator();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSignature("OnlyCoordinatorCanSet(address,address)", stranger, address(vrf))
        );
        token.setCoordinator(address(next));

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSignature("OnlyCoordinatorCanSet(address,address)", holder, address(vrf)));
        token.setCoordinator(address(next));

        vm.prank(address(vrf));
        vm.expectRevert(abi.encodeWithSignature("ZeroCoordinator()"));
        token.setCoordinator(address(0));

        assertEq(token.vrfCoordinator(), address(vrf), "nothing moved");
    }

    /// @dev The coordinator refuses to migrate a subscription while a request is still pending,
    /// which is the one case that needs migrating. So the author can finish the move.
    function test_TheAuthorCanFinishAMigrationTheCoordinatorCannot() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        MockVRFCoordinator next = new MockVRFCoordinator();

        vm.prank(author);
        token.setCoordinator(address(next));
        assertEq(token.vrfCoordinator(), address(next));

        // It moves the coordinator and nothing else: the coin, its shares and its money are where
        // they were, and the author still cannot touch them.
        assertEq(token.ownerOf(id), holder);
        assertGt(token.sharesOf(id), 0);
        assertEq(usdc.balanceOf(author), 0);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSignature("OnlyCoordinatorCanSet(address,address)", stranger, address(next))
        );
        token.setCoordinator(address(vrf));
    }

    function test_AfterAMigrationTheNewCoordinatorAnswersAndTheOldOneCannot() public {
        MockVRFCoordinator next = new MockVRFCoordinator();
        vm.prank(address(vrf));
        token.setCoordinator(address(next));
        assertEq(token.vrfCoordinator(), address(next));

        uint256 id = _buy(buyer, 0, 1, holder);
        assertEq(next.requestCount(), 1, "requests go to the new coordinator");
        assertEq(next.nativeFunded(SUB_ID), FEE, "and so does the fee");
        uint256 rid = next.lastRequestId();

        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(11) << 64) | uint256(22);
        vm.prank(address(vrf));
        vm.expectRevert(
            abi.encodeWithSignature("OnlyCoordinatorCanFulfill(address,address)", address(vrf), address(next))
        );
        token.rawFulfillRandomWords(rid, words);
        assertTrue(token.coinOf(id).sealed_, "the retired coordinator is not trusted any more");

        next.fulfill(rid, words);
        assertEq(token.slotOf(id), 11, "the new one is");
        assertEq(token.seedOf(id), 22);
    }

    // ---- the urn ----

    function test_UrnGivesEverySlotOnceAndExactlyFiftyMasters() public {
        uint256 batch = token.MAX_BATCH();
        uint256 batches = 10000 / batch;
        usdc.mint(buyer, 10000 * 10e6);
        vm.deal(buyer, 10 ether);
        vm.prank(buyer);
        usdc.approve(address(token), type(uint256).max);

        bool[] memory seen = new bool[](10000);
        uint256 masters = 0;
        uint256 burned = 0;

        for (uint256 b = 0; b < batches; b++) {
            vm.prank(buyer);
            uint256 firstId = token.mint{value: FEE}(0, uint8(batch), buyer);
            vrf.fulfillWithSeed(_lastRequest(), b);
            for (uint256 i = 0; i < batch; i++) {
                uint16 slot = token.slotOf(firstId + i);
                assertLt(slot, 10000, "every slot is inside the series");
                assertFalse(seen[slot], "no slot came out twice");
                seen[slot] = true;
                if (slot < token.MASTERS()) masters++;
            }
            // Every hundredth batch, burn the coins of an older one. A burn must not move the
            // urn: the draws a batch costs were spent when it was answered and are not refunded.
            if (b > 0 && b % 100 == 0) {
                uint256 left = token.urnLeft(1);
                uint256 victim = firstId - batch * 50;
                vm.warp(block.timestamp + token.REDEEM_LOCK());
                for (uint256 i = 0; i < batch; i++) {
                    vm.prank(buyer);
                    token.redeem(victim + i);
                    burned++;
                }
                assertEq(token.urnLeft(1), left, "burning revealed coins left the urn alone");
            }
        }

        assertGt(burned, 0, "the burns really happened");
        assertEq(token.urnLeft(1), 0, "ten thousand ids, ten thousand draws, however many burns");
        assertEq(token.mastersLeft(1), 0);
        assertEq(masters, 50, "exactly fifty masters in the series");
        assertEq(token.urnLeft(2), 10000, "and the next series starts full");
    }

    function test_AMintAcrossASeriesBoundaryDrawsFromBothUrns() public {
        _jumpTo(9999);
        _buy(buyer, 0, 4, holder);
        _reveal(_lastRequest(), 3);
        // Coins 9999 and 10000 are series one; 10001 and 10002 are series two.
        assertEq(token.urnLeft(1), 9998);
        assertEq(token.urnLeft(2), 9998);
        assertEq(token.viewOf(9999).series, 1);
        assertEq(token.viewOf(10001).series, 2);
        assertEq(token.viewOf(10001).number, 1);
        assertEq(token.viewOf(10000).number, 10000);
    }

    function test_RetryCannotThrowAwayAnAnswerThatIsAlreadyOnItsWay() public {
        // The grinding move: mint, wait out the retry window, watch the coordinator's answer
        // in the mempool, dislike the slot, and retry to draw again. It must not work.
        uint256 id = _buy(buyer, 0, 1, holder);
        uint256 rid = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);

        vm.prank(stranger);
        uint256 newRid = token.retry(rid);

        // The answer the attacker tried to outrun lands anyway, and it is the one that counts.
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(3) << 64) | uint256(4242);
        vrf.fulfill(rid, words);

        assertEq(token.slotOf(id), 3, "the first answer to land decides the slot");
        assertEq(token.seedOf(id), 4242);

        // The fresh request cannot overwrite it.
        _reveal(newRid, 99);
        assertEq(token.slotOf(id), 3, "the second answer changes nothing");
        assertEq(token.urnLeft(1), 9999, "and the urn was drawn from once");
    }

    /// @dev A fulfilled request is deleted, so it reports NoSuchRequest. NothingToRetry is for
    /// the other case: a request still on the books whose coins were revealed by a sibling
    /// request or burned.
    function test_RetryRevertsOnceEveryCoinOfTheRequestIsRevealed() public {
        _buy(buyer, 0, 2, holder);
        uint256 rid = _lastRequest();
        _reveal(rid, 1);
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NoSuchRequest.selector, rid));
        token.retry(rid);
    }

    function test_RetryRevertsWhenASiblingRequestAlreadyAnsweredTheBatch() public {
        _buy(buyer, 0, 2, holder);
        uint256 a = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 b = token.retry(a);

        // The older request answers first, so the batch is done and b has nothing left to ask.
        _reveal(a, 7);
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingToRetry.selector, b));
        token.retry(b);
    }

    function test_RetriesFormAChainNotADoublingTree() public {
        _buy(buyer, 0, 1, holder);
        uint256 a = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 b = token.retry(a);
        assertEq(vrf.requestCount(), 2);

        // The replaced request is spent, now and after any wait.
        vm.expectRevert(abi.encodeWithSelector(OneCoin.AlreadyRetried.selector, a));
        token.retry(a);
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.AlreadyRetried.selector, a));
        token.retry(a);
        assertEq(vrf.requestCount(), 2, "the old request spawned nothing more");

        // Only the newest one carries on, so a batch costs at most one request per window.
        uint256 c = token.retry(b);
        assertEq(vrf.requestCount(), 3);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.AlreadyRetried.selector, b));
        token.retry(b);
        assertGt(c, b);
        assertGt(b, a);
    }

    function test_ARetryIsStillClosedBeforeItsOwnWindow() public {
        _buy(buyer, 0, 1, holder);
        uint256 a = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 b = token.retry(a);
        uint256 openAt = block.number + token.RETRY_BLOCKS() + 1;
        vm.expectRevert(abi.encodeWithSelector(OneCoin.RetryTooEarly.selector, b, openAt));
        token.retry(b);
    }

    function test_MintRefusesADepositThatBuysNoShares() public {
        vault.setSwallow(true);
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadDeposit.selector, uint256(30e6), uint256(0)));
        token.mint{value: FEE}(0, 3, holder);
        vm.stopPrank();
        assertEq(usdc.balanceOf(buyer), 100e6, "the money never left the buyer");
        assertEq(token.minted(), 0);
    }

    // ---- claim ----

    function test_ClaimPaysTheYieldKeepsTheFeeAndLeavesThePrincipal() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        uint256 shares = token.sharesOf(id);
        vault.gain(20e6);

        uint256 nav = token.nav(id);
        uint256 gain = nav - 50e6;
        uint256 fee = gain * 1000 / 10000;
        uint256 outShares = shares * (gain - fee) / nav;
        // The fee is a ninth of what the holder got, rounded up, so the odd unit goes to the author.
        uint256 feeShares = (outShares * 1000 + 8999) / 9000;

        vm.prank(holder);
        uint256 paid = token.claim(id);

        assertEq(usdc.balanceOf(holder), paid, "the money went to the owner");
        assertApproxEqAbs(paid, gain - fee, 2, "the owner got the yield less ten percent");
        assertEq(token.treasuryShares(), feeShares, "the fee stayed as treasury shares");
        assertEq(token.sharesOf(id), shares - feeShares - outShares);
        // `claimed` is a record of money that moved, so it is the payout plus the fee, which can
        // sit a unit above the gain on paper because the fee rounds up.
        assertEq(token.coinOf(id).claimed, paid + vault.convertToAssets(token.treasuryShares()));
        assertApproxEqAbs(token.coinOf(id).claimed, gain, 2);
        assertApproxEqAbs(token.nav(id), 50e6, 2, "the backing is still there");
        assertLe(token.profit(id), 2, "nothing left to claim but rounding dust");
    }

    function test_ClaimDoesNotResetLifetimeYield() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(25e6);
        uint32 before = token.yieldBps(id);
        assertApproxEqAbs(before, 5000, 2, "fifty percent");

        vm.prank(holder);
        token.claim(id);
        assertApproxEqAbs(token.yieldBps(id), before, 2, "a claim does not reset the ring");

        vm.prank(holder);
        token.transferFrom(holder, stranger, id);
        assertApproxEqAbs(token.yieldBps(id), before, 2, "nor does a transfer");
    }

    function test_YieldBpsIsCapped() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        vault.gain(10_000e6);
        assertEq(token.yieldBps(id), token.MAX_YIELD_BPS());
        assertEq(token.viewOf(id).yieldBps, 100000);
    }

    function test_ClaimRevertsWithoutYield() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingToClaim.selector, id));
        token.claim(id);
    }

    function test_ClaimOnlyOwnerOrApproved() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(10e6);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NotOwnerNorApproved.selector, id, stranger));
        token.claim(id);

        vm.prank(holder);
        token.approve(stranger, id);
        vm.prank(stranger);
        uint256 paid = token.claim(id);
        assertGt(paid, 0);
        assertEq(usdc.balanceOf(holder), paid, "an approved caller still pays the owner");
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_ClaimThroughAnOperatorStillPaysTheOwner() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(10e6);
        vm.prank(holder);
        token.setApprovalForAll(stranger, true);
        vm.prank(stranger);
        token.claim(id);
        assertGt(usdc.balanceOf(holder), 0);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_AClaimNeverRaisesTheLifetimeCounterWithoutPayingOut() public {
        // A share price of exactly twenty five USDC a share. The coin holds two shares, so the
        // deposit loses nothing to rounding and passes the slippage guard, and a small gain is
        // worth less than the one share it would have to sell to pay it out.
        usdc.mint(address(this), 1);
        usdc.approve(address(vault), 1);
        vault.deposit(1, address(this));
        vault.gain(49_999_998);

        uint256 id = _buy(buyer, 2, 1, holder);
        assertEq(token.sharesOf(id), 2, "two shares");
        assertEq(token.nav(id), 50e6, "worth exactly the backing");

        vault.gain(2);
        assertEq(token.profit(id), 1, "one atomic unit of gain, on paper");

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingToClaim.selector, id));
        token.claim(id);
        assertEq(token.coinOf(id).claimed, 0, "a refused claim books nothing");
        assertEq(usdc.balanceOf(holder), 0, "and pays nothing");

        // Asking again changes nothing, which is the point: this used to be free inflation.
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingToClaim.selector, id));
        token.claim(id);
        assertEq(token.coinOf(id).claimed, 0);

        // A gain worth a whole share pays, and only then does the counter move.
        vault.gain(300e6);
        vm.prank(holder);
        assertGt(token.claim(id), 0);
        assertGt(token.coinOf(id).claimed, 0);
    }

    function test_AClaimThatWithdrawsNothingBooksNothing() public {
        // A share price under one atomic USDC unit: the coin holds shares that are worth
        // something on paper and redeem to zero.
        usdc.mint(address(this), 100);
        usdc.approve(address(vault), 100);
        vault.deposit(100, address(this));
        vault.lose(1);

        uint256 id = _buy(buyer, 0, 1, holder);
        uint256 sharesBefore = token.sharesOf(id);
        vault.gain(2);

        vm.prank(holder);
        try token.claim(id) returns (uint256 paid) {
            assertGt(paid, 0, "a claim that goes through always pays real USDC");
        } catch (bytes memory reason) {
            assertEq(reason, abi.encodeWithSelector(OneCoin.NothingToClaim.selector, id));
        }
        if (usdc.balanceOf(holder) == 0) {
            assertEq(token.coinOf(id).claimed, 0, "nothing paid, nothing booked");
            assertEq(token.sharesOf(id), sharesBefore, "and no share was spent");
        }
    }

    // ---- redeem ----

    function test_RedeemAfterAGainBurnsAndPaysBackingPlusYieldLessFee() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        uint256 shares = token.sharesOf(id);
        vault.gain(20e6);
        _ripen();

        uint256 nav = token.nav(id);
        uint256 gain = nav - 50e6;
        uint256 fee = gain * 1000 / 10000;
        uint256 feeShares = (shares * fee + nav - 1) / nav; // the fee rounds up, to the author

        vm.prank(holder);
        uint256 assets = token.redeem(id);

        assertEq(usdc.balanceOf(holder), assets);
        assertApproxEqAbs(assets, nav - fee, 2, "everything the coin held, less the fee on the yield");
        assertEq(token.treasuryShares(), feeShares);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        token.ownerOf(id);
        assertEq(token.balanceOf(holder), 0);
    }

    function test_RedeemAfterALossTakesNoFeeAndPaysWhatIsLeft() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        vault.lose(10e6);
        _ripen();

        uint256 nav = token.nav(id);
        assertLt(nav, 50e6, "the vault lost money");

        vm.prank(holder);
        uint256 assets = token.redeem(id);

        assertEq(token.treasuryShares(), 0, "no fee on a loss");
        assertApproxEqAbs(assets, nav, 2, "the owner gets what the coin is worth");
        assertEq(usdc.balanceOf(holder), assets);
    }

    function test_RedeemOfASealedCoinReverts() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        assertTrue(token.coinOf(id).sealed_);
        _ripen();
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SealedCoin.selector, id));
        token.redeem(id);

        // Once the answer lands and the lock is past, it burns like any other coin.
        _reveal(_lastRequest(), 1);
        vm.prank(holder);
        assertApproxEqAbs(token.redeem(id), 10e6, 2);
    }

    function test_RedeemIsClosedForThirtyDaysAfterTheMint() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        _reveal(_lastRequest(), 1);
        uint256 ready = token.mintedAt(id) + token.REDEEM_LOCK();
        assertEq(token.redeemableAt(id), ready);
        assertEq(token.coinOf(id).redeemableAt, ready);
        assertEq(token.coinOf(id).mintedAt, block.timestamp);

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.TooSoon.selector, id, ready));
        token.redeem(id);

        // One second short is still short.
        vm.warp(ready - 1);
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.TooSoon.selector, id, ready));
        token.redeem(id);

        vm.warp(ready);
        vm.prank(holder);
        assertGt(token.redeem(id), 0);
    }

    function test_ClaimingYieldIsOpenDuringTheLock() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        vault.gain(20e6);
        assertLt(block.timestamp, token.redeemableAt(id), "still inside the lock");

        vm.prank(holder);
        uint256 paid = token.claim(id);
        assertGt(paid, 0, "the yield is the holder's the whole time");
        assertEq(usdc.balanceOf(holder), paid);
    }

    function test_RedeemOnlyOwnerOrApproved() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        _reveal(_lastRequest(), 1);
        _ripen();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NotOwnerNorApproved.selector, id, stranger));
        token.redeem(id);

        vm.prank(holder);
        token.approve(stranger, id);
        vm.prank(stranger);
        token.redeem(id);
        assertGt(usdc.balanceOf(holder), 0);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_RedeemOfAnUnknownCoinReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(1)));
        token.redeem(1);
    }

    // ---- the randomness fee and the churn it stops ----

    function test_AMintPaysForItsOwnRandomness() public {
        assertEq(token.vrfFeeWei(), FEE);
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        uint256 ethBefore = buyer.balance;
        token.mint{value: FEE}(0, 3, holder);
        vm.stopPrank();

        assertEq(buyer.balance, ethBefore - FEE, "the minter paid it");
        assertEq(vrf.nativeFunded(SUB_ID), FEE, "and it reached the subscription");
        assertEq(address(token).balance, 0, "the token holds no ETH");
    }

    function test_AMintThatUnderpaysTheRandomnessReverts() public {
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FeeTooLow.selector, FEE, FEE - 1));
        token.mint{value: FEE - 1}(0, 1, holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FeeTooLow.selector, FEE, uint256(0)));
        token.mint{value: 0}(0, 1, holder);
        vm.stopPrank();
        assertEq(token.minted(), 0);
    }

    function test_OverpayingTheRandomnessAllGoesToTheSubscription() public {
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        token.mint{value: FEE * 4}(0, 1, holder);
        vm.stopPrank();
        assertEq(vrf.nativeFunded(SUB_ID), FEE * 4, "nothing is kept back");
        assertEq(address(token).balance, 0);
    }

    function test_AFounderMintPaysTheRandomnessFeeToo() public {
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FeeTooLow.selector, FEE, uint256(0)));
        token.mintFounder{value: 0}(1, author);

        _founderInBand(1, author);
        assertEq(vrf.nativeFunded(SUB_ID), FEE);
    }

    function test_ARetryIsFreeButCanCarryATopUp() public {
        _buy(buyer, 0, 1, holder);
        uint256 funded = vrf.nativeFunded(SUB_ID);
        uint256 a = _lastRequest();

        // Free, for a keeper that only wants to ask again.
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.prank(stranger);
        uint256 b = token.retry(a);
        assertEq(vrf.nativeFunded(SUB_ID), funded, "a bare retry funds nothing");

        // Or paid, so a subscription that has run dry cannot strand the batch. The mint bought
        // one answer; anyone who wants another can pay for it.
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.prank(stranger);
        uint256 c = token.retry{value: FEE * 2}(b);
        assertEq(vrf.nativeFunded(SUB_ID), funded + FEE * 2, "the top-up reached the subscription");
        assertEq(address(token).balance, 0, "and none of it stayed here");
        assertGt(c, b);
    }

    function test_EthForcedIntoTheContractGoesToTheAuthor() public {
        // selfdestruct is the one way in that no payable function guards.
        Selfdestructor bomb = new Selfdestructor{value: 1 ether}();
        bomb.blow(payable(address(token)));
        assertEq(address(token).balance, 1 ether);

        uint256 before = author.balance;
        vm.prank(stranger);
        token.sweep();
        assertEq(address(token).balance, 0);
        assertEq(author.balance, before + 1 ether, "it went to the author, not to the caller");
    }

    /// @dev The churn: mint ten, reveal, keep the masters, burn the rest, repeat. It used to be
    /// free and it billed the author's subscription every round. Now every round costs the fee
    /// up front and the coins cannot be burned for thirty days.
    function test_ChurningTheUrnCostsTheBotAndStallsForThirtyDays() public {
        usdc.mint(buyer, 10_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), type(uint256).max);

        uint256 ethBefore = buyer.balance;
        for (uint256 round = 0; round < 5; round++) {
            uint256 firstId = token.mint{value: FEE}(0, 10, buyer);
            vm.stopPrank();
            _reveal(_lastRequest(), round);
            vm.startPrank(buyer);
            for (uint256 i = 0; i < 10; i++) {
                uint256 id = firstId + i;
                vm.expectRevert(
                    abi.encodeWithSelector(OneCoin.TooSoon.selector, id, token.redeemableAt(id))
                );
                token.redeem(id);
            }
        }
        vm.stopPrank();

        assertEq(buyer.balance, ethBefore - FEE * 5, "five rounds, five fees");
        assertEq(vrf.nativeFunded(SUB_ID), FEE * 5, "all of it went to the subscription");
        assertEq(token.balanceOf(buyer), 50, "and the bot still holds every coin it drew");
        assertEq(token.urnLeft(1), 10000 - 50, "the urn does not refill");
    }

    // ---- the deposit has to be worth what was paid ----

    function test_MintRefusesADepositTheVaultShortChanges() public {
        // A share price where fifty USDC buys shares worth visibly less than fifty USDC.
        usdc.mint(address(this), 1);
        usdc.approve(address(vault), 1);
        vault.deposit(1, address(this));
        vault.gain(99_999_998);

        usdc.mint(buyer, 50e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 50e6);
        // One share, worth 50000000 at the moment of the check but bought for 50e6 after the
        // deposit moved the price, so the round trip loses more than a unit a coin.
        vm.expectRevert();
        token.mint{value: FEE}(0, 5, holder);
        vm.stopPrank();
        assertEq(token.minted(), 0);
    }

    // ---- the vault has limits and they are respected ----

    function test_MintRefusesWhenTheVaultWillNotTakeTheDeposit() public {
        vault.setDepositCap(20e6);
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.VaultFull.selector, uint256(30e6), uint256(20e6)));
        token.mint{value: FEE}(0, 3, holder);
        // What does fit still goes through.
        token.mint{value: FEE}(0, 2, holder);
        vm.stopPrank();
        assertEq(token.minted(), 2);
        assertEq(usdc.balanceOf(buyer), 80e6);
    }

    function test_AClaimTakesWhatTheVaultCanFreeAndBooksOnlyThat() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        vault.gain(20e6);
        uint256 wanted = token.profit(id);

        // The vault can free a tenth of the coin's shares and no more.
        vault.setRedeemCap(token.sharesOf(id) / 10);
        uint256 sharesBefore = token.sharesOf(id);

        vm.prank(holder);
        uint256 paid = token.claim(id);
        assertGt(paid, 0, "it paid what it could");
        assertLt(paid, wanted, "which is less than the whole gain");
        assertEq(usdc.balanceOf(holder), paid);
        assertEq(token.coinOf(id).claimed, paid + vault.convertToAssets(token.treasuryShares()), "booked what moved");
        assertLt(token.sharesOf(id), sharesBefore);

        // The rest is still the holder's and comes out once the vault can free it.
        assertGt(token.profit(id), 0, "the remainder stayed in the coin");
        vault.setRedeemCap(type(uint256).max);
        vm.prank(holder);
        assertGt(token.claim(id), 0);
    }

    function test_RedeemWaitsRatherThanBurnTheCoinIntoAnIlliquidVault() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        _ripen();
        uint256 shares = token.sharesOf(id);
        vault.setRedeemCap(shares / 2);

        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.VaultIlliquid.selector, shares, shares / 2));
        token.redeem(id);
        assertEq(token.ownerOf(id), holder, "the coin is still the holder's");
        assertEq(token.sharesOf(id), shares, "and still holds everything");

        vault.setRedeemCap(type(uint256).max);
        vm.prank(holder);
        assertGt(token.redeem(id), 0);
    }

    /// @dev The auditor's case. A coin worth 70 on a principal of 50 owes the holder 18 and the
    /// author 2. If the vault can only free part of it, the fee must follow what was released,
    /// or the part left behind is charged ten percent again on the next claim.
    function test_APartialClaimDoesNotChargeTheFeeTwiceOnTheSameGain() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        vault.gain(20e6);
        assertApproxEqAbs(token.nav(id), 70e6, 2, "principal 50, nav 70");
        assertApproxEqAbs(token.profit(id), 20e6, 2);

        // The vault frees a tenth of what the coin holds, so the first claim is part paid.
        vault.setRedeemCap(token.sharesOf(id) / 10);
        vm.prank(holder);
        uint256 first = token.claim(id);
        assertGt(first, 0);
        assertLt(first, 18e6, "only part of it came out");

        // Then the vault opens up and the rest follows.
        vault.setRedeemCap(type(uint256).max);
        vm.prank(holder);
        uint256 second = token.claim(id);

        uint256 toHolder = first + second;
        uint256 toAuthor = vault.convertToAssets(token.treasuryShares());
        assertApproxEqAbs(toHolder, 18e6, 3, "the holder ends with eighteen");
        assertApproxEqAbs(toAuthor, 2e6, 3, "and the author with two");
        assertApproxEqAbs(toHolder + toAuthor, 20e6, 3, "which is the whole gain, charged once");
        assertEq(usdc.balanceOf(holder), toHolder);
        assertApproxEqAbs(token.nav(id), 50e6, 3, "the backing is untouched");
    }

    function test_TheTreasuryWaitsOnAnIlliquidVaultRatherThanRevertInsideIt() public {
        uint256 f = _founderInBand(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(2000e6);
        vm.prank(holder);
        token.claim(id);
        assertEq(token.coinOf(f).principal, 50e6, "the founder coin is full, so the treasury is free");

        uint256 shares = token.treasuryShares();
        assertGt(shares, 0);
        vault.setRedeemCap(shares - 1);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.VaultIlliquid.selector, shares, shares - 1));
        token.withdrawTreasury(author);
        assertEq(token.treasuryShares(), shares, "nothing was spent on the attempt");

        vault.setRedeemCap(type(uint256).max);
        vm.prank(author);
        assertGt(token.withdrawTreasury(author), 0);
        assertEq(token.treasuryShares(), 0);
    }

    // ---- what is booked is what moved ----

    function test_LifetimeNeverExceedsWhatWasPaidOutPlusTheFee() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);

        // No founder coins here, so nothing leaves the treasury and the fee taken in a round is
        // exactly the treasury's growth, priced the moment it moved.
        assertEq(token.founderCount(), 0);
        uint256 paidTotal = 0;
        for (uint256 round = 0; round < 6; round++) {
            vault.gain(7_000_001);
            uint256 claimedBefore = token.coinOf(id).claimed;
            uint256 treasuryBefore = token.treasuryShares();

            vm.prank(holder);
            uint256 paid = token.claim(id);
            paidTotal += paid;

            uint256 feeAssets = vault.convertToAssets(token.treasuryShares() - treasuryBefore);
            assertEq(
                token.coinOf(id).claimed - claimedBefore,
                paid + feeAssets,
                "a round books the assets the owner got plus the assets the author got, and nothing else"
            );
        }
        assertEq(usdc.balanceOf(holder), paidTotal, "every booked payout really landed");
        assertGt(paidTotal, 0);
    }

    function test_TheRoundingUnitOnTheFeeFallsToTheAuthor() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        uint256 shares = token.sharesOf(id);
        vault.gain(7_777_777);
        uint256 nav = token.nav(id);
        uint256 gain = nav - 50e6;
        uint256 outShares = shares * (gain - gain * 1000 / 10000) / nav;

        vm.prank(holder);
        token.claim(id);
        assertEq(token.treasuryShares(), (outShares * 1000 + 8999) / 9000, "the fee took the rounding unit");
    }

    // ---- ownership cannot move at all ----

    function test_OwnershipCannotBeTransferred() public {
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.OwnershipIsPermanent.selector));
        token.transferOwnership(stranger);
        assertEq(token.owner(), author);
        assertEq(token.author(), author, "owner and author are the same person for good");
    }

    // ---- the way out of a dropped VRF request ----

    function test_ASealedCoinCanBeBurnedAfterHalfAYear() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        uint256 escape = token.mintedAt(id) + token.SEALED_ESCAPE();
        assertEq(token.sealedEscapeAt(id), escape);
        assertEq(token.SEALED_ESCAPE(), 180 days);

        // One day short of half a year it is still sealed shut.
        vm.warp(escape - 1 days);
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SealedCoin.selector, id));
        token.redeem(id);

        // One second short.
        vm.warp(escape - 1);
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SealedCoin.selector, id));
        token.redeem(id);

        // And then the door opens and the backing comes home.
        vm.warp(escape);
        vm.prank(holder);
        uint256 assets = token.redeem(id);
        assertApproxEqAbs(assets, 50e6, 2, "the principal, with no art and no fee");
        assertEq(usdc.balanceOf(holder), assets);
        assertEq(token.treasuryShares(), 0, "no yield, so no fee");
    }

    /// @dev The escape lets a sealed coin be burned, so a late answer can now arrive for a batch
    /// whose first coin is gone. What the batch costs the urn was fixed at its mint and must not
    /// change, or the old steering hole reopens on a six month delay.
    function test_ALateAnswerStillCostsTheUrnTheWholeBatchAfterAnEscape() public {
        uint256 firstId = _buy(buyer, 0, 3, holder);
        uint256 rid = _lastRequest();

        vm.warp(block.timestamp + token.SEALED_ESCAPE());
        vm.prank(holder);
        token.redeem(firstId);
        vm.prank(holder);
        token.redeem(firstId + 1);
        assertEq(token.balanceOf(holder), 1, "two of the three are gone");

        uint256[] memory words = new uint256[](3);
        words[0] = uint256(100) << 64;
        words[1] = uint256(200) << 64;
        words[2] = uint256(300) << 64;
        vrf.fulfill(rid, words);

        assertEq(token.urnLeft(1), 9997, "three ids, three draws, however many coins survived");
        assertEq(token.slotOf(firstId + 2), 300 % 9998, "and the survivor got the slot it was owed");
    }

    // ---- founder funding ----

    function test_FoundersAreFundedOldestFirst() public {
        uint256 f = _founderInBand(1, author);
        uint256 f2 = _founderInBand(2, author);
        uint256 f3 = _founderInBand(3, author);
        uint256 id = _buy(buyer, 2, 1, holder);

        // A big gain so the fee is worth more than two founder coins but less than three.
        vault.gain(1200e6);
        vm.prank(holder);
        token.claim(id);
        // The claim funds one founder coin on its way out.
        assertEq(token.coinOf(f).principal, 50e6, "the oldest founder coin is full");
        assertEq(token.coinOf(f2).principal, 0, "the next one has not started");

        token.fundFounders(3);
        assertEq(token.coinOf(f).principal, 50e6);
        assertEq(token.coinOf(f2).principal, 50e6);
        assertLt(token.coinOf(f3).principal, 50e6, "the third took what was left");
        assertGt(token.coinOf(f3).principal, 0);
        assertEq(token.treasuryShares(), 0, "the treasury went into the coins");
        assertEq(token.nextFounderToFund(), 2, "the pointer sits on the coin still short");
    }

    function test_AFundedFounderCoinHoldsRealSharesAndEarns() public {
        uint256 f = _founderInBand(1, author);
        uint256 founderRequest = _lastRequest();
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(1000e6);
        vm.prank(holder);
        token.claim(id);

        assertEq(token.coinOf(f).principal, 50e6);
        assertGt(token.sharesOf(f), 0);
        assertGe(token.nav(f), 50e6, "a funded founder coin is never worth less than it is credited");
        assertApproxEqAbs(token.nav(f), 50e6, 100, "and never much more than that");

        uint256 navBefore = token.nav(f);
        vault.gain(100e6);
        assertGt(token.nav(f), navBefore, "and it earns from here on");

        _reveal(founderRequest, 9);
        _ripen();
        vm.prank(author);
        uint256 assets = token.redeem(f);
        assertGt(assets, 50e6, "the author can burn it like any other coin");
    }

    function test_FundFoundersDoesNothingWithAnEmptyTreasury() public {
        uint256 f = _founderInBand(1, author);
        _founderInBand(2, author);
        token.fundFounders(10);
        assertEq(token.coinOf(f).principal, 0);
        assertEq(token.nextFounderToFund(), 0);
    }

    function test_FundFoundersSkipsAFounderCoinThatWasBurned() public {
        uint256 f = _founderInBand(1, author);
        uint256 firstRequest = _lastRequest();
        uint256 f2 = _founderInBand(2, author);
        _reveal(firstRequest, 4);
        _ripen();
        vm.prank(author);
        token.redeem(f);

        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(1000e6);
        vm.prank(holder);
        token.claim(id);
        token.fundFounders(5);

        assertEq(token.coinOf(f2).principal, 50e6, "the burned coin does not block the queue");
        assertEq(token.nextFounderToFund(), 2);
    }

    function test_AFounderCoinIsNeverCreditedMoreThanItsSharesAreWorth() public {
        uint256 f = _founderInBand(1, author);
        uint256 f2 = _founderInBand(2, author);
        uint256 f3 = _founderInBand(3, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        // A share price well off 1:1, so the share move has something to round.
        vault.gain(1337e6);
        vm.prank(holder);
        token.claim(id);
        token.fundFounders(3);

        uint256[3] memory founders = [f, f2, f3];
        for (uint256 i = 0; i < 3; i++) {
            uint256 credited = token.coinOf(founders[i]).principal;
            if (credited == 0) continue;
            assertGe(token.nav(founders[i]), credited, "the coin holds at least what it is credited with");
        }
    }

    // ---- treasury ----

    function test_WithdrawTreasuryIsBlockedWhileAFounderCoinIsShort() public {
        uint256 f = _founderInBand(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(100e6);
        vm.prank(holder);
        token.claim(id);

        assertLt(token.coinOf(f).principal, 50e6, "the founder coin is not full yet");
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FoundersUnfunded.selector, uint256(0)));
        token.withdrawTreasury(author);
    }

    function test_WithdrawTreasuryPaysTheAuthorOnceTheFoundersAreFull() public {
        uint256 f = _founderInBand(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(2000e6);
        vm.prank(holder);
        token.claim(id);

        assertEq(token.coinOf(f).principal, 50e6);
        uint256 left = token.treasuryAssets();
        assertGt(left, 0);

        vm.prank(author);
        uint256 assets = token.withdrawTreasury(author);
        assertApproxEqAbs(assets, left, 2);
        assertEq(usdc.balanceOf(author), assets);
        assertEq(token.treasuryShares(), 0);
    }

    function test_WithdrawTreasuryOnlyOwnerAndOnlyWithMoney() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.withdrawTreasury(stranger);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingInTreasury.selector));
        token.withdrawTreasury(author);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRecipient.selector));
        token.withdrawTreasury(address(0));
    }

    // ---- renderer ----

    function test_RendererIsPinnedPerCoin() public {
        uint256 old = _buy(buyer, 0, 1, holder);
        MockRendererV2 v2 = new MockRendererV2();

        vm.prank(author);
        token.setRenderer(address(v2));
        uint256 fresh = _buy(buyer, 0, 1, holder);

        assertEq(token.rendererOf(old), address(renderer));
        assertEq(token.rendererOf(fresh), address(v2));
        assertEq(token.tokenURI(old), string.concat("uri:", renderer.encode(token.viewOf(old))));
        assertEq(token.tokenURI(fresh), string.concat("uri2:", renderer.encode(token.viewOf(fresh))));
    }

    function test_SetRendererOnlyOwnerAndOnlyASaneRenderer() public {
        MockRendererV2 v2 = new MockRendererV2();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.setRenderer(address(v2));

        BadMockRenderer bad = new BadMockRenderer();
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRenderer.selector, address(bad)));
        token.setRenderer(address(bad));
    }

    function test_LockRendererIsOneWay() public {
        vm.prank(author);
        token.lockRenderer();
        assertTrue(token.rendererLocked());

        MockRendererV2 v2 = new MockRendererV2();
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.RendererIsLocked.selector));
        token.setRenderer(address(v2));

        // Locking again is harmless and there is no unlock.
        vm.prank(author);
        token.lockRenderer();
        assertTrue(token.rendererLocked());
    }

    function test_OwnershipCannotBeRenounced() public {
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.OwnershipIsPermanent.selector));
        token.renounceOwnership();
        assertEq(token.owner(), author);
    }

    // ---- the invariant that matters ----

    function test_NothingButClaimAndRedeemMovesACoinsShares() public {
        // A victim coin nobody in this test ever claims or redeems.
        uint256 victim = _buy(buyer, 2, 1, holder);
        _reveal(_lastRequest(), 1);
        vault.gain(200e6);

        _founderInBand(2, author);

        uint256 sharesBefore = token.sharesOf(victim);
        uint256 principalBefore = token.coinOf(victim).principal;
        uint256 holderUsdcBefore = usdc.balanceOf(holder);
        uint256 strangerUsdcBefore = usdc.balanceOf(stranger);
        uint256 authorUsdcBefore = usdc.balanceOf(author);

        // Every state changing entrypoint the contract has, from whoever may call it.
        _buy(stranger, 0, 2, stranger);
        uint256 openRid = _lastRequest();

        _founderInBand(3, author);

        _reveal(openRid, 77);

        token.fundFounders(10);

        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        uint256 sealedId = _buy(stranger, 0, 1, stranger);
        uint256 rid2 = _lastRequest();
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.prank(stranger);
        token.retry(rid2);
        assertEq(token.ownerOf(sealedId), stranger);

        MockRendererV2 v2 = new MockRendererV2();
        vm.prank(author);
        token.setRenderer(address(v2));
        vm.prank(author);
        token.lockRenderer();

        vm.startPrank(holder);
        token.approve(stranger, victim);
        token.setApprovalForAll(stranger, true);
        token.transferFrom(holder, stranger, victim);
        vm.stopPrank();
        vm.prank(stranger);
        token.transferFrom(stranger, holder, victim);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FoundersUnfunded.selector, uint256(0)));
        token.withdrawTreasury(author);

        assertEq(token.sharesOf(victim), sharesBefore, "no call moved the coin's shares");
        assertEq(token.coinOf(victim).principal, principalBefore);
        assertEq(usdc.balanceOf(holder), holderUsdcBefore, "and no USDC reached anyone");
        assertEq(usdc.balanceOf(stranger), strangerUsdcBefore);
        assertEq(usdc.balanceOf(author), authorUsdcBefore);
        assertEq(usdc.balanceOf(address(token)), 0, "the token never holds USDC between calls");

        // Only the owner's own claim moves them, and only to the owner.
        vm.prank(holder);
        uint256 paid = token.claim(victim);
        assertGt(paid, 0);
        assertLt(token.sharesOf(victim), sharesBefore);
        assertEq(usdc.balanceOf(holder), holderUsdcBefore + paid);
        assertEq(usdc.balanceOf(stranger), strangerUsdcBefore);
    }

    function test_TheAuthorCannotTakeAHoldersCoinOrItsMoney() public {
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(50e6);

        vm.startPrank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NotOwnerNorApproved.selector, id, author));
        token.claim(id);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NotOwnerNorApproved.selector, id, author));
        token.redeem(id);
        vm.expectRevert();
        token.transferFrom(holder, author, id);
        vm.stopPrank();
        assertEq(token.ownerOf(id), holder);
    }

    // ---- the one gas budget the contract does not control ----

    function test_TheCallbackGasIsSetAtDeployAndBounded() public {
        assertEq(token.callbackGas(), CALLBACK_GAS);
        assertEq(token.MIN_CALLBACK_GAS(), 800_000);
        assertEq(token.MAX_CALLBACK_GAS(), 2_500_000);
        assertEq(vrf.callbackGasOf(_lastRequestOrZero()), 0, "no request yet");

        _buy(buyer, 0, 1, holder);
        assertEq(vrf.callbackGasOf(_lastRequest()), CALLBACK_GAS, "the request asks for what was set");

        for (uint32 bad = 0; bad < 2; bad++) {
            uint32 value = bad == 0 ? uint32(799_999) : uint32(2_500_001);
            vm.expectRevert(abi.encodeWithSelector(OneCoin.BadCallbackGas.selector, value));
            new OneCoin(
                "ONE", "ONE", author, address(usdc), address(vault), address(renderer), address(vrf),
                KEY_HASH, SUB_ID, FEE, value
            );
        }
    }

    function _lastRequestOrZero() internal view returns (uint256) {
        return vrf.lastRequestId();
    }

    /// @dev The costly callback is a full batch that straddles a series boundary: it draws from
    /// two urns, so it writes two counters and two sets of swap entries. If this ever stops
    /// fitting inside sixty percent of the floor, the floor is wrong, because a callback that
    /// runs out of gas leaves those coins sealed and every retry fails the same way.
    function test_TheWorstCallbackFitsTheFloorWithMargin() public {
        _jumpTo(9996);
        uint256 firstId = _buy(buyer, 0, 10, holder);
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(uint256(7), i)));
        }

        vm.cool(address(token));
        vm.prank(address(vrf));
        uint256 g = gasleft();
        token.rawFulfillRandomWords(rid, words);
        uint256 used = g - gasleft();

        console.log("worst callback, ten coins over a series boundary", used);
        assertEq(token.urnLeft(1), 9995, "five draws in series one");
        assertEq(token.urnLeft(2), 9995, "and five in series two");
        assertFalse(token.coinOf(firstId).sealed_);
        assertFalse(token.coinOf(firstId + 9).sealed_);
        assertLt(used, uint256(token.MIN_CALLBACK_GAS()) * 60 / 100, "sixty percent of the floor, with room");
    }

    // ---- gas ----

    function test_Gas() public {
        usdc.mint(buyer, 10_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), type(uint256).max);

        uint256 g = gasleft();
        token.mint{value: FEE}(2, 1, buyer);
        console.log("mint(1) cold ", g - gasleft());

        g = gasleft();
        uint256 one = token.mint{value: FEE}(2, 1, buyer);
        console.log("mint(1) warm ", g - gasleft());

        g = gasleft();
        uint256 ten = token.mint{value: FEE}(0, 10, buyer);
        console.log("mint(10)     ", g - gasleft());
        vm.stopPrank();

        // The VRF callback is the one call the contract does not control the gas of: the
        // coordinator gives it `callbackGas` and no more, and it arrives as its own transaction,
        // so every slot it touches is cold. `vm.cool` puts the contract back in that state, and
        // an urn nobody has drawn from is the expensive case: each draw writes a swap entry from
        // zero, which costs 20,000 gas rather than 5,000.
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(uint256(1), i)));
        }
        vm.cool(address(token));
        vm.prank(address(vrf));
        g = gasleft();
        token.rawFulfillRandomWords(rid, words);
        uint256 callback = g - gasleft();
        console.log("fulfil(10) cold", callback);
        assertLt(callback, token.callbackGas(), "the callback fits in the gas the coordinator gives it");
        assertFalse(token.coinOf(ten).sealed_);

        _reveal(1, 1);
        _reveal(2, 2);
        vault.gain(500e6);
        _ripen();

        vm.startPrank(buyer);
        g = gasleft();
        token.claim(one);
        console.log("claim        ", g - gasleft());

        g = gasleft();
        token.redeem(one);
        console.log("redeem       ", g - gasleft());
        vm.stopPrank();
    }
}

/// @notice Proves script/Deploy.s.sol reads the environment deploy.sh gives it and produces a
/// token wired to the right vault, renderer, coordinator, lane and subscription.
contract OneCoinDeployScriptTest is Test {
    function test_DeployScriptWiresTheTokenFromTheEnvironment() public {
        MockUSDC usdc = new MockUSDC();
        MockVault vault = new MockVault(usdc);
        MockVRFCoordinator vrf = new MockVRFCoordinator();
        MockRenderer renderer = new MockRenderer();
        address author = address(0xA07401);
        bytes32 keyHash = keccak256("base lane");

        vm.setEnv("ONE_NAME", "ONE");
        vm.setEnv("ONE_SYMBOL", "ONE");
        vm.setEnv("ONE_AUTHOR", vm.toString(author));
        vm.setEnv("ONE_USDC", vm.toString(address(usdc)));
        vm.setEnv("ONE_VAULT", vm.toString(address(vault)));
        vm.setEnv("ONE_RENDERER", vm.toString(address(renderer)));
        vm.setEnv("ONE_COORDINATOR", vm.toString(address(vrf)));
        vm.setEnv("ONE_KEY_HASH", vm.toString(keyHash));
        vm.setEnv("ONE_SUB_ID", "4242");
        vm.setEnv("ONE_VRF_FEE_WEI", "50000000000000");
        vm.setEnv("ONE_CALLBACK_GAS", "800000");

        OneCoin token = new Deploy().run();

        assertEq(token.name(), "ONE");
        assertEq(token.symbol(), "ONE");
        assertEq(token.owner(), author);
        assertEq(token.author(), author);
        assertEq(address(token.USDC()), address(usdc));
        assertEq(address(token.VAULT()), address(vault));
        assertEq(token.renderer(), address(renderer));
        assertEq(token.vrfCoordinator(), address(vrf));
        assertEq(token.keyHash(), keyHash);
        assertEq(token.subId(), 4242);
        assertEq(token.vrfFeeWei(), 0.00005 ether);
        assertEq(token.callbackGas(), 800_000);
    }
}

/// @notice The token against the real renderer, not the mock. Everything else in this file
/// proves what OneCoin does with a CoinView; this proves the two halves fit: the constructor
/// accepts the real renderer, the token hands it a view it can draw, and a full tokenURI fits
/// in one eth_call on a public Base RPC.
contract OneCoinRealRendererTest is Test {
    OneCoin internal token;
    MockUSDC internal usdc;
    MockVault internal vault;
    MockVRFCoordinator internal vrf;
    CoinRenderer internal coinRenderer;

    address internal author = address(0xA07401);
    address internal buyer = address(0xB0B);

    /// @dev docs/CONTRACTS.md section 1: tokenURI must run inside one eth_call of 50M gas.
    uint256 internal constant RPC_CALL_BUDGET = 50_000_000;
    uint256 internal constant FEE = 0.00005 ether;
    uint32 internal constant CALLBACK_GAS = 800_000;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(usdc);
        vrf = new MockVRFCoordinator();
        coinRenderer = new CoinRenderer(address(new MasterRenderer()), address(new CoinMetadata()));
        token = new OneCoin(
            "ONE",
            "ONE",
            author,
            address(usdc),
            address(vault),
            address(coinRenderer),
            address(vrf),
            bytes32(0),
            1,
            FEE,
            CALLBACK_GAS
        );
        vm.deal(author, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function _buy(uint8 class, uint8 count) internal returns (uint256 firstId) {
        uint256 total = token.backingOf(class) * count;
        usdc.mint(buyer, total);
        vm.startPrank(buyer);
        usdc.approve(address(token), total);
        firstId = token.mint{value: FEE}(class, count, buyer);
        vm.stopPrank();
    }

    function test_TheConstructorAcceptsTheRealRenderer() public view {
        assertEq(token.renderer(), address(coinRenderer));
        assertEq(coinRenderer.masterCount(), token.MASTERS());
        assertEq(coinRenderer.masterName(0), "Genesis");
        assertEq(coinRenderer.masterName(49), "Halcyon");
    }

    function test_ASealedCoinDrawsThroughTheRealRenderer() public {
        uint256 id = _buy(1, 1);
        string memory uri = token.tokenURI(id);
        assertGt(bytes(uri).length, 1000, "a real document came back");
        assertEq(uri, coinRenderer.tokenURI(token.viewOf(id)), "the token passed the view it reports");
    }

    function test_TheWorstMasterDrawsThroughTheTokenInsideTheRpcBudget() public {
        // Master 25 is Alpha. Fixture case 103 is that master and it is the most expensive of
        // the 149 cases the renderer is tested against, so this is the worst drawing the token
        // can be asked for. On a fresh urn the top bits of the word pick the slot directly.
        uint256 id = _buy(2, 1);
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(25) << 64) | uint256(210566752294031767);
        vrf.fulfill(vrf.lastRequestId(), words);
        assertEq(token.slotOf(id), 25);
        assertEq(token.viewOf(id).master, 25);
        assertEq(coinRenderer.masterName(25), "Alpha");

        uint256 g = gasleft();
        string memory flat = token.tokenURI(id);
        uint256 flatGas = g - gasleft();

        // Again with the yield ring at full, which is the one thing the token adds to a
        // drawing that a fixture of a fresh coin does not carry.
        vault.gain(600e6);
        assertEq(token.viewOf(id).yieldBps, token.MAX_YIELD_BPS());
        g = gasleft();
        string memory ringed = token.tokenURI(id);
        uint256 ringedGas = g - gasleft();

        console.log("tokenURI, master Alpha, no ring  ", flatGas);
        console.log("tokenURI, master Alpha, full ring", ringedGas);
        assertLt(flatGas, RPC_CALL_BUDGET, "one eth_call on a public Base RPC covers it");
        assertLt(ringedGas, RPC_CALL_BUDGET, "and covers it with the ring lit too");
        assertGt(bytes(flat).length, 1000);
        assertTrue(keccak256(bytes(flat)) != keccak256(bytes(ringed)), "the ring changed the drawing");
        assertEq(ringed, coinRenderer.tokenURI(token.viewOf(id)), "the token passed the view it reports");
    }

    function test_AProceduralCoinDrawsAndItsYieldRingFollowsTheVault() public {
        uint256 id = _buy(2, 1);
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(5000) << 64) | uint256(0x1234);
        vrf.fulfill(vrf.lastRequestId(), words);
        assertGe(token.slotOf(id), token.MASTERS());
        assertEq(token.viewOf(id).master, 255);

        string memory flat = token.tokenURI(id);
        vault.gain(25e6);
        assertApproxEqAbs(token.viewOf(id).yieldBps, 5000, 2, "fifty percent reaches the renderer");
        assertTrue(
            keccak256(bytes(flat)) != keccak256(bytes(token.tokenURI(id))),
            "the yield ring changed the document"
        );
    }

    function test_AFounderCoinDrawsBeforeItIsFunded() public {
        // Founder coin one lives in band one, coins 1 to 200 of the series, so walk the id
        // counter into that band rather than mint them. Slot 14 is `nextId`, slot 15 `minted`.
        vm.store(address(token), bytes32(uint256(14)), bytes32(uint256(200)));
        vm.store(address(token), bytes32(uint256(15)), bytes32(uint256(199)));
        assertEq(token.nextId(), 200, "storage layout moved, re-read forge inspect OneCoin storage");
        vm.prank(author);
        uint256 id = token.mintFounder{value: FEE}(1, author);
        uint256[] memory words = new uint256[](1);
        words[0] = (uint256(1) << 64) | uint256(7);
        vrf.fulfill(vrf.lastRequestId(), words);

        CoinView memory v = token.viewOf(id);
        assertTrue(v.founder);
        assertEq(v.fundedUnits, 0, "no backing yet");
        assertEq(v.backing, 50);
        assertEq(v.yieldBps, 0);
        assertGt(bytes(token.tokenURI(id)).length, 1000);
    }
}

/// @notice The one way to put ETH into a contract that no payable function can refuse.
contract Selfdestructor {
    constructor() payable {}

    function blow(address payable target) external {
        selfdestruct(target);
    }
}
