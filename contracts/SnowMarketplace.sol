// SPDX-License-Identifier: MIT
// Created by 3Tech Studio (mail dev.andreavendrame@gmail.com)
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./SnowTracker.sol";

/**
 * @dev Contract that acts as a marketplace, allowing to buy and sell
 * 3VEREST NFTs (ERC1155 and ERC721) by spending the SNOW soft-token.
 *
 * ----- Contract actors -----
 *
 * - Buyer: wallet that owns SNOW tokens and that is able to buy an NFT
 *      by fulfilling an active MarketOrder.
 * - Orders manager: wallet that is allowed to create and cancel
 *      MarketOrder(s) in order to sell both ERC1155 and ERC721 NFTs.
 * - Manager: wallet that is able to change the reference to the
 *      SNOW soft-token cotract (to update it in case of problems) and
 *      that is also able to pause and resume the marketplace interactions.
 * - Spender: the smart contract itself, that acts as a subject who is
 *      able to spend tokes on behalf of the Buyer.
 * - Pauser: wallet entitled to pause and resume the overall
 *      contract interactions.
 *
 * ----- Information provided by the contract state -----
 *
 * 1. Current active MarketOrders
 * 2. Details about each MarketOrder
 * 3. Total SNOW tokens spent in the marketplace
 * 4. Total assets buught through the martkeplace
 * 5. Number of the total fulfilled orders
 * 6. Number of the ERC721 tokens currently on sale
 * 7. Number of the ERC1155 tokens currently on sale
 * 8. SNOW soft-token contract address
 * 9. Trading active (marketplace paused/unpaused)
 *
 */
contract SnowMarketplace is Pausable, AccessControl {
    /**
     * -----------------------------------------------------
     * -------------------- CONSTANTS ----------------------
     * -----------------------------------------------------
     */

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");
    bytes32 public constant ORDERS_MANAGER_ROLE =
        keccak256("ORDERS_MANAGER_ROLE");
    uint256 public constant INVALID_BLOCK = 0;

    /**
     * -----------------------------------------------------
     * -------------------- MARKETPLACE EVENTS -------------
     * -----------------------------------------------------
     */

    event OrderCreated(
        uint256 indexed _orderId,
        address indexed _by,
        uint256 _atBlock
    );

    event OrderCanceled(
        uint256 indexed _orderId,
        address indexed _by,
        uint256 _atBlock
    );

    event OrderFulfilled(
        uint256 indexed _orderId,
        address indexed _by,
        uint256 _atBlock
    );

    /**
     * -----------------------------------------------------
     * -------------------- ENUMERATORS & STRUCTS ----------
     * -----------------------------------------------------
     */

    enum NftType {
        ERC1155,
        ERC721
    }

    enum OrderState {
        Open,
        Closed,
        Cancelled
    }

    struct MarketOrder {
        uint256 id;
        uint256 price;
        NftType nftType;
        address tokenContractAddress;
        uint256 tokenId;
        OrderState orderState;
        uint256 filledAtBlock;
        address maker;
        address taker;
    }

    /**
     * -----------------------------------------------------
     * -------------------- CONTRACT STATE -----------------
     * -----------------------------------------------------
     */

    uint256[] public activeOrders; // current marketplace active orders
    mapping(uint256 => MarketOrder) public orderDetails; // Details of all created orders

    uint256 public onSaleErc721Tokens; // total ERC721 currently on sale
    uint256 public onSaleErc1155Tokens; // total ERC1155 currently on sale

    uint256 public currentOrderId; // ID of the next order to be created
    uint256 public ordersFullfilled; // Total orders fullfilled sucessfully
    uint256 public totalTokensSpent; // Total Snow tokens spent in the marketplace

    address public snowSoftTokenAddress; // Reference to the SNOW soft-token contract

    bool public isMarketplaceActive; // true if is possible to create a fulfill orders, false otherwise

    /**
     * -----------------------------------------------------
     * -------------------- IMPLEMENTATION -----------------
     * -----------------------------------------------------
     */

    /**
     * @dev contract constructor
     *
     * @param snowTokenContract address of the smart contract that
     * keeps track of the soft-token balances
     */
    constructor(address snowTokenContract) {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(MANAGER_ROLE, _msgSender());
        _grantRole(PAUSER_ROLE, _msgSender());

        // Initialization
        currentOrderId = 0;
        onSaleErc721Tokens = 0;
        onSaleErc1155Tokens = 0;
        ordersFullfilled = 0;

        snowSoftTokenAddress = snowTokenContract; // Assumed to be valid

        isMarketplaceActive = true; // enable marketplace usage
    }

    /**
     * -----------------------------------------------------
     * -------------------- MANAGEMENT FUNCTIONS -----------
     * -----------------------------------------------------
     */

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

    /**
     * @dev enable the marketplace by letting available the functions
     * to create and fullfil MarketOrders
     */
    function pauseMarketplace() external onlyRole(MANAGER_ROLE) {
        isMarketplaceActive = false;
    }

    /**
     * @dev disable the marketplace by preventing the user to
     * create and fullfil MarketOrders
     */
    function unpauseMarketplace() external onlyRole(MANAGER_ROLE) {
        isMarketplaceActive = true;
    }

    /**
     * -----------------------------------------------------
     * -------------------- CONTRACT MODIFIERS -------------
     * -----------------------------------------------------
     */

    modifier marketplaceEnabled() {
        require(isMarketplaceActive, "Marketplace not active");
        _;
    }

    /**
     * -----------------------------------------------------
     * -------------------- ORDERS MANAGEMENT --------------
     * -----------------------------------------------------
     */

    /**
     * @dev Create a new MarketOrder that will be placed in the
     * 'activeOrders' list.
     *
     * @param price number of tokens to spend to buy the NFT in this order
     * @param nftType could be either NftType.ERC1155 or NftType.ERC721
     * @param contractAddress address of the contract to which the NFT
     * to be sold belongs
     * @param tokenId ID of the token to sell
     *
     * @return the ID of the MarketOrder created
     *
     * Note The function call can't go through if:
     * 1. the sender doesn't own the NFT that needs to be put on sale
     * 2. the marketplace is disabled
     */
    function createOrder(
        uint256 price,
        NftType nftType,
        address contractAddress,
        uint256 tokenId
    )
        public
        onlyRole(ORDERS_MANAGER_ROLE)
        marketplaceEnabled
        returns (uint256)
    {
        // Check sender NFTs balance to create the order
        if (nftType == NftType.ERC1155) {
            ERC1155 tokenInstance = ERC1155(contractAddress);
            require(
                tokenInstance.balanceOf(_msgSender(), tokenId) > 0,
                "No tokens available to create the order"
            );
        } else if (nftType == NftType.ERC721) {
            ERC721 collectionInstance = ERC721(contractAddress);
            require(
                collectionInstance.ownerOf(tokenId) == _msgSender(),
                "You don't own the token to put on sale"
            );
        } else {
            revert("No valid token standard specified");
        }

        require(price > 0, "Can't create a free order");

        // Calculate order ID and increase counter
        uint256 orderId = currentOrderId;
        currentOrderId += 1;

        // Create the order
        MarketOrder memory order = MarketOrder(
            orderId,
            price,
            nftType,
            contractAddress,
            tokenId,
            OrderState.Open,
            INVALID_BLOCK,
            _msgSender(),
            address(0)
        );

        // Insert in active orders and save order details
        orderDetails[orderId] = order;
        activeOrders.push(orderId);

        // Transfer NFT to the marketplace
        _transferNfts(
            nftType,
            contractAddress,
            _msgSender(),
            address(this),
            tokenId,
            1
        );

        emit OrderCreated(orderId, _msgSender(), block.number);

        return orderId;
    }

    /**
     * @dev Create in a single transaction a batch of ERC1155
     * MarketOrders where each order has the same price.
     *
     * @param price Price for a single order to be created.
     * @param contractAddress smart contract address of the token to sell
     * @param tokenId ID of the token to sell
     * @param amount number of orders to create with the specified parameters.
     *
     * Note: the transaction will be reverted if the sender is trying
     * to call it with an amount less than 2 or if the balance of
     * token copies in the sender wallet is less than the value specified
     * for the 'amount' parameter
     */
    function createBatchERC1155Order(
        uint256 price,
        address contractAddress,
        uint256 tokenId,
        uint256 amount
    )
        public
        onlyRole(ORDERS_MANAGER_ROLE)
        marketplaceEnabled
        returns (uint256[] memory)
    {
        require(
            amount > 1,
            "Can't create a batch order with less than 2 NFT copies"
        );

        uint256[] memory orderIds = new uint256[](amount);

        for (uint256 i = 0; i < amount; i++) {
            uint256 _currentOrderId = createOrder(
                price,
                NftType.ERC1155,
                contractAddress,
                tokenId
            );
            orderIds[i] = _currentOrderId;
        }

        return orderIds;
    }

    /**
     * @dev Remove an active order from the marketplace and send
     * back the related NFT
     *
     * @param orderId ID of the current active order to cancel
     *
     * Note: gives an error if trying to cancel a not active MarketOrder
     */
    function cancelOrder(uint256 orderId) public onlyRole(ORDERS_MANAGER_ROLE) {
        _removeActiveOrder(orderId);
        // Update order details, NFTs on sale counter and return token to the maker
        orderDetails[orderId].orderState = OrderState.Cancelled;
        _transferNfts(
            orderDetails[orderId].nftType,
            orderDetails[orderId].tokenContractAddress,
            address(this),
            orderDetails[orderId].maker,
            orderDetails[orderId].tokenId,
            1
        );

        emit OrderCanceled(orderId, _msgSender(), block.number);
    }

    /**
     * @dev Fullfil an active order. This operation will lower the sender SNOW
     * token balance and transfer him the NFT in the order
     *
     * @param orderId ID of the order (currently in the activeOrders list)
     *
     * Note The function call can't go through if:
     * 1. the sender SNOW balance is lower than the MarketOrder price
     * 2. the orderId is not valid
     * 3. the marketplace is disabled
     */
    function fulfillOrder(uint256 orderId) public marketplaceEnabled {
        MarketOrder memory order = orderDetails[orderId];
        require(
            orderId <= currentOrderId && orderId >= 0,
            "Invalid order ID provided"
        );

        require(
            order.orderState == OrderState.Open,
            "The order is not active anymore"
        );

        // Remove order from active ones
        _removeActiveOrder(orderId);

        // Check if the sender has enough balance
        SnowTracker tracker = SnowTracker(snowSoftTokenAddress);

        if (tracker.balances(_msgSender()) >= order.price) {
            // Decrease balance (reduce reentrancy risks)
            tracker.spendTokens(_msgSender(), order.price);
            // Transfer bought NFT

            _transferNfts(
                order.nftType,
                order.tokenContractAddress,
                address(this),
                _msgSender(),
                order.tokenId,
                1
            );
            // Update fulfilled order
            ordersFullfilled = ordersFullfilled + 1;
            totalTokensSpent = totalTokensSpent + order.price;
        } else {
            revert("Not enough tokens available to buy the NFT");
        }

        // Update orderState
        orderDetails[orderId].orderState = OrderState.Closed;
        orderDetails[orderId].filledAtBlock = block.number;

        emit OrderFulfilled(orderId, _msgSender(), block.number);
    }

    /**
     * @dev remove a MarketOrder from the current active orders list
     *
     * @param orderId ID of the order to remove from the list
     */
    function _removeActiveOrder(uint256 orderId) private {
        // Delete the order from the active orders list
        uint256 activeOrdersNumber = activeOrders.length;
        uint256 orderIndex = 0;
        bool idFound = false;

        for (uint256 i = 0; i < activeOrdersNumber; i++) {
            if (activeOrders[i] == orderId) {
                orderIndex = i;
                idFound = true;
                break;
            }
        }

        require(idFound, "The order to remove is not in the active list");

        if (orderIndex != activeOrdersNumber - 1) {
            // Need to swap the order to delete with the last one and procede as above
            activeOrders[orderIndex] = activeOrders[activeOrdersNumber - 1];
        }

        activeOrders.pop();
    }

    /**
     * @dev transfer an NFT (ERC1155 or ERC721) from the 'from' address
     * to the 'to' address switching mode based on the 'nftType' parameter.
     *
     * @param nftType could be either NftType.ERC1155 or NftType.ERC721
     * @param contractAddress address of the token smart contract
     * @param from token sender
     * @param to token receiver
     * @param tokenId ID of the token to be sent
     * @param amount amount of tokens to send (if ERC721 the amount is always 1)
     */
    function _transferNfts(
        NftType nftType,
        address contractAddress,
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) private {
        if (nftType == NftType.ERC721) {
            // Update counter
            if (from == address(this) && to != address(this)) {
                onSaleErc721Tokens -= 1;
            } else if (from != address(this) && to == address(this)) {
                onSaleErc721Tokens += 1;
            } else {
                revert("Trying to send the NFT between 2 simple addresses");
            }
            // Transfer NFT
            ERC721 collectionInstance = ERC721(contractAddress);
            collectionInstance.transferFrom(from, to, tokenId);
        } else {
            // Can be only an ERC1155
            // Update counter
            if (from == address(this) && to != address(this)) {
                onSaleErc1155Tokens -= 1;
            } else if (from != address(this) && to == address(this)) {
                onSaleErc1155Tokens += 1;
            } else {
                revert("Trying to send the NFT between 2 simple addresses");
            }
            // Transfer back NFT
            ERC1155 tokenInstance = ERC1155(contractAddress);
            tokenInstance.safeTransferFrom(from, to, tokenId, amount, "0x00");
        }
    }

    /**
     * -----------------------------------------------------
     * -------------------- SNOW TOKEN MANAGEMENT ----------
     * -----------------------------------------------------
     */

    /**
     * @dev update the contract address reference of the SNOW soft-token
     *
     * @param newContract address of the new SNOW token implementation
     */
    function updateSnowTokenContract(address newContract)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(
            newContract != address(0),
            "Please insert a valid contract address"
        );

        snowSoftTokenAddress = newContract;
    }

    /**
     * -----------------------------------------------------
     * -------------------- UTILITIES ----------------------
     * -----------------------------------------------------
     */

    /**
     * @dev get the list of the active orders IDs
     *
     * @return an array that contains the IDs of the current active marketplace orders
     */
    function getActiveOrderIds() external view returns (uint256[] memory) {
        return activeOrders;
    }

    /**
     * --------------------------------------------------------------------
     * -------------------- ERC1155 RECEVIER IMPLEMENTATION ---------------
     * --------------------------------------------------------------------
     */

    /**
     * @dev default implementation plus a check
     * to verify that the transaction sender has been granted
     * the ORDERS_MANAGER_ROLE role.
     */
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) public returns (bytes4) {
        require(
            hasRole(ORDERS_MANAGER_ROLE, from),
            "The contract can't receive NFTs from this address"
        );

        return
            bytes4(
                keccak256(
                    "onERC1155Received(address,address,uint256,uint256,bytes)"
                )
            );
    }

    /**
     * @dev default implementation plus a check
     * to verify that the transaction sender has been granted
     * the ORDERS_MANAGER_ROLE role.
     */
    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) public returns (bytes4) {
        require(
            hasRole(ORDERS_MANAGER_ROLE, from),
            "The contract can't receive NFTs from this address"
        );

        return
            bytes4(
                keccak256(
                    "onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"
                )
            );
    }
}
