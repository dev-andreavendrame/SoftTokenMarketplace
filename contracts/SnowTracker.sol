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

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @dev This contract allows to create a soft-token, which means
 * a sort of on-chain balances tracker that partially emulates
 * the behavior of an ERC20 token.
 *
 * The aforementioned soft-token can be:
 * 1. Added to the balance of a specified wallet;
 * 2. Removed from the balance of a specified wallet;
 * 3. Transferred between two wallet addresses;
 * 4. Spent, by wallet addresses that have been granted the SPENDER_ROLE role.
 *
 * ----- Contract actors -----
 *
 * - Holder (No roles granted): wallet address that owns 0
 * or more "soft-tokens".
 * - Manager (granted MANAGER_ROLE): wallet that is able to manage
 * soft-token wallets balances by adding and removing arbitrary amounts.
 * - Spender (granted SPENDER_ROLE): an address, that acts as a subject
 * who is able to spend tokes on behalf of a general Holder (the Spender
 * is a role that is intended to be granted to marketplace contracts).
 * - Pauser: wallet entitled to pause and resume the overall
 * contract interactions (add, remove, transfer and spend tokens actions).
 *
 * ----- Information provided by the contract state -----
 *
 * 1. Current total unique holders
 * 2. Current total supply
 * 3. Balance of soft-token of a specified wallet address
 *
 */
contract SnowTracker is Pausable, AccessControl {
    //------------------------------------------------------------------//
    //---------------------- Contract constants ------------------------//
    //------------------------------------------------------------------//

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    //------------------------------------------------------------------//
    //---------------------- Contract events ---------------------------//
    //------------------------------------------------------------------//

    event TokensAdded(
        address indexed _to,
        address indexed _from,
        uint256 _amount
    );

    event TokensRemoved(
        address indexed _to,
        address indexed _by,
        uint256 _amount
    );

    event TokensTransfered(
        address indexed _from,
        address indexed _to,
        uint256 indexed _blockNumber,
        uint256 _amount
    );

    event TokensSpent(
        address indexed _by,
        uint256 indexed _amount,
        uint256 indexed _blockNumber
    );

    //------------------------------------------------------------------//
    //---------------------- Contract storage --------------------------//
    //------------------------------------------------------------------//

    // Balances tracking
    mapping(address => uint256) public balances;

    // Synthetic information
    uint256 public uniqueHolders;
    uint256 public totalSupply;

    //------------------------------------------------------------------//
    //---------------------- Constructor and setup ---------------------//
    //------------------------------------------------------------------//
    constructor() {
        // Grant roles to contract deployer
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(PAUSER_ROLE, _msgSender());
        _grantRole(MANAGER_ROLE, _msgSender());

        // Initialize contract state
        uniqueHolders = 0;
        totalSupply = 0;
    }

    //------------------------------------------------------------------//
    //---------------------- Interactions pause management -------------//
    //------------------------------------------------------------------//

    /**
     * @dev default OpenZeppelin implementation
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev default OpenZeppelin implementation
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    //------------------------------------------------------------------//
    //---------------------- Token interactions ------------------------//
    //------------------------------------------------------------------//

    /**
     * @dev add tokens to the balance of a specified wallet address
     *
     * @param to wallet address to add the tokens to
     * @param amount number of tokens to add
     *
     * Note: reverts if the number of tokens to add is equal to 0
     */
    function addTokens(address to, uint256 amount)
        public
        onlyRole(MANAGER_ROLE)
        whenNotPaused
        returns (uint256)
    {
        require(amount > 0, "Can't add zero tokens");

        // Update total holders
        if (balances[to] == 0) {
            uniqueHolders += 1;
        }

        // Update total supply
        totalSupply = totalSupply + amount;

        // Update balance
        uint256 newBalance = balances[to] + amount;
        balances[to] = newBalance;

        emit TokensAdded(to, _msgSender(), amount);

        return newBalance;
    }

    /**
     * @dev add in batch tokens to the balance of different addresses
     *
     * @param to array of addresses to which add the specified tokens amounts
     * @param amounts value of tokens to add to the address at the same index
     * in the 'to' parameter
     *
     * @return the total amount of tokens distributed
     *
     * Note: reverts if:
     * - one of the number of tokens to add in the {amounts} parameter
     * is equal to 0;
     * - if the length of the 2 parameters is not the same or if the
     * number of addresses {to} is equal to 0.
     */
    function batchAddTokens(address[] memory to, uint256[] memory amounts)
        external
        onlyRole(MANAGER_ROLE)
        whenNotPaused
        returns (uint256)
    {
        require(to.length > 0, "Can't add tokens to 0 addresses");
        require(
            to.length == amounts.length,
            "Parameters lengths are not equal, check the provided values"
        );

        uint256 totalTokensDistributed = 0;
        for (uint256 i = 0; i < to.length; i++) {
            addTokens(to[i], amounts[i]);
            totalTokensDistributed += amounts[i];
        }

        return totalTokensDistributed;
    }

    /**
     * @dev remove tokens from the balance of a specified wallet address
     *
     * @param from wallet address to remove the tokens from
     * @param amount number of tokens to remove
     *
     * Note: reverts if the transaction sender tries to
     * remove more tokens than the current balance
     */
    function removeTokens(address from, uint256 amount)
        public
        onlyRole(MANAGER_ROLE)
        whenNotPaused
        returns (uint256)
    {
        require(amount > 0, "Can't remove zero tokens");
        require(
            amount <= balances[from],
            "Can't remove more than the available tokens"
        );

        // Update total supply
        totalSupply = totalSupply - amount;

        // Update balance
        uint256 newBalance = balances[from] - amount;
        balances[from] = newBalance;

        // Update total holders
        if (balances[from] == 0) {
            uniqueHolders = uniqueHolders - 1;
        }

        emit TokensRemoved(from, _msgSender(), amount);

        return newBalance;
    }

    /**
     * @dev remove in batch tokens from the balances of different addresses
     *
     * @param from array of addresses from which remove the specified tokens amounts
     * @param amounts value of tokens to remove from the address at the same index
     * in the 'from' parameter
     *
     * @return the total amount of tokens removed
     *
     * Note: reverts if:
     * - one of the number of tokens to remove in the {amounts} parameter is
     * greater than the related user balance,
     * - the length of the 2 parameters is not the same or if the number
     * of addresses {to} is equal to 0.
     */
    function batchRemoveTokens(address[] memory from, uint256[] memory amounts)
        public
        onlyRole(MANAGER_ROLE)
        whenNotPaused
        returns (uint256)
    {
        require(from.length > 0, "Can't remove tokens from 0 addresses");
        require(
            from.length == amounts.length,
            "Parameters lengths are not equal, check the provided values"
        );

        uint256 totalTokensRemoved = 0;
        for (uint256 i = 0; i < from.length; i++) {
            removeTokens(from[i], amounts[i]);
            totalTokensRemoved = totalTokensRemoved + amounts[i];
        }

        return totalTokensRemoved;
    }

    /**
     * @dev transfer tokens from the transaction sender to
     * a specified wallet address
     *
     * @param to wallet address that receives the tokens
     * @param amount number of tokens to transfer
     *
     * Note: reverts if the transaction sender tries to transfer
     * to the receiver wallet address more tokens than his current balance
     */
    function transferTokens(address to, uint256 amount) external whenNotPaused {
        require(
            balances[_msgSender()] >= amount,
            "Can't transfer more tokens than the available balance"
        );

        // Remove tokens from sender
        uint256 newSenderBalance = balances[_msgSender()] - amount;
        balances[_msgSender()] = newSenderBalance;

        // Add tokens to receiver
        uint256 newReceiverBalance = balances[to] + amount;
        balances[to] = newReceiverBalance;

        emit TokensTransfered(_msgSender(), to, block.number, amount);
    }

    /**
     * @dev remove tokens from a specified wallet address
     * as a consequence of a specific external event.
     * This function will be called from external contracts, so
     * when called by a marketplace for instance this means that the
     * an order has been fulfilled and paid through the {buyer} balance
     *
     * @param buyer wallet address from which remove the tokens
     * @param amount number of tokens to remove
     *
     * @return the new updated balance
     *
     * Note: reverts if the transaction sender tries to remove from
     * the {buyer} address more tokens than the current balance
     */
    function spendTokens(address buyer, uint256 amount)
        public
        onlyRole(SPENDER_ROLE)
        whenNotPaused
        returns (uint256)
    {
        require(amount > 0, "Can't spend zero tokens");
        require(
            balances[buyer] >= amount,
            "Can't spend more than the current balance"
        );

        // Update total supply
        totalSupply = totalSupply - amount;

        // Update balance
        uint256 newBalance = balances[buyer] - amount;
        balances[buyer] = newBalance;

        // Update total holders
        if (balances[buyer] == 0) {
            uniqueHolders--;
        }

        emit TokensSpent(buyer, amount, block.number);

        return newBalance;
    }
}
