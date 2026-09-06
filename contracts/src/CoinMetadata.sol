// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CoinView} from "./ICoinRenderer.sol";
import {Pixels} from "./Pixels.sol";

/// @notice Metadata and trait-name tables kept separate from the pixel renderer.
contract CoinMetadata {
    using Strings for uint256;

    string private constant SITE_URL = "https://one.onenft.click";

    function metadata(
        CoinView memory c,
        bytes memory g,
        string[] memory colors,
        string memory masterName,
        string memory masterMaterial,
        uint8[11] memory traits,
        uint8 level
    ) external pure returns (string memory) {
        string memory number = _pad(c.number, 5);
        string memory name = bytes(masterName).length == 0 ? string.concat("ONE #", number) : string.concat("ONE #", number, " ", masterName);
        string memory description = string(abi.encodePacked(
            "Coin ", number, " of series ", _roman(c.series), ". Backing ", uint256(c.backing).toString(),
            " USDC, funded ", _units(c.fundedUnits), " USDC, lifetime yield ", _units(c.lifetimeUnits), " USDC. ",
            c.sealed_ ? "Sealed: the seed from Chainlink VRF has not arrived yet." : string.concat("Drawn on chain from seed ", _fingerprint(c.seed), "."),
            " Burn to redeem. ", SITE_URL, "/coin/", uint256(c.number).toString()
        ));
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(Pixels.svgOf(g, colors))));
        return string(abi.encodePacked(
            "{\"name\":", _quote(name), ",\"description\":", _quote(description), ",\"image\":", _quote(image),
            ",\"external_url\":", _quote(string.concat(SITE_URL, "/coin/", uint256(c.number).toString())),
            ",\"attributes\":[", _attributes(c, masterName, masterMaterial, traits, level), "]}"
        ));
    }

    function _attributes(CoinView memory c, string memory masterName, string memory masterMaterial, uint8[11] memory traits, uint8 level) private pure returns (string memory output) {
        bool first = true;
        if (c.sealed_) (output, first) = _append(output, first, _attribute("Sealed", "Waiting for the seed"));
        else if (bytes(masterName).length != 0) (output, first) = _append(output, first, _attribute("Master Coin", masterName));
        if (!c.sealed_) {
            if (bytes(masterName).length != 0) (output, first) = _append(output, first, _attribute("Material", masterMaterial));
            else for (uint8 i; i < 11; ++i) (output, first) = _append(output, first, _attribute(_label(i), _trait(i, traits[i])));
        }
        (output, first) = _append(output, first, _attribute("Series", _roman(c.series)));
        (output, first) = _append(output, first, _attribute("Backing", string.concat(uint256(c.backing).toString(), " USDC")));
        (output, first) = _append(output, first, _attribute("Origin", c.founder ? "Founder" : "Public"));
        (output, first) = _append(output, first, string(abi.encodePacked("{\"trait_type\":\"Yield level\",\"display_type\":\"number\",\"value\":", uint256(level).toString(), "}")));
        if (!c.sealed_) (output,) = _append(output, first, _attribute("Fingerprint", _fingerprint(c.seed)));
    }

    function _append(string memory previous, bool first, string memory item) private pure returns (string memory, bool) { return (first ? item : string.concat(previous, ",", item), false); }
    // All values are fixed labels, names, URL fragments, or decimal/hex text; none can contain a quote or backslash.
    function _quote(string memory value) private pure returns (string memory) { return string.concat("\"", value, "\""); }
    function _attribute(string memory key, string memory value) private pure returns (string memory) { return string(abi.encodePacked("{\"trait_type\":", _quote(key), ",\"value\":", _quote(value), "}")); }

    function _label(uint8 i) private pure returns(string memory){if(i==0)return"Material";if(i==1)return"Ground";if(i==2)return"Rim";if(i==3)return"Field";if(i==4)return"Symmetry";if(i==5)return"Core";if(i==6)return"Glyph";if(i==7)return"Surface";if(i==8)return"Halo";if(i==9)return"Accent";if(i==10)return"Anomaly";revert("trait out of range");}
    function _trait(uint8 kind,uint8 i) private pure returns(string memory){if(kind==0)return _material(i);if(kind==1)return _ground(i);if(kind==2)return _rim(i);if(kind==3)return _field(i);if(kind==4)return _symmetry(i);if(kind==5)return _core(i);if(kind==6)return _glyph(i);if(kind==7)return _surface(i);if(kind==8)return _halo(i);if(kind==9)return _accent(i);if(kind==10)return _anomaly(i);revert("trait out of range");}
    function _material(uint8 i) private pure returns(string memory){if(i==0)return"Silver";if(i==1)return"Copper";if(i==2)return"Bronze";if(i==3)return"Gold";if(i==4)return"Iron";if(i==5)return"Ivory";if(i==6)return"Cobalt";if(i==7)return"Rose";if(i==8)return"Jade";if(i==9)return"Obsidian";if(i==10)return"Amber";if(i==11)return"Verdigris";revert("material out of range");}
    function _ground(uint8 i) private pure returns(string memory){if(i==0)return"Night";if(i==1)return"Paper";if(i==2)return"Tinted";revert("ground out of range");}
    function _rim(uint8 i) private pure returns(string memory){if(i==0)return"Smooth";if(i==1)return"Ridged";if(i==2)return"Beaded";if(i==3)return"Segmented";if(i==4)return"Toothed";if(i==5)return"Broken";revert("rim out of range");}
    function _field(uint8 i) private pure returns(string memory){if(i==0)return"Rings";if(i==1)return"Diamonds";if(i==2)return"Lattice";if(i==3)return"Grid";if(i==4)return"Spokes";if(i==5)return"Spiral";if(i==6)return"Speckle";if(i==7)return"Bare";revert("field out of range");}
    function _symmetry(uint8 i) private pure returns(string memory){if(i==0)return"Mirror";if(i==1)return"Quad";if(i==2)return"Octant";if(i==3)return"Turn";revert("symmetry out of range");}
    function _core(uint8 i) private pure returns(string memory){if(i==0)return"Full";if(i==1)return"Ring";if(i==2)return"Hollow";if(i==3)return"Aperture";if(i==4)return"Split";revert("core out of range");}
    function _glyph(uint8 i) private pure returns(string memory){if(i==0)return"Sigil";if(i==1)return"Rune";if(i==2)return"Star";if(i==3)return"Cross";if(i==4)return"Dot";if(i==5)return"None";revert("glyph out of range");}
    function _surface(uint8 i) private pure returns(string memory){if(i==0)return"Polished";if(i==1)return"Matte";if(i==2)return"Aged";if(i==3)return"Fractured";revert("surface out of range");}
    function _halo(uint8 i) private pure returns(string memory){if(i==0)return"None";if(i==1)return"Ring";if(i==2)return"Rays";if(i==3)return"Dotted";if(i==4)return"Double";revert("halo out of range");}
    function _accent(uint8 i) private pure returns(string memory){if(i==0)return"None";if(i==1)return"Crimson";if(i==2)return"Azure";if(i==3)return"Saffron";if(i==4)return"Mint";if(i==5)return"Violet";if(i==6)return"White";revert("accent out of range");}
    function _anomaly(uint8 i) private pure returns(string memory){if(i==0)return"None";if(i==1)return"Double Orbit";if(i==2)return"Offset Core";if(i==3)return"Inverted";if(i==4)return"Eclipse";if(i==5)return"Ghost Rim";revert("anomaly out of range");}

    function _roman(uint16 value) private pure returns(string memory out){while(value>=10){out=string.concat(out,"X");value-=10;}if(value>=9){out=string.concat(out,"IX");value-=9;}if(value>=5){out=string.concat(out,"V");value-=5;}if(value>=4){out=string.concat(out,"IV");value-=4;}while(value!=0){out=string.concat(out,"I");--value;}}
    function _pad(uint256 value,uint256 width) private pure returns(string memory){string memory text=value.toString();uint256 n=bytes(text).length;if(n>=width)return text;bytes memory zeroes=new bytes(width-n);for(uint256 i;i<zeroes.length;++i)zeroes[i]="0";return string.concat(string(zeroes),text);}
    function _units(uint256 value) private pure returns(string memory){return string.concat((value/1_000_000).toString(),".",_pad(value%1_000_000,6));}
    function _fingerprint(uint64 seed) private pure returns(string memory){bytes memory out=new bytes(8);uint32 value=uint32(seed>>32);bytes16 alphabet="0123456789ABCDEF";for(uint256 i;i<8;++i)out[7-i]=alphabet[value>>(i*4)&15];return string(out);}
}
