// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CoinView, ICoinRenderer} from "./ICoinRenderer.sol";
import {MasterRenderer} from "./MasterRenderer.sol";
import {CoinMetadata} from "./CoinMetadata.sol";
import {Pixels} from "./Pixels.sol";

/// @notice Byte-oriented port of the ONE TypeScript coin renderer.
contract CoinRenderer is ICoinRenderer {
    using Strings for uint256;

    uint8 private constant NONE_MASTER = 255;
    MasterRenderer public immutable MASTER_RENDERER;
    CoinMetadata public immutable METADATA_RENDERER;

    struct Design {
        uint8 material;
        uint8 ground;
        uint8 rim;
        uint8 field;
        uint8 symmetry;
        uint8 core;
        uint8 glyph;
        uint8 surface;
        uint8 halo;
        uint8 accent;
        uint8 anomaly;
        uint8 density;
        uint16 glyphBits;
        uint8 fieldA;
        uint8 fieldB;
        uint16 salt;
    }

    struct Rendered {
        bytes g;
        string[] colors;
        string masterName;
        string materialName;
        Design d;
        uint8 level;
    }

    constructor(address masterRenderer_, address metadataRenderer_) {
        MASTER_RENDERER = MasterRenderer(masterRenderer_);
        METADATA_RENDERER = CoinMetadata(metadataRenderer_);
    }

    function masterCount() external view returns (uint256) { return MASTER_RENDERER.count(); }
    function masterName(uint8 i) external view returns (string memory) { return MASTER_RENDERER.name(i); }

    function grid(CoinView calldata c) external view returns (bytes memory) {
        CoinView memory input = c;
        return _render(input).g;
    }

    function svg(CoinView calldata c) external view returns (string memory) {
        CoinView memory input = c;
        Rendered memory r = _render(input);
        return Pixels.svgOf(r.g, r.colors);
    }

    function json(CoinView calldata c) public view returns (string memory) {
        CoinView memory input = c;
        Rendered memory r = _render(input);
        return METADATA_RENDERER.metadata(input, r.g, r.colors, r.masterName, r.materialName, _traits(r.d), r.level);
    }

    function tokenURI(CoinView calldata c) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json(c))));
    }

    function _render(CoinView memory c) private view returns (Rendered memory r) {
        if (c.sealed_) return _sealed(c);
        r.d = _design(c.seed);
        r.level = _yieldLevel(c.yieldBps);
        if (c.master != NONE_MASTER) return _master(c, r);
        r.colors = _colors(r.d);
        r.g = _ordinaryGrid(c, r.d, r.level);
    }

    function _ordinaryGrid(CoinView memory c, Design memory d, uint8 level) private pure returns (bytes memory g) {
        g = new bytes(4096);
        bool eclipse = d.anomaly == 4;
        int256 shift = d.anomaly == 2 ? int256(4) : int256(0);
        for (uint256 y; y < 64; ++y) for (uint256 x; x < 64; ++x) {
            int256 dx = Pixels.dxOf(x);
            int256 dy = Pixels.dyOf(y);
            (int256 u, int256 v, uint256 r, uint256 a) = Pixels.px(x, y, d.symmetry);
            uint8 color;
            if (r > Pixels.RADIUS) color = _outside(x, y, r, a, d, level);
            else if (eclipse && (dx - 34) ** 2 + (dy + 34) ** 2 <= (2 * int256(Pixels.RADIUS) + 1) ** 2) color = Pixels.GROUND;
            else if (r >= Pixels.RADIUS - 3) color = _rim(x, y, dx, dy, r, a, d);
            else {
                color = _body(x, y, dx, dy, u, v, r, a, d);
                int256 cx = dx - 2 * shift;
                uint256 cr = Pixels.radiusOf(uint256(cx * cx + dy * dy));
                color = _core(cr, cx, dy, color, d);
            }
            g[y * 64 + x] = bytes1(color);
        }
        _glyph(g, d, shift);
        _crack(g, d);
        _ticks(g, c.seed);
        _legend(g, d.ground == 1 ? Pixels.DARK : Pixels.LIGHT, false, c.number, c.series, c.backing, c.seed);
    }

    function _sealed(CoinView memory c) private pure returns (Rendered memory r) {
        r.d = _design(0);
        r.d.halo = 0;
        r.d.anomaly = 0;
        r.d.rim = 0;
        r.d.surface = 1;
        r.d.symmetry = Pixels.QUAD;
        r.level = _yieldLevel(c.yieldBps);
        r.colors = new string[](7);
        r.colors[0] = "#0d0d10";
        r.colors[1] = "#6f7276";
        r.colors[2] = "#a6a9ad";
        r.colors[3] = "#44474b";
        r.colors[4] = "#1c1d1f";
        r.colors[5] = "#a6a9ad";
        r.colors[6] = "#ffffff";
        r.g = new bytes(4096);
        for (uint256 y; y < 64; ++y) for (uint256 x; x < 64; ++x) {
            int256 dx = Pixels.dxOf(x);
            int256 dy = Pixels.dyOf(y);
            (, , uint256 radius, uint256 angle) = Pixels.px(x, y, Pixels.QUAD);
            uint8 color;
            if (radius > Pixels.RADIUS) color = _outside(x, y, radius, angle, r.d, r.level);
            else if (radius >= Pixels.RADIUS - 3) color = _rim(x, y, dx, dy, radius, angle, r.d);
            else color = radius == Pixels.CORE ? Pixels.DARK : Pixels.BODY;
            r.g[y * 64 + x] = bytes1(color);
        }
        _legend(r.g, Pixels.LIGHT, true, c.number, c.series, c.backing, c.seed);
    }

    function _master(CoinView memory c, Rendered memory r) private view returns (Rendered memory) {
        r.masterName = MASTER_RENDERER.name(c.master);
        r.materialName = MASTER_RENDERER.materialName(c.master);
        r.colors = MASTER_RENDERER.colorsOf(c.master);
        r.g = MASTER_RENDERER.render(c.master);
        uint8 symmetry = MASTER_RENDERER.symmetry(c.master);
        // A master draws its halo and anomaly quiet. This aliases r.d rather than
        // copying it, which is safe because a master's metadata reports only the
        // recipe's material and never reads the drawn trait indices again.
        Design memory quiet = r.d;
        quiet.halo = 0;
        quiet.anomaly = 0;
        for (uint256 y; y < 64; ++y) for (uint256 x; x < 64; ++x) {
            (, , uint256 radius, uint256 angle) = Pixels.px(x, y, symmetry);
            if (radius > Pixels.RADIUS) r.g[y * 64 + x] = bytes1(_outside(x, y, radius, angle, quiet, r.level));
        }
        _ticks(r.g, c.seed);
        _legend(r.g, _eq(r.colors[0], "#ece8df") ? Pixels.DARK : Pixels.LIGHT, false, c.number, c.series, c.backing, c.seed);
        return r;
    }

    function _outside(uint256 x, uint256 y, uint256 r, uint256 a, Design memory d, uint8 level) private pure returns (uint8 color) {
        color = Pixels.GROUND;
        if (d.halo == 1) { if (r == Pixels.RADIUS + 2) color = Pixels.LIGHT; }
        else if (d.halo == 4) { if (r == Pixels.RADIUS + 2 || r == Pixels.RADIUS + 5) color = Pixels.LIGHT; }
        else if (d.halo == 2) { if (r >= Pixels.RADIUS + 2 && r <= Pixels.RADIUS + 4 && (a & 15) == 0) color = Pixels.LIGHT; }
        else if (d.halo == 3) { if (r == Pixels.RADIUS + 3 && (a & 7) == 0) color = Pixels.LIGHT; }
        else if (d.halo != 0) revert("halo out of range");
        if (level == 0) return color;
        int256 k = int256(r) - int256(Pixels.RADIUS + 2);
        if (r > Pixels.RADIUS + 8) return color;
        int256 orbit = k >= 0 && k % 2 == 0 ? k >> 1 : -1;
        if (orbit >= 0 && uint256(orbit) < (level < 4 ? level : 4)) {
            bool solid = level >= 5 + uint8(uint256(orbit));
            bool accent = level >= 13 + uint8(uint256(orbit)) || (d.anomaly == 1 && (a & 7) == 0);
            if (solid || (a & 3) < 2) color = accent ? Pixels.ACCENT : Pixels.LIGHT;
        } else if (level >= 9 && k >= 0) {
            uint32 spark = Pixels.hash32(int256(x), int256(y), int256(uint256(d.salt) + 1)) % 32;
            if (spark < level - 8) color = spark == 0 ? Pixels.ACCENT : Pixels.LIGHT;
        }
    }

    function _rim(uint256 x, uint256 y, int256 dx, int256 dy, uint256 r, uint256 a, Design memory d) private pure returns (uint8 color) {
        bool outer = r == Pixels.RADIUS;
        int256 lamp = dx + dy;
        color = lamp < -24 ? Pixels.LIGHT : lamp > 28 ? Pixels.DARK : Pixels.BODY;
        if (outer) color = lamp < 0 ? Pixels.LIGHT : Pixels.DARK;
        if (r == Pixels.RADIUS - 3) color = Pixels.DARK;
        bool inner = !outer && r > Pixels.RADIUS - 3;
        if (d.rim == 0) {}
        else if (d.rim == 1) { if (inner && (a & 1) == 1) color = Pixels.DARK; }
        else if (d.rim == 2) { if (inner) color = (a & 3) == 0 ? Pixels.LIGHT : Pixels.DARK; }
        else if (d.rim == 3) { if (inner && ((a >> 3) & 1) == 1) color = Pixels.DARK; }
        else if (d.rim == 4) {
            if (outer && (a & 3) != 0) color = Pixels.GROUND;
            else if (r == Pixels.RADIUS - 1 && (a & 3) == 0) color = Pixels.LIGHT;
        } else if (d.rim == 5) {
            uint256 gap = (uint256(d.fieldA) * 16) & 255;
            uint256 da = (a + 256 - gap) & 255;
            if (da < 10 || da > 246) color = Pixels.GROUND;
            else if (inner && ((a >> 3) & 1) == 1) color = Pixels.DARK;
        } else revert("rim out of range");
        if (d.anomaly == 5 && ((x + y) & 1) == 1) color = Pixels.GROUND;
    }

    function _body(uint256 x, uint256 y, int256 dx, int256 dy, int256 u, int256 v, uint256 r, uint256 a, Design memory d) private pure returns (uint8 color) {
        uint256 s = 2 + d.density;
        color = Pixels.BODY;
        int256 lamp = dx + dy;
        if (d.surface == 0) {
            if (lamp < -48 || (lamp < -36 && ((x + y) & 1) == 0)) color = Pixels.LIGHT;
            if (lamp > 48 || (lamp > 36 && ((x + y) & 1) == 0)) color = Pixels.DARK;
        }
        bool mark;
        if (d.field == 0) mark = r % (s + 1) == 0;
        else if (d.field == 1) mark = (((u + v) >> 1) % int256(s + 2)) == 0;
        else if (d.field == 2) mark = (((u >> s) + (v >> s)) & 1) == 1;
        else if (d.field == 3) mark = ((u >> 1) % int256(s + 2)) == 0 || ((v >> 1) % int256(s + 2)) == 0;
        else if (d.field == 4) mark = a % (2 << (s - 1)) == 0 && r > Pixels.CORE + 1;
        else if (d.field == 5) mark = (((r * 3 + (a >> (s + 1))) >> 1) & 1) == 1;
        else if (d.field == 6) mark = Pixels.hash32(u, v, int256(uint256(d.salt))) % 16 < (s - 1) * 2;
        else if (d.field == 7) mark = r == 13 + (d.fieldA & 3);
        else revert("field out of range");
        if (mark) color = Pixels.DARK;
        if (d.surface == 2) {
            uint32 h = Pixels.hash32(int256(x), int256(y), int256(uint256(d.salt) + 7)) % 12;
            if (h == 0) color = Pixels.DARK;
            else if (h == 1) color = Pixels.INK;
        } else if (d.surface > 3) revert("surface out of range");
    }

    function _core(uint256 cr, int256 cx, int256 dy, uint8 color, Design memory d) private pure returns (uint8) {
        if (cr > Pixels.CORE) return color;
        if (d.core == 0) return cr == Pixels.CORE ? Pixels.DARK : Pixels.BODY;
        if (d.core == 1) return cr == Pixels.CORE ? Pixels.DARK : cr >= Pixels.CORE - 2 ? Pixels.LIGHT : Pixels.BODY;
        if (d.core == 2) return cr == Pixels.CORE ? Pixels.DARK : Pixels.GROUND;
        if (d.core == 3) return cr == Pixels.CORE ? Pixels.DARK : cr <= 2 ? Pixels.GROUND : cr == 3 ? Pixels.LIGHT : Pixels.BODY;
        if (d.core == 4) {
            int256 gap = (d.fieldA & 1) == 0 ? cx : dy;
            if (gap > -3 && gap < 3) return Pixels.GROUND;
            return cr == Pixels.CORE ? Pixels.DARK : Pixels.BODY;
        }
        revert("core out of range");
    }

    function _glyph(bytes memory g, Design memory d, int256 shift) private pure {
        if (d.glyph == 5) return;
        uint8 slot = d.accent != 0 ? Pixels.ACCENT : d.core == 2 ? Pixels.LIGHT : Pixels.INK;
        int256 cx = 31 + shift;
        int256 cy = 31;
        uint16 bits = d.glyphBits;
        if (d.glyph == 0 || d.glyph == 1) {
            for (uint256 j; j < 4; ++j) for (uint256 i; i < 4; ++i) if (((bits >> (i * 4 + j)) & 1) == 1) {
                int256 ii = int256(i); int256 jj = int256(j);
                if (d.glyph == 0) { _set(g, cx - ii, cy - jj, slot); _set(g, cx + 1 + ii, cy - jj, slot); _set(g, cx - ii, cy + 1 + jj, slot); _set(g, cx + 1 + ii, cy + 1 + jj, slot); }
                else { _set(g, cx + 1 + ii, cy - jj, slot); _set(g, cx + 1 + jj, cy + 1 + ii, slot); _set(g, cx - ii, cy + 1 + jj, slot); _set(g, cx - jj, cy - ii, slot); }
            }
        } else if (d.glyph == 2) {
            int256 arm = 2 + int256(uint256(bits & 3));
            for (int256 k = -arm; k <= arm + 1; ++k) { _set(g, cx + k, cy, slot); _set(g, cx + k, cy + 1, slot); _set(g, cx, cy + k, slot); _set(g, cx + 1, cy + k, slot); }
            if ((bits & 4) != 0) for (int256 k = 1; k < arm; ++k) { _set(g, cx-k, cy-k, slot); _set(g, cx+1+k, cy-k, slot); _set(g, cx-k, cy+1+k, slot); _set(g, cx+1+k, cy+1+k, slot); }
        } else if (d.glyph == 3) {
            int256 arm = 3 + int256(uint256(bits & 3)); int256 width = int256(uint256((bits >> 2) & 1));
            for (int256 k = -arm; k <= arm + 1; ++k) for (int256 q = -width; q <= 1 + width; ++q) { _set(g, cx+k, cy+q, slot); _set(g, cx+q, cy+k, slot); }
        } else if (d.glyph == 4) {
            int256 rad = 1 + int256(uint256(bits & 1));
            for (int256 j = -rad; j <= rad + 1; ++j) for (int256 i = -rad; i <= rad + 1; ++i) { if (rad == 2 && (i == -2 || i == 3) && (j == -2 || j == 3)) continue; _set(g, cx+i, cy+j, slot); }
        } else revert("glyph out of range");
    }

    function _crack(bytes memory g, Design memory d) private pure {
        if (d.surface != 3) return;
        int256 x = 31 + int256(uint256(d.fieldA & 7)) - 4;
        int256 y = 9;
        for (uint256 step; step < 60 && y < 50; ++step) {
            _set(g, x, y, Pixels.INK);
            uint32 h = Pixels.hash32(x, y, int256(uint256(d.salt) + 3)) % 8;
            if (h < 3) ++x; else if (h < 6) --x;
            if (h != 7) ++y;
            if (h == 0 && y > 20) { _set(g, x + 1, y, Pixels.INK); _set(g, x + 2, y - 1, Pixels.INK); }
        }
    }

    function _ticks(bytes memory g, uint64 seed) private pure {
        uint32 bits = uint32(seed);
        for (uint256 i; i < 32; ++i) g[Pixels.tick(i)] = bytes1(((bits >> i) & 1) != 0 ? Pixels.LIGHT : Pixels.INK);
    }

    function _legend(bytes memory g, uint8 slot, bool isSealed, uint16 number, uint16 series, uint8 backing, uint64 seed) private pure {
        _band(g, string.concat("ONE ", _roman(series), " ", uint256(backing).toString()), 1, slot);
        _band(g, string.concat(_pad(number, 5), " ", isSealed ? "SEALED" : _fingerprint(seed)), 58, slot);
    }

    function _band(bytes memory g, string memory text, int256 y, uint8 slot) private pure {
        int256 width = int256(Pixels.textWidth(text));
        int256 x = (64 - width) >> 1;
        for (int256 j = y - 1; j <= y + 5; ++j) for (int256 i = x - 1; i <= x + width; ++i) _set(g, i, j, Pixels.GROUND);
        Pixels.stamp(g, text, x, y, slot);
    }

    function _set(bytes memory g, int256 x, int256 y, uint8 color) private pure {
        if (x >= 0 && y >= 0 && x < 64 && y < 64) g[uint256(y) * 64 + uint256(x)] = bytes1(color);
    }

    function _colors(Design memory d) private pure returns (string[] memory colors) {
        (string memory base, string memory light, string memory dark, string memory ink) = _materialColors(d.material);
        bool inverted = d.anomaly == 3;
        colors = new string[](7);
        colors[0] = d.ground == 0 ? "#0d0d10" : d.ground == 1 ? "#ece8df" : d.ground == 2 ? dark : _badGround();
        colors[1] = inverted ? dark : base;
        colors[2] = inverted ? base : light;
        colors[3] = inverted ? ink : dark;
        colors[4] = inverted ? light : ink;
        string memory accent = _accentColor(d.accent);
        colors[5] = bytes(accent).length != 0 ? accent : (inverted ? base : light);
        colors[6] = "#ffffff";
    }

    function _design(uint64 seed) private pure returns (Design memory d) {
        uint64 state = seed;
        (state, d.material) = _pick(state, 0); (state, d.ground) = _pick(state, 1); (state, d.rim) = _pick(state, 2); (state, d.field) = _pick(state, 3);
        (state, d.symmetry) = _pick(state, 4); (state, d.core) = _pick(state, 5); (state, d.glyph) = _pick(state, 6); (state, d.surface) = _pick(state, 7);
        (state, d.halo) = _pick(state, 8); (state, d.accent) = _pick(state, 9); (state, d.anomaly) = _pick(state, 10);
        uint16 v;
        (state, v) = _bits(state); d.density = uint8(v % 4);
        (state, d.glyphBits) = _bits(state);
        (state, v) = _bits(state); d.fieldA = uint8(v % 16);
        (state, v) = _bits(state); d.fieldB = uint8(v % 16);
        (state, d.salt) = _bits(state);
    }

    function _bits(uint64 state) private pure returns (uint64, uint16 value) {
        unchecked {
            state += 1;
            uint64 z = state + 0x9e3779b97f4a7c15;
            z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9;
            z = (z ^ (z >> 27)) * 0x94d049bb133111eb;
            z = z ^ (z >> 31);
            return (state, uint16(z >> 48));
        }
    }

    function _pick(uint64 state, uint8 table) private pure returns (uint64 next, uint8) {
        uint16 v; (next, v) = _bits(state);
        if (table == 0) return (next, _choose(v, 220,160,130,70,110,90,60,45,45,28,22,20));
        if (table == 1) return (next, _choose(v, 640,240,120,0,0,0,0,0,0,0,0,0));
        if (table == 2) return (next, _choose(v, 300,300,170,140,82,8,0,0,0,0,0,0));
        if (table == 3) return (next, _choose(v, 220,160,140,120,130,90,90,50,0,0,0,0));
        if (table == 4) return (next, _choose(v, 250,350,280,120,0,0,0,0,0,0,0,0));
        if (table == 5) return (next, _choose(v, 420,240,140,130,70,0,0,0,0,0,0,0));
        if (table == 6) return (next, _choose(v, 300,200,180,120,140,60,0,0,0,0,0,0));
        if (table == 7) return (next, _choose(v, 450,340,190,20,0,0,0,0,0,0,0,0));
        if (table == 8) return (next, _choose(v, 500,220,120,100,60,0,0,0,0,0,0,0));
        if (table == 9) return (next, _choose(v, 640,90,80,80,45,40,25,0,0,0,0,0));
        if (table == 10) return (next, _choose(v, 968,8,8,6,6,4,0,0,0,0,0,0));
        revert("draw table out of range");
    }

    function _choose(uint16 value, uint16 a, uint16 b, uint16 c, uint16 d, uint16 e, uint16 f, uint16 g, uint16 h, uint16 i, uint16 j, uint16 k, uint16 l) private pure returns (uint8) {
        uint16 total = a+b+c+d+e+f+g+h+i+j+k+l; value %= total;
        if (value < a) return 0; value -= a; if (value < b) return 1; value -= b; if (value < c) return 2; value -= c; if (value < d) return 3; value -= d;
        if (value < e) return 4; value -= e; if (value < f) return 5; value -= f; if (value < g) return 6; value -= g; if (value < h) return 7; value -= h;
        if (value < i) return 8; value -= i; if (value < j) return 9; value -= j; if (value < k) return 10; return 11;
    }

    function _yieldLevel(uint32 bps) private pure returns (uint8 level) {
        uint32[14] memory steps = [uint32(1),100,250,500,1000,2000,3500,5000,7500,10000,15000,20000,30000,50000];
        for (uint256 i; i < 14; ++i) if (bps >= steps[i]) ++level;
    }

    function _traits(Design memory d) private pure returns (uint8[11] memory values) {
        values = [d.material, d.ground, d.rim, d.field, d.symmetry, d.core, d.glyph, d.surface, d.halo, d.accent, d.anomaly];
    }
    function _materialColors(uint8 i) private pure returns(string memory,string memory,string memory,string memory) { if(i==0)return("#b9bec6","#eef0f3","#6b7280","#2d3138");if(i==1)return("#b8734a","#e8b58e","#7a4528","#3b2114");if(i==2)return("#9a7a48","#d6b986","#5c4624","#2f2412");if(i==3)return("#d0a640","#f5dc8a","#8a6a1e","#4a370c");if(i==4)return("#6f7276","#a6a9ad","#44474b","#1c1d1f");if(i==5)return("#e9e0cc","#fbf7ee","#b3a483","#5b5040");if(i==6)return("#3956a3","#8ea4dd","#243a70","#101a38");if(i==7)return("#d69aa8","#f3d2d9","#9a5f6d","#4d2a33");if(i==8)return("#5f9d7c","#a8d6bd","#3b6a52","#1a3328");if(i==9)return("#26242c","#4e4a56","#141318","#8a8494");if(i==10)return("#d98a2b","#f7c67a","#8f5717","#4a2c0a");if(i==11)return("#4f8f8b","#9dcfca","#2f5f5c","#153331");revert("material out of range"); }
    function _accentColor(uint8 i) private pure returns(string memory){if(i==0)return"";if(i==1)return"#d23b45";if(i==2)return"#3a8ae6";if(i==3)return"#f5b82e";if(i==4)return"#4fd1a0";if(i==5)return"#9a6ee6";if(i==6)return"#ffffff";revert("accent out of range");}

    function _roman(uint16 value) private pure returns (string memory out) { while(value>=10){out=string.concat(out,"X");value-=10;}if(value>=9){out=string.concat(out,"IX");value-=9;}if(value>=5){out=string.concat(out,"V");value-=5;}if(value>=4){out=string.concat(out,"IV");value-=4;}while(value!=0){out=string.concat(out,"I");--value;} }
    function _pad(uint256 value, uint256 width) private pure returns (string memory) { string memory text=value.toString();uint256 n=bytes(text).length;if(n>=width)return text;bytes memory zeroes=new bytes(width-n);for(uint256 i;i<zeroes.length;++i)zeroes[i]="0";return string.concat(string(zeroes),text); }
    function _fingerprint(uint64 seed) private pure returns (string memory) { bytes memory out=new bytes(8);uint32 value=uint32(seed>>32);bytes16 alphabet="0123456789ABCDEF";for(uint256 i;i<8;++i)out[7-i]=alphabet[value>>(i*4)&15];return string(out); }
    function _eq(string memory a,string memory b) private pure returns(bool){return keccak256(bytes(a))==keccak256(bytes(b));}
    function _badGround() private pure returns(string memory){revert("ground out of range");}
}
