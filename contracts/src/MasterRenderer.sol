// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Pixels} from "./Pixels.sol";

/// @notice The fifty fixed master recipes. Rendering needs no storage or seed.
contract MasterRenderer {
    uint256 private constant N = 64;
    uint256 private constant RADIUS = 23;
    uint256 private constant CORE = 8;

    uint8 private constant BODY = 1;
    uint8 private constant LIGHT = 2;
    uint8 private constant DARK = 3;
    uint8 private constant INK = 4;
    uint8 private constant ACCENT = 5;
    uint8 private constant EXTRA1 = 7;
    uint8 private constant EXTRA2 = 8;
    uint8 private constant EXTRA3 = 9;

    struct Recipe {
        uint8 mode;
        uint8 material;
        uint8 symmetry_;
        uint8 a;
        uint8 b;
        bytes7 bg;
        bytes7 accent;
        bytes7 extra1;
        bytes7 extra2;
        bytes7 extra3;
    }

    struct Material {
        string name;
        bytes7 base;
        bytes7 light;
        bytes7 dark;
        bytes7 ink;
    }

    function count() external pure returns (uint256) { return 50; }

    function name(uint8 i) external pure returns (string memory) {
        _checkIndex(i);
        if (i == 0) return "Genesis";
        if (i == 1) return "The Void";
        if (i == 2) return "Eclipse";
        if (i == 3) return "Singularity";
        if (i == 4) return unicode"Möbius";
        if (i == 5) return "Prism";
        if (i == 6) return "Supernova";
        if (i == 7) return "Black Sun";
        if (i == 8) return "The Mirror";
        if (i == 9) return "Zero";
        if (i == 10) return "Infinite";
        if (i == 11) return "Fracture";
        if (i == 12) return "Lattice";
        if (i == 13) return "Spiral";
        if (i == 14) return "Vertex";
        if (i == 15) return "Lodestar";
        if (i == 16) return "Meridian";
        if (i == 17) return "Obelisk";
        if (i == 18) return "Oracle";
        if (i == 19) return "Labyrinth";
        if (i == 20) return "Radiance";
        if (i == 21) return "Ziggurat";
        if (i == 22) return "Comet";
        if (i == 23) return "Oculus";
        if (i == 24) return "Crown";
        if (i == 25) return "Alpha";
        if (i == 26) return "Abyss";
        if (i == 27) return "Umbra";
        if (i == 28) return "Cipher";
        if (i == 29) return "Tide";
        if (i == 30) return "Aurora";
        if (i == 31) return "Quasar";
        if (i == 32) return "Corona";
        if (i == 33) return "Antimatter";
        if (i == 34) return "Monolith";
        if (i == 35) return "Ouroboros";
        if (i == 36) return "Relic";
        if (i == 37) return "Tessellation";
        if (i == 38) return "Helix";
        if (i == 39) return "Keystone";
        if (i == 40) return "Pulsar";
        if (i == 41) return "Equinox";
        if (i == 42) return "Anvil";
        if (i == 43) return "Aether";
        if (i == 44) return "Enigma";
        if (i == 45) return "Ember";
        if (i == 46) return "Zenith";
        if (i == 47) return "Nadir";
        if (i == 48) return "Omega";
        if (i == 49) return "Halcyon";
        revert("master out of range");
    }

    function materialName(uint8 i) external pure returns (string memory) {
        _checkIndex(i);
        return _material(_recipe(i).material).name;
    }

    function symmetry(uint8 i) external pure returns (uint8) {
        _checkIndex(i);
        return _recipe(i).symmetry_;
    }

    function colorsOf(uint8 i) external pure returns (string[] memory colors) {
        _checkIndex(i);
        Recipe memory recipe = _recipe(i);
        Material memory material = _material(recipe.material);
        colors = new string[](10);
        colors[0] = string(abi.encodePacked(recipe.bg));
        colors[1] = string(abi.encodePacked(material.base));
        colors[2] = string(abi.encodePacked(material.light));
        colors[3] = string(abi.encodePacked(material.dark));
        colors[4] = string(abi.encodePacked(material.ink));
        colors[5] = string(abi.encodePacked(recipe.accent));
        colors[6] = "#ffffff";
        colors[7] = string(abi.encodePacked(recipe.extra1 == bytes7(0) ? material.light : recipe.extra1));
        colors[8] = string(abi.encodePacked(recipe.extra2 == bytes7(0) ? material.dark : recipe.extra2));
        colors[9] = string(abi.encodePacked(recipe.extra3 == bytes7(0) ? recipe.accent : recipe.extra3));
    }

    function render(uint8 i) external pure returns (bytes memory g) {
        _checkIndex(i);
        Recipe memory recipe = _recipe(i);
        g = new bytes(N * N);
        for (uint256 y = 0; y < N; ++y) for (uint256 x = 0; x < N; ++x) {
            int256 dx = Pixels.dxOf(x);
            int256 dy = Pixels.dyOf(y);
            uint256 rr = Pixels.rrOf(dx, dy);
            uint256 r = Pixels.radiusOf(rr);
            if (r <= RADIUS) {
                (int256 u, int256 v,, uint256 a) = Pixels.px(x, y, recipe.symmetry_);
                uint256 ax = Pixels.absOf(dx);
                uint256 ay = Pixels.absOf(dy);
                g[y * N + x] = bytes1(_masterPixel(recipe, x, y, dx, dy, ax, ay, u, v, r, a));
            }
        }
    }

    function _masterPixel(
        Recipe memory recipe, uint256 x, uint256 y, int256 dx, int256 dy,
        uint256 ax, uint256 ay, int256 u, int256 v, uint256 r, uint256 a
    ) private pure returns (uint8) {
        // The TypeScript only mentions design in maze as d.salt * 0 + 77, so it is constant.
        if (r >= RADIUS - 3 && recipe.mode != 8 && recipe.mode != 6) return _rim(dx, dy, r);
        int256 lamp = dx + dy;
        if (recipe.mode == 0) {
            if (ax <= 1 && dy >= -2 * int256(uint256(recipe.a)) - 1 && dy <= -2 * int256(uint256(recipe.a)) + 1) return ACCENT;
            if (recipe.b != 0 && r == 2) return LIGHT;
            return r % 7 == 0 ? DARK : BODY;
        }
        if (recipe.mode == 1) {
            int256 off = 2 * int256(uint256(recipe.a));
            bool shadow = (dx - off) ** 2 + (dy + (recipe.b != 0 ? off : int256(0))) ** 2 <= (2 * 17) ** 2;
            if (r <= 18) return shadow ? 0 : r == 18 ? ACCENT : LIGHT;
            return (a & 7) == 0 ? LIGHT : BODY;
        }
        if (recipe.mode == 2) {
            if (r <= 1) return ACCENT;
            uint256 band = uint256(recipe.a) / (r + 2);
            return (band & 1) == (uint256(recipe.b) & 1) ? DARK : LIGHT;
        }
        if (recipe.mode == 3) {
            int256 A = int256(uint256(recipe.a));
            int256 B = int256(uint256(recipe.b));
            int256 e1 = dx * dx * B * B + dy * dy * A * A;
            int256 e2 = dy * dy * B * B + dx * dx * A * A;
            int256 limit = A * A * B * B;
            int256 inner = limit * 9 / 16;
            bool in1 = e1 <= limit && e1 >= inner;
            bool in2 = e2 <= limit && e2 >= inner;
            if (in1 && in2) return dx * dy > 0 ? LIGHT : DARK;
            if (in1) return LIGHT;
            if (in2) return DARK;
            return r <= 3 ? ACCENT : BODY;
        }
        if (recipe.mode == 4) {
            if (r <= 5) return r == 5 ? DARK : BODY;
            uint256 product = a * uint256(recipe.a);
            if (recipe.b != 0 && product % 64 < 2) return INK;
            // The TypeScript sector list is [accent, extra1, extra2, extra3, light, dark].
            // Indexed without a memory array so the pixel loop allocates nothing.
            return _prismSector((product / 64) % 6);
        }
        if (recipe.mode == 5) {
            if (r <= 2) return ACCENT;
            if (r <= 5) return LIGHT;
            // Both supernova recipes have non-zero a and b, as required by these moduli.
            bool longRay = a % uint256(recipe.b) < 2;
            bool shortRay = a % uint256(recipe.a) < 2 && r < 14;
            return longRay || shortRay ? LIGHT : BODY;
        }
        if (recipe.mode == 6) {
            if (r <= recipe.a) return r == recipe.a ? ACCENT : DARK;
            if (r <= uint256(recipe.a) + 4) return ((x + y) & 1) == 0 ? LIGHT : recipe.b != 0 ? ACCENT : BODY;
            if (r <= RADIUS) return (a & 3) == 0 ? LIGHT : r == RADIUS ? DARK : BODY;
            return BODY;
        }
        if (recipe.mode == 7) {
            bool right = recipe.a == 0 ? dx > 0 : recipe.a == 1 ? dy > 0 : dx + dy > 0;
            if (r <= CORE) return r == CORE ? ACCENT : right ? BODY : DARK;
            return right ? DARK : BODY;
        }
        if (recipe.mode == 8) {
            if (r >= RADIUS - 1) return DARK;
            if (r >= recipe.a && r <= recipe.b) return r == recipe.a || r == recipe.b ? INK : DARK;
            return r <= 1 ? ACCENT : BODY;
        }
        if (recipe.mode == 9) {
            uint256 step = 256 / uint256(recipe.a);
            if (a % step < 3 && r > 3) return 0;
            if (r == recipe.b && (a & 15) < 11) return 0;
            if (r <= 2) return ACCENT;
            return lamp < -20 ? LIGHT : BODY;
        }
        if (recipe.mode == 10) {
            if (r <= 3) return ACCENT;
            if (r <= CORE) return (a & 31) < 4 ? ACCENT : LIGHT;
            if (r == CORE + 1) return DARK;
            // Genesis uses Octant symmetry, hence u + v is non-negative before its shift.
            if (((u + v) >> 1) % int256(uint256(recipe.b)) == 0) return LIGHT;
            return r % uint256(recipe.a) == 0 ? DARK : BODY;
        }
        if (recipe.mode == 11) {
            int256 off = 2 * int256(uint256(recipe.a));
            uint256 r1 = Pixels.radiusOf(Pixels.rrOf(dx - off, dy));
            uint256 r2 = Pixels.radiusOf(Pixels.rrOf(dx + off, dy));
            uint256 ring = uint256(recipe.a) - 1;
            bool on1 = r1 >= ring - 1 && r1 <= ring;
            bool on2 = r2 >= ring - 1 && r2 <= ring;
            if (on1 && on2) return ACCENT;
            if (on1 || on2) return LIGHT;
            if (r1 < ring - 1 || r2 < ring - 1) return recipe.b != 0 ? DARK : BODY;
            return BODY;
        }
        if (recipe.mode == 12) {
            bool gx = (ax >> 1) % recipe.a == 0;
            bool gy = (ay >> 1) % recipe.a == 0;
            if (gx && gy) return recipe.b != 0 ? ACCENT : LIGHT;
            return gx || gy ? DARK : BODY;
        }
        if (recipe.mode == 13) {
            if (r <= 2) return ACCENT;
            uint256 turn = (r * 4 + (a >> 2)) / recipe.a;
            return (turn & 1) == 0 ? recipe.b != 0 ? LIGHT : DARK : BODY;
        }
        if (recipe.mode == 14) {
            uint256 cell = uint256(recipe.a) + 1;
            // dx + 63 and dy + 63 equal 2*x and 2*y and are non-negative.
            uint256 on = ((2 * x >> cell) + (2 * y >> cell)) & 1;
            if (r <= 2) return ACCENT;
            return on == 0 ? recipe.b != 0 ? DARK : LIGHT : recipe.b != 0 ? BODY : DARK;
        }
        if (recipe.mode == 15) {
            if (r <= 2) return ACCENT;
            uint256 band = r / recipe.a;
            return (band & 1) == recipe.b ? LIGHT : DARK;
        }
        if (recipe.mode == 16) {
            if (r <= 2) return ACCENT;
            bool wide = recipe.a != 0 ? ay > ax : ax > ay;
            int256 diagonal = (dx < 0 ? -dx : dx) - (dy < 0 ? -dy : dy);
            if (diagonal > -2 && diagonal < 2) return INK;
            return wide ? DARK : LIGHT;
        }
        if (recipe.mode == 17) {
            uint256 width = 2 * uint256(recipe.a);
            if (ax < width && ay < width) return ACCENT;
            if (ax < width || ay < width) return LIGHT;
            int256 diagonal = (dx < 0 ? -dx : dx) - (dy < 0 ? -dy : dy);
            if (recipe.b != 0 && diagonal > -2 && diagonal < 2) return DARK;
            return BODY;
        }
        if (recipe.mode == 18) {
            if (r <= 4) return r == 4 ? DARK : LIGHT;
            uint256 orbit = recipe.a;
            bool satellite = orbit != 0 && r >= orbit - 1 && r <= orbit + 1 && a % recipe.b < 6;
            if (satellite) return ACCENT;
            return r == orbit ? DARK : BODY;
        }
        if (recipe.mode == 19) {
            if (r <= 2) return ACCENT;
            // These are arithmetic shifts, matching JavaScript >> even if a recipe changes symmetry.
            int256 cx = u >> recipe.a;
            int256 cy = v >> recipe.a;
            return Pixels.hash32(cx, cy, 77) % recipe.b == 0 ? DARK : BODY;
        }
        if (recipe.mode == 20) {
            if (r == 0) return ACCENT;
            if (r == 1 || r == 2 || r == 3 || r == 5 || r == 8 || r == 13 || r == 21) return recipe.a != 0 ? LIGHT : DARK;
            return recipe.a != 0 ? DARK : BODY;
        }
        if (recipe.mode == 21) {
            uint256 box = (ax > ay ? ax : ay) >> 1;
            if (box <= 2) return ACCENT;
            uint256 band = box / recipe.a;
            return (band & 1) == recipe.b ? LIGHT : DARK;
        }
        if (recipe.mode == 22) {
            bool head = (dx - 20) ** 2 + (dy - 20) ** 2 <= (2 * 5) ** 2;
            if (head) return ACCENT;
            bool along = dx < 20 && dy < 20 && dx > -46 && dy > -46;
            // 20 - dx can be negative, so this must remain an arithmetic signed shift.
            int256 width = 14 - ((20 - dx) >> 2);
            if (width < 2) width = 2;
            int256 across = dx - dy;
            if (along && across > -width && across < width) return recipe.a != 0 ? LIGHT : ((x + y) & 1) == 0 ? LIGHT : BODY;
            return BODY;
        }
        if (recipe.mode == 23) {
            int256 ellipse = dx * dx * 144 + dy * dy * 1296;
            if (r <= 3) return INK;
            if (r <= 6) return r == 6 ? DARK : ACCENT;
            if (ellipse <= 186624) return recipe.a != 0 ? DARK : LIGHT;
            return ellipse <= 230000 ? DARK : BODY;
        }
        if (recipe.mode == 24) {
            if (r <= 3) return ACCENT;
            if (ay < 4) return DARK;
            if (dy < 0 && a % recipe.a < 3) return LIGHT;
            if (dy > 0 && recipe.b != 0 && r % 4 == 0) return DARK;
            return BODY;
        }
        // Recipe construction only emits modes 0..24, so this default cannot be reached.
        // forge-lint: disable-next-line(require-revert-in-loop)
        revert("mode out of range");
    }

    /// @notice Slot for prism sector `i`, mirroring the TypeScript `sectors` array.
    function _prismSector(uint256 i) private pure returns (uint8) {
        if (i == 0) return ACCENT;
        if (i == 1) return EXTRA1;
        if (i == 2) return EXTRA2;
        if (i == 3) return EXTRA3;
        if (i == 4) return LIGHT;
        return DARK;
    }

    function _rim(int256 dx, int256 dy, uint256 r) private pure returns (uint8) {
        if (r == RADIUS) return dx + dy < 0 ? LIGHT : DARK;
        if (r == RADIUS - 3) return DARK;
        return dx + dy < -24 ? LIGHT : dx + dy > 28 ? DARK : BODY;
    }

    function _checkIndex(uint8 i) private pure { require(i < 50, "master out of range"); }

    function _recipe(uint8 i) private pure returns (Recipe memory) {
        _checkIndex(i);
        if (i == 0) return _r(10,3,2,"#0d0d10","#ffffff",4,6,"","","");
        if (i == 1) return _r(0,9,1,"#0d0d10","#ffffff",9,0,"","","");
        if (i == 2) return _r(1,3,0,"#0d0d10","#ffffff",14,0,"","","");
        if (i == 3) return _r(2,4,1,"#0d0d10","#ffffff",140,0,"","","");
        if (i == 4) return _r(3,0,1,"#0d0d10","#3a8ae6",40,16,"","","");
        if (i == 5) return _r(4,5,1,"#ece8df","#d23b45",5,0,"#3a8ae6","#f5b82e","#4fd1a0");
        if (i == 6) return _r(5,10,2,"#0d0d10","#ffffff",8,16,"","","");
        if (i == 7) return _r(6,9,1,"#ece8df","#f5b82e",15,0,"","","");
        if (i == 8) return _r(7,0,0,"#0d0d10","#ffffff",0,0,"","","");
        if (i == 9) return _r(8,5,1,"#0d0d10","#d23b45",10,16,"","","");
        if (i == 10) return _r(11,6,1,"#0d0d10","#ffffff",18,8,"","","");
        if (i == 11) return _r(9,8,1,"#0d0d10","#ffffff",5,12,"","","");
        if (i == 12) return _r(12,1,1,"#0d0d10","#ffffff",5,0,"","","");
        if (i == 13) return _r(13,11,1,"#0d0d10","#ffffff",6,0,"","","");
        if (i == 14) return _r(14,4,1,"#ece8df","#d23b45",3,0,"","","");
        if (i == 15) return _r(15,0,1,"#0d0d10","#f5b82e",3,0,"","","");
        if (i == 16) return _r(16,1,1,"#0d0d10","#ffffff",0,0,"","","");
        if (i == 17) return _r(17,4,1,"#0d0d10","#ffffff",5,0,"","","");
        if (i == 18) return _r(18,5,1,"#0d0d10","#9a6ee6",14,64,"","","");
        if (i == 19) return _r(19,2,1,"#0d0d10","#ffffff",2,3,"","","");
        if (i == 20) return _r(20,10,1,"#ece8df","#ffffff",0,0,"","","");
        if (i == 21) return _r(21,2,1,"#0d0d10","#f5b82e",2,0,"","","");
        if (i == 22) return _r(22,6,1,"#0d0d10","#ffffff",0,0,"","","");
        if (i == 23) return _r(23,8,1,"#0d0d10","#f5b82e",0,0,"","","");
        if (i == 24) return _r(24,3,0,"#0d0d10","#d23b45",16,0,"","","");
        if (i == 25) return _r(10,0,2,"#ece8df","#3a8ae6",3,5,"","","");
        if (i == 26) return _r(0,11,1,"#0d0d10","#4fd1a0",5,1,"","","");
        if (i == 27) return _r(1,4,0,"#ece8df","#d23b45",10,1,"","","");
        if (i == 28) return _r(2,9,1,"#0d0d10","#4fd1a0",90,1,"","","");
        if (i == 29) return _r(3,11,1,"#ece8df","#ffffff",36,20,"","","");
        if (i == 30) return _r(4,6,1,"#0d0d10","#4fd1a0",4,1,"#9a6ee6","#3a8ae6","#f3d2d9");
        if (i == 31) return _r(5,6,2,"#0d0d10","#ffffff",4,32,"","","");
        if (i == 32) return _r(6,3,1,"#0d0d10","#ffffff",13,1,"","","");
        if (i == 33) return _r(7,9,0,"#ece8df","#ffffff",1,0,"","","");
        if (i == 34) return _r(8,9,1,"#ece8df","#ffffff",6,18,"","","");
        if (i == 35) return _r(11,3,1,"#0d0d10","#d23b45",16,6,"","","");
        if (i == 36) return _r(9,2,1,"#ece8df","#ffffff",7,10,"","","");
        if (i == 37) return _r(12,5,1,"#0d0d10","#3a8ae6",4,1,"","","");
        if (i == 38) return _r(13,7,1,"#0d0d10","#ffffff",4,1,"","","");
        if (i == 39) return _r(14,8,1,"#0d0d10","#f5b82e",2,1,"","","");
        if (i == 40) return _r(15,6,1,"#ece8df","#d23b45",2,1,"","","");
        if (i == 41) return _r(16,8,1,"#ece8df","#ffffff",1,0,"","","");
        if (i == 42) return _r(17,2,1,"#ece8df","#d23b45",4,1,"","","");
        if (i == 43) return _r(18,0,1,"#0d0d10","#3a8ae6",12,32,"","","");
        if (i == 44) return _r(19,9,1,"#0d0d10","#4fd1a0",2,2,"","","");
        if (i == 45) return _r(20,1,1,"#0d0d10","#f5b82e",1,0,"","","");
        if (i == 46) return _r(21,3,1,"#ece8df","#ffffff",3,1,"","","");
        if (i == 47) return _r(22,9,1,"#0d0d10","#9a6ee6",1,0,"","","");
        if (i == 48) return _r(23,7,1,"#ece8df","#2d3138",1,0,"","","");
        if (i == 49) return _r(24,7,0,"#0d0d10","#f5b82e",12,1,"","","");
        revert("master out of range");
    }

    function _r(uint8 mode, uint8 material, uint8 symmetry_, bytes7 bg, bytes7 accent, uint8 a, uint8 b, bytes7 e1, bytes7 e2, bytes7 e3) private pure returns (Recipe memory) {
        return Recipe(mode, material, symmetry_, a, b, bg, accent, e1, e2, e3);
    }

    function _material(uint8 i) private pure returns (Material memory) {
        if (i == 0) return Material("Silver", "#b9bec6", "#eef0f3", "#6b7280", "#2d3138");
        if (i == 1) return Material("Copper", "#b8734a", "#e8b58e", "#7a4528", "#3b2114");
        if (i == 2) return Material("Bronze", "#9a7a48", "#d6b986", "#5c4624", "#2f2412");
        if (i == 3) return Material("Gold", "#d0a640", "#f5dc8a", "#8a6a1e", "#4a370c");
        if (i == 4) return Material("Iron", "#6f7276", "#a6a9ad", "#44474b", "#1c1d1f");
        if (i == 5) return Material("Ivory", "#e9e0cc", "#fbf7ee", "#b3a483", "#5b5040");
        if (i == 6) return Material("Cobalt", "#3956a3", "#8ea4dd", "#243a70", "#101a38");
        if (i == 7) return Material("Rose", "#d69aa8", "#f3d2d9", "#9a5f6d", "#4d2a33");
        if (i == 8) return Material("Jade", "#5f9d7c", "#a8d6bd", "#3b6a52", "#1a3328");
        if (i == 9) return Material("Obsidian", "#26242c", "#4e4a56", "#141318", "#8a8494");
        if (i == 10) return Material("Amber", "#d98a2b", "#f7c67a", "#8f5717", "#4a2c0a");
        if (i == 11) return Material("Verdigris", "#4f8f8b", "#9dcfca", "#2f5f5c", "#153331");
        revert("material out of range");
    }
}
