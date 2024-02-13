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
pragma solidity 0.8.20;

import "./CollectionMinter.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "hardhat/console.sol";

contract Attack2 {
    address payable private collectionMinterAddress;
    address private erc1155Address;

    constructor(address payable _collectionMinterAddress) {
        collectionMinterAddress = _collectionMinterAddress;
    }

    function withdraw() public payable {
        CollectionMinter minter = CollectionMinter(collectionMinterAddress);
        minter.withdrawFunds(true, address(0));
        payable(address(this)).transfer(msg.value);
    }

    /**
     * @dev Receive native currency fallback.
     *      Called when msg.data is NOT empty
     */
    fallback() external payable {
        console.log("Reverted default fallback");
        revert();
    }

    // Receive is a variant of fallback that is triggered when msg.data is empty
    receive() external payable {
        console.log("Reverted receive fallback");
        revert();
    }
}
