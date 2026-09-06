// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Shared integer pixel geometry and compact SVG encoding.
library Pixels {
    uint256 internal constant N = 64;
    uint256 internal constant RADIUS = 23;
    uint256 internal constant CORE = 8;

    uint8 internal constant GROUND = 0;
    uint8 internal constant BODY = 1;
    uint8 internal constant LIGHT = 2;
    uint8 internal constant DARK = 3;
    uint8 internal constant INK = 4;
    uint8 internal constant ACCENT = 5;
    uint8 internal constant WHITE = 6;
    uint8 internal constant EXTRA1 = 7;
    uint8 internal constant EXTRA2 = 8;
    uint8 internal constant EXTRA3 = 9;

    uint8 internal constant MIRROR = 0;
    uint8 internal constant QUAD = 1;
    uint8 internal constant OCTANT = 2;
    uint8 internal constant TURN = 3;

    // Generated from TypeScript: ring pixel at r == RADIUS - 3 nearest to i * 8,
    // with ties broken by smaller y and then smaller x.
    bytes internal constant TICKS = hex"07f406b305b204f0046e03ec036902e402df02db035603d3045104cf058d068c07cb090b0a4d0b0f0b910c130c960cda0d1f0ce40ca90c2c0bae0b300a720933";

    /// @notice Largest k satisfying 4 * k * k <= rr, equal to isqrt(rr) >> 1.
    /// @dev This runs at least once per pixel, so the binary search over 0..63 is
    /// unrolled and unchecked. Nothing here can overflow: the largest product is
    /// 4 * 95 * 95, and rr never exceeds 2 * 127 * 127.
    function radiusOf(uint256 rr) internal pure returns (uint256 k) {
        unchecked {
            uint256 t = k + 32; if (4 * t * t <= rr) k = t;
            t = k + 16; if (4 * t * t <= rr) k = t;
            t = k + 8;  if (4 * t * t <= rr) k = t;
            t = k + 4;  if (4 * t * t <= rr) k = t;
            t = k + 2;  if (4 * t * t <= rr) k = t;
            t = k + 1;  if (4 * t * t <= rr) k = t;
        }
    }

    /// @notice JavaScript Math.imul hash, with uint32 wrapping at every step.
    function hash32(int256 x, int256 y, int256 salt) internal pure returns (uint32) {
        unchecked {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint32 h = uint32(int32(x)) * uint32(374761393)
                // forge-lint: disable-next-line(unsafe-typecast)
                + uint32(int32(y)) * uint32(668265263)
                // forge-lint: disable-next-line(unsafe-typecast)
                + uint32(int32(salt)) * uint32(2246822519);
            h = (h ^ (h >> 13)) * uint32(1274126177);
            return h ^ (h >> 16);
        }
    }

    // The three helpers below run once per pixel. Callers enumerate x and y in
    // 0..63, so dx and dy stay in -63..63, and the only caller that offsets them
    // first is the infinite master mode, which keeps them inside -99..99. Every
    // product below therefore fits far inside 256 bits and the checks are waste.

    function dxOf(uint256 x) internal pure returns (int256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        unchecked { return int256(2 * x) - 63; }
    }

    function dyOf(uint256 y) internal pure returns (int256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        unchecked { return int256(2 * y) - 63; }
    }

    function absOf(int256 value) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        unchecked { return uint256(value < 0 ? -value : value); }
    }

    function rrOf(int256 dx, int256 dy) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        unchecked { return uint256(dx * dx + dy * dy); }
    }

    /// @notice The pseudo angle of an offset, 0..255, counter clockwise from the
    /// right. No trigonometry: it is the octant plus the slope inside it.
    /// @dev dx and dy are always odd, so neither is zero and `big` is at least 1.
    function angleOf(int256 dx, int256 dy, uint256 ax, uint256 ay) internal pure returns (uint256 a) {
        unchecked {
            uint256 big = ax > ay ? ax : ay;
            uint256 small = ax > ay ? ay : ax;
            uint256 slope = small * 32 / big;
            uint256 oct;
            if (dx > 0 && dy < 0) oct = ax >= ay ? 0 : 1;
            else if (dx < 0 && dy < 0) oct = ay >= ax ? 2 : 3;
            else if (dx < 0 && dy > 0) oct = ax >= ay ? 4 : 5;
            else oct = ay >= ax ? 6 : 7;
            a = ((oct & 1) == 0 ? oct * 32 + slope : oct * 32 + (32 - slope)) & 255;
        }
    }

    /// @notice Folds an offset into the fundamental domain of a symmetry.
    function foldOf(int256 dx, int256 dy, uint256 ax, uint256 ay, uint8 symmetry)
        internal
        pure
        returns (int256 u, int256 v)
    {
        // forge-lint: disable-start(unsafe-typecast)
        if (symmetry == QUAD) {
            u = int256(ax);
            v = int256(ay);
        } else if (symmetry == MIRROR) {
            u = int256(ax);
            v = dy;
        } else if (symmetry == OCTANT) {
            u = int256(ax > ay ? ax : ay);
            v = int256(ax > ay ? ay : ax);
        } else if (symmetry == TURN) {
            // A quarter turn at a time until the point lands in the quadrant
            // x > 0, y < 0. At most four steps, since dx and dy are never zero.
            int256 rotatedX = dx;
            int256 rotatedY = dy;
            while (!(rotatedX > 0 && rotatedY < 0)) {
                int256 previousX = rotatedX;
                rotatedX = rotatedY;
                rotatedY = -previousX;
            }
            u = rotatedX;
            v = -rotatedY;
        } else {
            revert("symmetry out of range");
        }
        // forge-lint: disable-end(unsafe-typecast)
    }

    /// @notice Folded offsets, radius and pseudo angle of one grid point.
    /// @dev Returns a plain tuple, never a struct: this runs 4096 times per render
    /// and EVM memory is never reclaimed, so a per-pixel allocation would make the
    /// gas quadratic. Callers that only need the radius, or the radius and the
    /// angle, should call `radiusOf` and `angleOf` and skip the fold.
    function px(uint256 x, uint256 y, uint8 symmetry)
        internal
        pure
        returns (int256 u, int256 v, uint256 r, uint256 a)
    {
        int256 dx = dxOf(x);
        int256 dy = dyOf(y);
        uint256 ax = absOf(dx);
        uint256 ay = absOf(dy);
        r = radiusOf(rrOf(dx, dy));
        (u, v) = foldOf(dx, dy, ax, ay, symmetry);
        a = angleOf(dx, dy, ax, ay);
    }

    function glyph(bytes1 character) internal pure returns (uint16) {
        if (character >= "0" && character <= "9") {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 index = uint8(character) - uint8(bytes1("0"));
            if (index == 0) return 0x7b6f;
            if (index == 1) return 0x2c97;
            if (index == 2) return 0x73e7;
            if (index == 3) return 0x73cf;
            if (index == 4) return 0x5bc9;
            if (index == 5) return 0x79cf;
            if (index == 6) return 0x79ef;
            if (index == 7) return 0x7252;
            if (index == 8) return 0x7bef;
            return 0x7bcf;
        }
        if (character == "A") return 0x7bed;
        if (character == "B") return 0x6bae;
        if (character == "C") return 0x7927;
        if (character == "D") return 0x6b6e;
        if (character == "E") return 0x79e7;
        if (character == "F") return 0x79e4;
        if (character == "I") return 0x7497;
        if (character == "L") return 0x4927;
        if (character == "N") return 0x6b6d;
        if (character == "O") return 0x7b6f;
        if (character == "S") return 0x79cf;
        if (character == "V") return 0x5b6a;
        if (character == "X") return 0x5aad;
        // Anything else is blank, matching the TypeScript FONT[ch] ?? FONT[" "].
        return 0;
    }

    function stamp(bytes memory g, string memory text, int256 x, int256 y, uint8 slot) internal pure {
        require(g.length == N * N, "grid length must be 4096");
        bytes memory characters = bytes(text);
        int256 cursor = x;
        for (uint256 c = 0; c < characters.length; ++c) {
            uint16 bitmap = glyph(characters[c]);
            for (uint256 row = 0; row < 5; ++row) for (uint256 column = 0; column < 3; ++column) {
                // forge-lint: disable-next-line(unsafe-typecast)
                if ((bitmap & uint16(1 << (14 - (row * 3 + column)))) != 0) {
                    // forge-lint: disable-next-line(unsafe-typecast)
                    int256 writeX = cursor + int256(column);
                    // forge-lint: disable-next-line(unsafe-typecast)
                    int256 writeY = y + int256(row);
                    // forge-lint: disable-next-line(unsafe-typecast)
                    if (writeX >= 0 && writeY >= 0 && writeX < int256(N) && writeY < int256(N)) {
                        // forge-lint: disable-next-line(unsafe-typecast)
                        g[uint256(writeY) * N + uint256(writeX)] = bytes1(slot);
                    }
                }
            }
            cursor += 4;
        }
    }

    function textWidth(string memory text) internal pure returns (uint256) {
        return bytes(text).length * 4 - 1;
    }

    function tick(uint256 i) internal pure returns (uint256 index) {
        require(i < 32, "tick out of range");
        uint256 offset = i * 2;
        return (uint256(uint8(TICKS[offset])) << 8) | uint256(uint8(TICKS[offset + 1]));
    }

    /// @notice The SVG, one path per colour slot, one box per run of that colour.
    /// @dev The run scan and the byte appends run 64 by 64 times per slot, so both
    /// use assembly to skip the array bounds checks that dominate this loop.
    /// The output buffer is sized once from a worst-case bound and truncated at the end.
    function svgOf(bytes memory g, string[] memory colors) internal pure returns (string memory) {
        require(g.length == N * N, "grid length must be 4096");
        require(colors.length > 0 && colors.length <= 10, "color count out of range");

        // Worst case: every pixel its own run. A run is at most "M63 63h64v1h-64z",
        // sixteen bytes. Plus the document head, the rect fill and one path head
        // and tail per slot.
        uint256 capacity = 160 + colors.length * 32 + N * N * 16;
        bytes memory output = new bytes(capacity);
        uint256 startAddress;
        uint256 p;
        assembly ("memory-safe") {
            startAddress := add(output, 32)
            p := startAddress
        }

        p = _copy(p, "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" shape-rendering=\"crispEdges\"><rect width=\"64\" height=\"64\" fill=\"");
        p = _copy(p, bytes(colors[0]));
        p = _copy(p, "\"/>");

        uint256 pixels;
        assembly ("memory-safe") { pixels := add(g, 32) }

        for (uint256 slot = 1; slot < colors.length; ++slot) {
            bool started = false;
            for (uint256 row = 0; row < N; ++row) {
                uint256 rowBase = pixels + row * N;
                uint256 column = 0;
                while (column < N) {
                    uint256 value = _at(rowBase, column);
                    uint256 runStart = column;
                    unchecked { ++column; }
                    while (column < N && _at(rowBase, column) == value) { unchecked { ++column; } }
                    // Runs are maximal over every value, including the ground, so a
                    // run of ground still breaks a run of this slot. Only the
                    // emission is filtered.
                    if (value == slot) {
                        if (!started) {
                            p = _copy(p, "<path fill=\"");
                            p = _copy(p, bytes(colors[slot]));
                            p = _copy(p, "\" d=\"");
                            started = true;
                        }
                        unchecked { p = _box(p, runStart, row, column - runStart); }
                    }
                }
            }
            if (started) p = _copy(p, "\"/>");
        }
        p = _copy(p, "</svg>");

        assembly ("memory-safe") { mstore(output, sub(p, startAddress)) }
        return string(output);
    }

    /// @notice The colour slot of pixel `column` in the row starting at `rowBase`.
    function _at(uint256 rowBase, uint256 column) private pure returns (uint256 value) {
        assembly ("memory-safe") { value := byte(0, mload(add(rowBase, column))) }
    }

    /// @notice Appends `value` at memory address `p` and returns the new cursor.
    function _copy(uint256 p, bytes memory value) private pure returns (uint256) {
        uint256 length = value.length;
        assembly ("memory-safe") {
            let source := add(value, 32)
            for { let i := 0 } lt(i, length) { i := add(i, 32) } {
                mstore(add(p, i), mload(add(source, i)))
            }
        }
        // The caller always writes something after this, and the buffer is sized
        // with room to spare, so the overshoot of the last word is overwritten or
        // sits inside the allocation and outside the final length.
        unchecked { return p + length; }
    }

    /// @notice Appends one run as `M{x} {y}h{w}v1h-{w}z`.
    /// @dev x and y are grid coordinates in 0..63 and w is a run width in 1..64,
    /// so every number here is one or two decimal digits.
    function _box(uint256 p, uint256 x, uint256 y, uint256 w) private pure returns (uint256) {
        unchecked {
            assembly ("memory-safe") { mstore8(p, 0x4d) } // 'M'
            p = _digits(p + 1, x);
            assembly ("memory-safe") { mstore8(p, 0x20) } // ' '
            p = _digits(p + 1, y);
            assembly ("memory-safe") { mstore8(p, 0x68) } // 'h'
            p = _digits(p + 1, w);
            assembly ("memory-safe") {
                mstore8(p, 0x76)            // 'v'
                mstore8(add(p, 1), 0x31)    // '1'
                mstore8(add(p, 2), 0x68)    // 'h'
                mstore8(add(p, 3), 0x2d)    // '-'
            }
            p = _digits(p + 4, w);
            assembly ("memory-safe") { mstore8(p, 0x7a) } // 'z'
            return p + 1;
        }
    }

    /// @notice Appends the decimal of a value below 100.
    function _digits(uint256 p, uint256 value) private pure returns (uint256) {
        unchecked {
            if (value >= 10) {
                assembly ("memory-safe") {
                    mstore8(p, add(48, div(value, 10)))
                    mstore8(add(p, 1), add(48, mod(value, 10)))
                }
                return p + 2;
            }
            assembly ("memory-safe") { mstore8(p, add(48, value)) }
            return p + 1;
        }
    }
}
