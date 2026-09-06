// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CoinView} from "../src/ICoinRenderer.sol";
import {CoinRenderer} from "../src/CoinRenderer.sol";
import {CoinMetadata} from "../src/CoinMetadata.sol";
import {MasterRenderer} from "../src/MasterRenderer.sol";

/// Byte-equality tests against contracts/test/fixtures/coin_cases.json, which
/// `bun run contracts/fixtures.ts` regenerates. TypeScript is the source of truth.
///
/// Two things about the fixture shape drive the loading code here.
///
/// First, `vm.parseJson` infers types from the JSON, and its inference is not
/// stable across the fixture: it hands back a short decimal string such as
/// "7960286522194355700" as a `string` but a twenty-digit one such as
/// "17909611376780542444" as a `uint256`, which shifts the tuple layout and makes
/// the decode revert. `vm.parseJsonType` with an explicit type description pins
/// every field instead of guessing, so it is used throughout.
///
/// Second, the JSON has a key named `sealed`, which is a reserved word in
/// Solidity and cannot be a struct field. Foundry cross-checks a type description
/// against the Solidity struct of the same name, so the description is named
/// `FixtureCase`, which matches no struct in this project. Foundry then maps JSON
/// keys to positions by the names in the description alone, and the Solidity
/// struct only has to agree on order and types. That also lets the description
/// list just the fields the tests use and ignore the rest of each case.
contract CoinRendererTest is Test {
    using Strings for uint256;

    string private constant FIXTURES = "test/fixtures/coin_cases.json";
    uint256 private constant CASES = 152;

    /// Fields in the alphabetical order Foundry emits them in.
    string private constant CASE_TYPE = "FixtureCase("
        "uint256 backing,bool founder,string fundedUnits,bytes grid,string json,"
        "string lifetimeUnits,int256 master,uint256 number,bool sealed,string seed,"
        "uint256 series,string svg,string why,uint256 yieldBps)";

    struct Case {
        uint256 backing;
        bool founder;
        string fundedUnits;
        bytes grid;
        string json;
        string lifetimeUnits;
        int256 master;
        uint256 number;
        bool isSealed;
        string seed;
        uint256 series;
        string svg;
        string why;
        uint256 yieldBps;
    }

    CoinRenderer private renderer;

    function setUp() public {
        MasterRenderer masters = new MasterRenderer();
        CoinMetadata meta = new CoinMetadata();
        renderer = new CoinRenderer(address(masters), address(meta));
    }

    function loadCases() internal view returns (Case[] memory cases) {
        cases = abi.decode(vm.parseJsonTypeArray(vm.readFile(FIXTURES), "$", CASE_TYPE), (Case[]));
        assertEq(cases.length, CASES, "fixture count");
    }

    /// Decimal string to uint. The fixture writes the seed and the USDC units as
    /// strings because they do not fit a JSON number safely.
    function parseUint(string memory s) internal pure returns (uint256 n) {
        bytes memory b = bytes(s);
        require(b.length > 0, "empty number");
        for (uint256 i = 0; i < b.length; i++) {
            require(b[i] >= 0x30 && b[i] <= 0x39, "not a decimal digit");
            n = n * 10 + (uint8(b[i]) - 48);
        }
    }

    /// The fixture writes -1 for an ordinary coin; the contract uses 255 for none.
    function viewOf(Case memory c) internal pure returns (CoinView memory v) {
        v.seed = uint64(parseUint(c.seed));
        v.number = uint16(c.number);
        v.series = uint16(c.series);
        v.backing = uint8(c.backing);
        v.yieldBps = uint32(c.yieldBps);
        v.master = c.master < 0 ? 255 : uint8(uint256(c.master));
        v.founder = c.founder;
        v.sealed_ = c.isSealed;
        v.fundedUnits = parseUint(c.fundedUnits);
        v.lifetimeUnits = parseUint(c.lifetimeUnits);
    }

    /// The grid is compared before the SVG and the JSON because a grid mismatch
    /// names the pixel, and so the branch of the renderer, that went wrong. An SVG
    /// or JSON mismatch only says that something upstream of it did.
    ///
    /// The cases are split into batches so no single test frame holds the decoded
    /// fixture plus every rendered output at once. EVM memory is never reclaimed
    /// inside a call frame, so a single test over all 152 cases would keep growing.
    function checkCases(uint256 from, uint256 to) internal view {
        Case[] memory cases = loadCases();
        for (uint256 i = from; i < to && i < CASES; i++) {
            Case memory c = cases[i];
            string memory where = string.concat("case ", i.toString(), " (", c.why, ")");
            CoinView memory v = viewOf(c);

            bytes memory g = renderer.grid(v);
            assertEq(g.length, c.grid.length, string.concat(where, " grid length"));
            for (uint256 p = 0; p < g.length; p++) {
                if (g[p] != c.grid[p]) {
                    assertEq(
                        uint256(uint8(g[p])),
                        uint256(uint8(c.grid[p])),
                        string.concat(
                            where,
                            " first differing pixel ",
                            p.toString(),
                            " at x=",
                            (p % 64).toString(),
                            " y=",
                            (p / 64).toString()
                        )
                    );
                }
            }

            assertEq(renderer.svg(v), c.svg, string.concat(where, " svg"));
            assertEq(renderer.json(v), c.json, string.concat(where, " json"));
        }
    }

    function test_MatchesTypeScript_A() public view { checkCases(0, 25); }
    function test_MatchesTypeScript_B() public view { checkCases(25, 50); }
    function test_MatchesTypeScript_C() public view { checkCases(50, 75); }
    function test_MatchesTypeScript_D() public view { checkCases(75, 100); }
    function test_MatchesTypeScript_E() public view { checkCases(100, 125); }
    function test_MatchesTypeScript_F() public view { checkCases(125, 152); }

    /// `tokenURI` for the heaviest fixture must fit inside one eth_call on a public
    /// Base RPC. The heaviest is the one with the largest SVG, which the next test
    /// pins down so this one is not measuring the wrong coin.
    function test_TokenUriGasForHeaviestFixture() public view {
        Case[] memory cases = loadCases();
        uint256 heaviest = heaviestIndex(cases);
        Case memory c = cases[heaviest];
        CoinView memory v = viewOf(c);
        uint256 before = gasleft();
        string memory uri = renderer.tokenURI(v);
        uint256 used = before - gasleft();
        console.log("heaviest fixture index:", heaviest);
        console.log("why:", c.why);
        console.log("svg bytes:", bytes(c.svg).length);
        console.log("tokenURI gas:", used);
        assertGt(bytes(uri).length, 1000, "tokenURI is not empty");
        assertLt(used, 45_000_000, "tokenURI gas");
        console.log("gas margin under 45,000,000:", 45_000_000 - used);
    }

    /// Every fixture must render through `tokenURI` inside the same budget, not
    /// only the one with the largest SVG, since gas also follows the pixel work.
    function checkTokenUriGas(uint256 from, uint256 to) internal view {
        Case[] memory cases = loadCases();
        uint256 worst = 0;
        uint256 worstIndex = from;
        for (uint256 i = from; i < to && i < CASES; i++) {
            CoinView memory v = viewOf(cases[i]);
            uint256 before = gasleft();
            renderer.tokenURI(v);
            uint256 used = before - gasleft();
            if (used > worst) { worst = used; worstIndex = i; }
        }
        console.log("worst case in range:", worstIndex);
        console.log("worst tokenURI gas:", worst);
        assertLt(worst, 45_000_000, "tokenURI gas");
    }

    function test_TokenUriGasWithinBudget_A() public view { checkTokenUriGas(0, 50); }
    function test_TokenUriGasWithinBudget_B() public view { checkTokenUriGas(50, 100); }
    function test_TokenUriGasWithinBudget_C() public view { checkTokenUriGas(100, 152); }

    function heaviestIndex(Case[] memory cases) internal pure returns (uint256 best) {
        uint256 bestLength = 0;
        for (uint256 i = 0; i < cases.length; i++) {
            uint256 length = bytes(cases[i].svg).length;
            if (length > bestLength) { bestLength = length; best = i; }
        }
    }

    /// No fixture pairs a master with a yield ring: the master cases all sit at
    /// yieldBps 0, and the yield cases are all procedural. That combination is what
    /// the token asks for once a master coin has earned, so it is swept here over
    /// every master at the 100000 bps cap the token enforces.
    function test_EveryMasterFitsTheBudgetAtTheYieldCap() public view {
        uint256 worstRing;
        uint256 worstRingIndex;
        uint256 worstFlat;
        uint256 worstFlatIndex;
        for (uint8 i = 0; i < 50; i++) {
            uint256 before = gasleft();
            renderer.tokenURI(masterView(i, 100000));
            uint256 ring = before - gasleft();
            if (ring > worstRing) { worstRing = ring; worstRingIndex = i; }

            before = gasleft();
            renderer.tokenURI(masterView(i, 0));
            uint256 flat = before - gasleft();
            if (flat > worstFlat) { worstFlat = flat; worstFlatIndex = i; }
        }
        console.log("worst master flat, index:", worstFlatIndex);
        console.log("worst master flat, gas:", worstFlat);
        console.log("worst master with the ring, index:", worstRingIndex);
        console.log("worst master with the ring, gas:", worstRing);
        assertLt(worstRing, 45_000_000, "worst master at the yield cap");
        // Alpha is the heaviest of the fifty, and fixture 103 is the reason the
        // gas tests name it. Assert the pairing so a reordering of the recipes
        // fails here rather than quietly moving the worst case somewhere else.
        assertEq(worstRingIndex, 25, "heaviest master index");
        assertEq(worstFlatIndex, 25, "heaviest master index without the ring");
        assertEq(renderer.masterName(25), "Alpha", "master 25 is Alpha");
    }

    /// Master `i` over fixture 103's seed, backed and earning, as the token would
    /// build it once that coin has run up lifetime yield.
    function masterView(uint8 i, uint32 bps) internal pure returns (CoinView memory c) {
        c.seed = 210566752294031767;
        c.number = 604;
        c.series = 1;
        c.backing = 50;
        c.yieldBps = bps;
        c.master = i;
        c.fundedUnits = 50_000_000;
        c.lifetimeUnits = 500_000_000;
    }

    /// The renderer forwards the master table, and every master index must render.
    function test_MasterSurface() public {
        assertEq(renderer.masterCount(), 50, "master count");
        assertEq(renderer.masterName(0), "Genesis", "first master");
        assertEq(renderer.masterName(4), unicode"Möbius", "master name keeps its UTF-8 bytes");
        assertEq(renderer.masterName(49), "Halcyon", "last master");
        vm.expectRevert();
        renderer.masterName(50);
    }
}
