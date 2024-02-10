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

/**
 * @title ISnowTracker
 * @dev Interface for the SnowTracker contract, which allows for tracking soft-token balances
 */
interface ISnowTracker {
    /**
     * @dev Pauses all interactions with the contract.
     * Can only be called by an address with the PAUSER_ROLE.
     */
    function pause() external;

    /**
     * @dev Unpauses interactions with the contract.
     * Can only be called by an address with the PAUSER_ROLE.
     */
    function unpause() external;

    /**
     * @dev Adds tokens to the balance of a specified wallet address.
     * Can only be called by an address with the MANAGER_ROLE.
     * Emits a TokensAdded event upon successful addition.
     * @param to The wallet address to add the tokens to.
     * @param amount The number of tokens to add.
     * @return The new balance of the wallet address.
     */
    function addTokens(address to, uint256 amount) external returns (uint256);

    /**
     * @dev Adds tokens to the balances of multiple addresses.
     * Can only be called by an address with the MANAGER_ROLE.
     * Emits a TokensAdded event upon successful addition.
     * @param to Array of addresses to add the tokens to.
     * @param amounts Array of token amounts corresponding to each address.
     * @return The total amount of tokens distributed.
     */
    function batchAddTokens(address[] memory to, uint256[] memory amounts)
        external
        returns (uint256);

    /**
     * @dev Removes tokens from the balance of a specified wallet address.
     * Can only be called by an address with the SPENDER_ROLE.
     * Emits a TokensRemoved event upon successful removal.
     * @param from The wallet address to remove the tokens from.
     * @param amount The number of tokens to remove.
     * @return The new balance of the wallet address.
     */
    function removeTokens(address from, uint256 amount)
        external
        returns (uint256);

    /**
     * @dev Removes tokens from the balances of multiple addresses.
     * Can only be called by an address with the MANAGER_ROLE.
     * Emits a TokensRemoved event upon successful removal.
     * @param from Array of addresses to remove the tokens from.
     * @param amounts Array of token amounts corresponding to each address.
     * @return The total amount of tokens removed.
     */
    function batchRemoveTokens(address[] memory from, uint256[] memory amounts)
        external
        returns (uint256);

    /**
     * @dev Transfers tokens from the sender's balance to a specified wallet address.
     * Emits a TokensTransferred event upon successful transfer.
     * @param to The wallet address to transfer the tokens to.
     * @param amount The number of tokens to transfer.
     */
    function transferTokens(address to, uint256 amount) external;

    /**
     * @dev Retrieves the balance of a given wallet address.
     * @param account The wallet address to query.
     * @return The balance of the specified wallet address.
     */
    function balances(address account) external view returns (uint256);

    /**
     * @dev Retrieves the total number of unique token holders.
     * @return The total number of unique token holders.
     */
    function uniqueHolders() external view returns (uint256);

    /**
     * @dev Retrieves the total token supply.
     * @return The total token supply.
     */
    function totalSupply() external view returns (uint256);
}
