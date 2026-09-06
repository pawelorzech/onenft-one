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

    /// @dev Slot of `nextId`, from `forge inspect OneCoin storage`. Used to walk the id counter
    /// to a series boundary without minting ten thousand coins first.
    uint256 internal constant SLOT_NEXT_ID = 12;
    uint256 internal constant SLOT_MINTED = 13;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(usdc);
        vrf = new MockVRFCoordinator();
        renderer = new MockRenderer();
        token = new OneCoin(
            "ONE", "ONE", author, address(usdc), address(vault), address(renderer), address(vrf), KEY_HASH, SUB_ID
        );
    }

    // ---- helpers ----

    function _buy(address who, uint8 class, uint8 count, address to) internal returns (uint256 firstId) {
        uint256 total = token.backingOf(class) * count;
        usdc.mint(who, total);
        vm.startPrank(who);
        usdc.approve(address(token), total);
        firstId = token.mint(class, count, to);
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
            "ONE", "ONE", author, address(usdc), address(wrong), address(renderer), address(vrf), KEY_HASH, SUB_ID
        );
    }

    function test_ConstructorRejectsRendererThatDoesNotKnowFiftyMasters() public {
        BadMockRenderer bad = new BadMockRenderer();
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRenderer.selector, address(bad)));
        new OneCoin(
            "ONE", "ONE", author, address(usdc), address(vault), address(bad), address(vrf), KEY_HASH, SUB_ID
        );
    }

    function test_ConstructorRejectsRendererWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRenderer.selector, stranger));
        new OneCoin("ONE", "ONE", author, address(usdc), address(vault), stranger, address(vrf), KEY_HASH, SUB_ID);
    }

    // ---- mint ----

    function test_MintPullsExactUsdcAndDepositsIt() public {
        usdc.mint(buyer, 100e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), 100e6);
        uint256 firstId = token.mint(1, 3, holder);
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
        token.mint(0, 0, holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadCount.selector, uint8(11)));
        token.mint(0, 11, holder);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadRecipient.selector));
        token.mint(0, 1, address(0));
        vm.expectRevert(abi.encodeWithSelector(OneCoin.BadBackingClass.selector, uint8(3)));
        token.mint(3, 1, holder);
        vm.stopPrank();
    }

    function test_MintNeedsTheUsdc() public {
        vm.prank(buyer);
        vm.expectRevert();
        token.mint(0, 1, holder);
    }

    // ---- founder mint ----

    function test_MintFounderIsFreeUnbackedAndSealed() public {
        vm.prank(author);
        uint256 id = token.mintFounder(2, author);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(vault)), 0, "no money moved");
        OneCoin.CoinInfo memory c = token.coinOf(1);
        assertTrue(c.founder);
        assertTrue(c.sealed_);
        assertEq(c.principal, 0);
        assertEq(c.shares, 0);
        assertEq(c.backingClass, 2, "a founder coin is a fifty");
        assertEq(token.ownerOf(1), author);
        assertEq(token.ownerOf(2), author);
        assertEq(token.founderCount(), 2);
        assertEq(token.founderMinted(1), 2);
    }

    function test_MintFounderOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.mintFounder(1, stranger);
    }

    function test_MintFounderStopsAtFiftyPerSeries() public {
        vm.startPrank(author);
        for (uint256 i = 0; i < 5; i++) {
            token.mintFounder(10, author);
        }
        assertEq(token.founderMinted(1), 50);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FounderReserveFull.selector, uint256(1), uint16(50), uint8(1)));
        token.mintFounder(1, author);
        vm.stopPrank();
    }

    function test_MintFounderRefusesToCrossASeriesBoundary() public {
        _jumpTo(9996);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.SeriesBoundary.selector, uint256(9996), uint256(10005)));
        token.mintFounder(10, author);

        // Right up to the boundary is fine.
        vm.prank(author);
        uint256 firstId = token.mintFounder(5, author);
        assertEq(firstId, 9996);
        assertEq(token.seriesOf(10000), 1);
        assertEq(token.founderMinted(1), 5);
    }

    function test_FounderReserveIsCountedPerSeries() public {
        vm.startPrank(author);
        for (uint256 i = 0; i < 5; i++) {
            token.mintFounder(10, author);
        }
        vm.stopPrank();
        assertEq(token.founderMinted(1), 50);

        _jumpTo(10001);
        vm.prank(author);
        uint256 id = token.mintFounder(10, author);
        assertEq(token.seriesOf(id), 2);
        assertEq(token.founderMinted(2), 10);
        assertEq(token.founderMinted(1), 50, "series one is untouched");
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

    // ---- the urn ----

    function test_UrnGivesEverySlotOnceAndExactlyFiftyMasters() public {
        uint256 batches = 10000 / token.MAX_BATCH();
        usdc.mint(buyer, 10000 * 10e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), type(uint256).max);
        for (uint256 b = 0; b < batches; b++) {
            token.mint(0, token.MAX_BATCH(), buyer);
        }
        vm.stopPrank();
        for (uint256 rid = 1; rid <= batches; rid++) {
            vrf.fulfillWithSeed(rid, rid);
        }

        assertEq(token.urnLeft(1), 0, "the urn of series one is empty");
        assertEq(token.mastersLeft(1), 0);

        bool[] memory seen = new bool[](10000);
        uint256 masters = 0;
        for (uint256 id = 1; id <= 10000; id++) {
            uint16 slot = token.slotOf(id);
            assertLt(slot, 10000, "every slot is inside the series");
            assertFalse(seen[slot], "no slot came out twice");
            seen[slot] = true;
            if (slot < token.MASTERS()) masters++;
        }
        assertEq(masters, 50, "exactly fifty masters in the series");

        // And the eleventh draw of the next series starts from a full urn.
        assertEq(token.urnLeft(2), 10000);
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

    function test_RetryRevertsWhenTheCoinsOfAnOpenRequestAreAllGone() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        uint256 rid = _lastRequest();
        vm.prank(holder);
        token.redeem(id);
        vm.roll(block.number + token.RETRY_BLOCKS() + 1);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.NothingToRetry.selector, rid));
        token.retry(rid);
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
        token.mint(0, 3, holder);
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
        uint256 feeShares = shares * fee / nav;
        uint256 outShares = shares * (gain - fee) / nav;

        vm.prank(holder);
        uint256 paid = token.claim(id);

        assertEq(usdc.balanceOf(holder), paid, "the money went to the owner");
        assertApproxEqAbs(paid, gain - fee, 2, "the owner got the yield less ten percent");
        assertEq(token.treasuryShares(), feeShares, "the fee stayed as treasury shares");
        assertEq(token.sharesOf(id), shares - feeShares - outShares);
        assertEq(token.coinOf(id).claimed, gain);
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
        // A share price far off 1:1, so a coin holds few shares and a small gain can be worth
        // less than one of them. That is the case where a claim would once have booked yield
        // it never paid, and where the same gain could be booked again and again.
        _buy(buyer, 0, 1, holder);
        vault.gain(1_000_000e6);
        uint256 id = _buy(buyer, 2, 1, holder);

        bool sawAGainTooSmallToPay = false;
        for (uint256 i = 0; i < 64; i++) {
            vault.gain(1_000e6);
            if (token.profit(id) == 0) continue;

            uint256 claimedBefore = token.coinOf(id).claimed;
            uint256 balanceBefore = usdc.balanceOf(holder);
            vm.prank(holder);
            try token.claim(id) returns (uint256 paid) {
                assertGt(paid, 0, "a claim that goes through always pays something");
                assertEq(usdc.balanceOf(holder), balanceBefore + paid);
                assertGt(token.coinOf(id).claimed, claimedBefore);
                break;
            } catch (bytes memory reason) {
                assertEq(reason, abi.encodeWithSelector(OneCoin.NothingToClaim.selector, id));
                sawAGainTooSmallToPay = true;
                assertEq(token.coinOf(id).claimed, claimedBefore, "a refused claim books nothing");
                assertEq(usdc.balanceOf(holder), balanceBefore, "and pays nothing");
            }
        }
        assertTrue(sawAGainTooSmallToPay, "the setup did produce a gain too small to pay for itself");
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

        uint256 nav = token.nav(id);
        uint256 gain = nav - 50e6;
        uint256 fee = gain * 1000 / 10000;
        uint256 feeShares = shares * fee / nav;

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
        vault.lose(10e6);

        uint256 nav = token.nav(id);
        assertLt(nav, 50e6, "the vault lost money");

        vm.prank(holder);
        uint256 assets = token.redeem(id);

        assertEq(token.treasuryShares(), 0, "no fee on a loss");
        assertApproxEqAbs(assets, nav, 2, "the owner gets what the coin is worth");
        assertEq(usdc.balanceOf(holder), assets);
    }

    function test_RedeemOfASealedCoinWorks() public {
        uint256 id = _buy(buyer, 0, 1, holder);
        assertTrue(token.coinOf(id).sealed_);
        vm.prank(holder);
        uint256 assets = token.redeem(id);
        assertApproxEqAbs(assets, 10e6, 2);
    }

    function test_RedeemOnlyOwnerOrApproved() public {
        uint256 id = _buy(buyer, 0, 1, holder);
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

    // ---- founder funding ----

    function test_FoundersAreFundedOldestFirst() public {
        vm.prank(author);
        token.mintFounder(3, author);
        uint256 id = _buy(buyer, 2, 1, holder);

        // A big gain so the fee is worth more than two founder coins but less than three.
        vault.gain(1200e6);
        vm.prank(holder);
        token.claim(id);
        // The claim funds one founder coin on its way out.
        assertEq(token.coinOf(1).principal, 50e6, "the oldest founder coin is full");
        assertEq(token.coinOf(2).principal, 0, "the next one has not started");

        token.fundFounders(3);
        assertEq(token.coinOf(1).principal, 50e6);
        assertEq(token.coinOf(2).principal, 50e6);
        assertLt(token.coinOf(3).principal, 50e6, "the third took what was left");
        assertGt(token.coinOf(3).principal, 0);
        assertEq(token.treasuryShares(), 0, "the treasury went into the coins");
        assertEq(token.nextFounderToFund(), 2, "the pointer sits on the coin still short");
    }

    function test_AFundedFounderCoinHoldsRealSharesAndEarns() public {
        vm.prank(author);
        token.mintFounder(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(1000e6);
        vm.prank(holder);
        token.claim(id);

        assertEq(token.coinOf(1).principal, 50e6);
        assertGt(token.sharesOf(1), 0);
        assertGe(token.nav(1), 50e6, "a funded founder coin is never worth less than it is credited");
        assertApproxEqAbs(token.nav(1), 50e6, 100, "and never much more than that");

        uint256 navBefore = token.nav(1);
        vault.gain(100e6);
        assertGt(token.nav(1), navBefore, "and it earns from here on");

        vm.prank(author);
        uint256 assets = token.redeem(1);
        assertGt(assets, 50e6, "the author can burn it like any other coin");
    }

    function test_FundFoundersDoesNothingWithAnEmptyTreasury() public {
        vm.prank(author);
        token.mintFounder(2, author);
        token.fundFounders(10);
        assertEq(token.coinOf(1).principal, 0);
        assertEq(token.nextFounderToFund(), 0);
    }

    function test_FundFoundersSkipsAFounderCoinThatWasBurned() public {
        vm.prank(author);
        token.mintFounder(2, author);
        vm.prank(author);
        token.redeem(1);

        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(1000e6);
        vm.prank(holder);
        token.claim(id);
        token.fundFounders(5);

        assertEq(token.coinOf(2).principal, 50e6, "the burned coin does not block the queue");
        assertEq(token.nextFounderToFund(), 2);
    }

    function test_AFounderCoinIsNeverCreditedMoreThanItsSharesAreWorth() public {
        vm.prank(author);
        token.mintFounder(3, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        // A share price well off 1:1, so the share move has something to round.
        vault.gain(1337e6);
        vm.prank(holder);
        token.claim(id);
        token.fundFounders(3);

        for (uint256 f = 1; f <= 3; f++) {
            uint256 credited = token.coinOf(f).principal;
            if (credited == 0) continue;
            assertGe(token.nav(f), credited, "the coin holds at least what it is credited with");
        }
    }

    // ---- treasury ----

    function test_WithdrawTreasuryIsBlockedWhileAFounderCoinIsShort() public {
        vm.prank(author);
        token.mintFounder(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(100e6);
        vm.prank(holder);
        token.claim(id);

        assertLt(token.coinOf(1).principal, 50e6, "the founder coin is not full yet");
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(OneCoin.FoundersUnfunded.selector, uint256(0)));
        token.withdrawTreasury(author);
    }

    function test_WithdrawTreasuryPaysTheAuthorOnceTheFoundersAreFull() public {
        vm.prank(author);
        token.mintFounder(1, author);
        uint256 id = _buy(buyer, 2, 1, holder);
        vault.gain(2000e6);
        vm.prank(holder);
        token.claim(id);

        assertEq(token.coinOf(1).principal, 50e6);
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

        vm.prank(author);
        token.mintFounder(1, author);

        uint256 sharesBefore = token.sharesOf(victim);
        uint256 principalBefore = token.coinOf(victim).principal;
        uint256 holderUsdcBefore = usdc.balanceOf(holder);
        uint256 strangerUsdcBefore = usdc.balanceOf(stranger);
        uint256 authorUsdcBefore = usdc.balanceOf(author);

        // Every state changing entrypoint the contract has, from whoever may call it.
        _buy(stranger, 0, 2, stranger);
        uint256 openRid = _lastRequest();

        vm.prank(author);
        token.mintFounder(1, author);

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

    // ---- gas ----

    function test_Gas() public {
        usdc.mint(buyer, 10_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(token), type(uint256).max);

        uint256 g = gasleft();
        token.mint(2, 1, buyer);
        console.log("mint(1) cold ", g - gasleft());

        g = gasleft();
        uint256 one = token.mint(2, 1, buyer);
        console.log("mint(1) warm ", g - gasleft());

        g = gasleft();
        uint256 ten = token.mint(0, 10, buyer);
        console.log("mint(10)     ", g - gasleft());
        vm.stopPrank();

        // The VRF callback is the one call the contract does not control the gas of:
        // the coordinator gives it CALLBACK_GAS and no more.
        uint256 rid = _lastRequest();
        uint256[] memory words = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            words[i] = uint256(keccak256(abi.encodePacked(uint256(1), i)));
        }
        vm.prank(address(vrf));
        g = gasleft();
        token.rawFulfillRandomWords(rid, words);
        uint256 callback = g - gasleft();
        console.log("fulfil(10)   ", callback);
        assertLt(callback, token.CALLBACK_GAS(), "the callback fits in the gas the coordinator gives it");
        assertFalse(token.coinOf(ten).sealed_);

        _reveal(1, 1);
        _reveal(2, 2);
        vault.gain(500e6);

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

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(usdc);
        vrf = new MockVRFCoordinator();
        coinRenderer = new CoinRenderer(address(new MasterRenderer()), address(new CoinMetadata()));
        token = new OneCoin(
            "ONE", "ONE", author, address(usdc), address(vault), address(coinRenderer), address(vrf), bytes32(0), 1
        );
    }

    function _buy(uint8 class, uint8 count) internal returns (uint256 firstId) {
        uint256 total = token.backingOf(class) * count;
        usdc.mint(buyer, total);
        vm.startPrank(buyer);
        usdc.approve(address(token), total);
        firstId = token.mint(class, count, buyer);
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
        vm.prank(author);
        uint256 id = token.mintFounder(1, author);
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
