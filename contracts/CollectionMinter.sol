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

import "./Erc721Collection.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * This contract is meant to be an intermediary that lets users
 * buy ERC721 NFTs, of the collection specified on contract
 * deployment, through different sale phases.
 * An unlimited number of sale phases can be created.
 *
 * ----- Sale features -----
 *
 * Each sale phase has the following features:
 * - Duration: a specific blocks range [start, end] where the phase is considered "active"
 * - Payment method: can be either the native chain currency or a specific ERC20 token
 * - Mint price: a price for minting one token
 * - Whitelisted required: if 'true' only wallet with whitelist permission can mint
 * - Sale phase cap: max overall amount of NFTs mintable in this specific sale phase
 * - Wallet limit: max amount of NFTs mintable by the same wallet in this sale phase
 *
 * The contract manager (MANAGER_ROLE) can create and disable sale phases.
 * Once a sale phase is disable it cannot be enabled again.
 * The contract manager can also manage the whitelists for every sale phase by
 * granting the whitelist and revoking it to and from any wallet.
 *
 * The team (TEAM_MINTER_ROLE) can mint outside any sale phase NFTs of the connected
 * ERC721 collection, but the collection max supply cannot be exceeded.
 *
 * The pauser (PAUSER_ROLE) can pause the minting of a new token, the whitelist management
 * and he creation of new sale phases (disable a sale phase remaning possible).
 *
 * ----- Payment mechanics -----
 *
 * Once a payment in a specific sale phase has been done the funds are deposited into
 * this contract. Only the admin (DEFAULT_ADMIN_ROLE) can decide who will be the
 * funds receiver once the function {withdrawFunds}. With this function the manager can
 * trigger the funds withdraw and specify which currency to withdraw. Once called this function
 * transfers the entire balance of the specified token (can be also the native currency
 * token, like ether).
 *
 * A fee is applied to every mint operation. This means that every time that a mint is
 * triggered, either by the team or a generic user, the {contractProvider} will
 * receive a fee in the blockchain native currency equal to {providerMintFee}.
 *
 */
contract CollectionMinter is Pausable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Access Control roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant TEAM_MINTER_ROLE = keccak256("TEAM_MINTER_ROLE");

    // Contract to call for minting tokens
    address public immutable collectionContract;
    Erc721Collection private originalCollectionInstance;

    // Sale phases data and constants
    uint256 private constant UNLIMITED_MINTABLE_TOKENS = 0;
    uint256 private _currentSalePhaseId;
    uint256 private constant INVALID_SALE_PHASE_ID = 0;
    bool public isMintPaused = true;
    mapping(uint256 => SalePhase) public salePhaseDetails;

    // Withdraw funds receiver
    address public fundsReceiver;

    // Provider mint fee information
    address payable private immutable contractProvider;
    uint256 private immutable providerMintFee;

    struct SalePhase {
        uint256 phaseId; // Starts from 0
        bool whitelistRequired; // True if only whitelisted wallets can mint
        uint256 startBlock; // Block at which the sale starts
        uint256 endBlock; // Block at which the sale ends
        bool payInNativeCurrency; // {true} if the sale is paid in the blockchain native currency, false otherwise
        address paymentToken; // Address of the token to use as payment in this sale phase
        uint256 mintPrice; // Price for minting for the current sale phase
        uint256 maxMintsPerWallet; // Max amount of mint per wallet (0 means unlimited)
        uint256 maxSalePhaseCap; // Max supply reachable in this sale phase
    }

    // ex. whitelistedPhaseWallets[0]["0x123..."] => 'true' means that "0x123..." is allowed to mint on sale phase "0"
    mapping(uint256 => mapping(address => bool))
        private whitelistedPhaseWallets;
    // ex. salePhaseMintedTokens[0]["0x123..."] => 1 means that "0x123..." has mint on sale phase "0" 1 token
    mapping(uint256 => mapping(address => uint256))
        public salePhaseMintedTokens;
    mapping(uint256 => uint256) public salePhaseMintedTokensCounter;

    //------------------------------------------------------------------//
    //---------------------- Contract events ---------------------------//
    //------------------------------------------------------------------//

    event NftsMinted(
        address indexed _from,
        uint256 indexed _amount,
        uint256 indexed _salePhaseId,
        uint256 _blockNumber
    );

    event TeamMintedNfts(address indexed _from, uint256 indexed _amount);
    event FundsWithdrawn(address indexed _from, uint256 indexed _amount);
    event NativePaymentReceived(address indexed _from, uint256 indexed _amount);

    event MintEnabled(address indexed _by, uint256 _atBlock);
    event MintDisabled(address indexed _by, uint256 _atBlock);

    event SalePhaseCreated(
        address indexed _from,
        uint256 indexed _id,
        uint256 _atBlock
    );

    event WhitelistGranted(
        address indexed _from,
        address indexed _to,
        uint256 _salePhaseId
    );

    event WhitelistRevoked(
        address indexed _from,
        address indexed _to,
        uint256 _salePhaseId
    );

    event SalePhaseDisabled(
        address indexed _by,
        uint256 indexed _id,
        uint256 _atBlock
    );

    event FundsReceiverUpdated(
        address indexed _by,
        address indexed _newReceiver,
        uint256 _atBlock
    );

    event MintPaidWithNativeCurrency(
        address indexed _by,
        uint256 indexed _amount,
        uint256 _atBlock
    );

    event MintPaidWithErc20(
        address indexed _by,
        address indexed _contract,
        uint256 indexed _amount,
        uint256 _atBlock
    );

    event MintFeePaid(
        address indexed _from,
        uint256 indexed _amount,
        uint256 _atBlock
    );

    //------------------------------------------------------------------//
    //---------------------- Custom errors -----------------------------//
    //------------------------------------------------------------------//

    /**
     * @dev The native currency included into the msg.value of the transaction
     *      is not the exact amount required.
     *
     * @param currentValue current msg.value set
     * @param requiredValue msg.value required
     */
    error WrongMessageValue(uint256 currentValue, uint256 requiredValue);

    //------------------------------------------------------------------//
    //---------------------- Constructor -------------------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Setup the contract with the collection to be minted
     *
     * @param _collectionContract collection to mint through this contract
     * @param _providerMintFee fee to pay when a new token is minted.
     *      This fee is paid in the blockchain native currency.
     * @param _contractProvider address that will receive the specified mint fee.
     */
    constructor(
        address _collectionContract,
        uint256 _providerMintFee,
        address _contractProvider
    ) {
        require(
            _collectionContract != address(0),
            "Collection contract address can't be the zero address"
        );

        require(
            _contractProvider != address(0),
            "Contract provider can't be the zero address"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(MANAGER_ROLE, _msgSender());
        // Setup variables for interacting with the avatars collection
        collectionContract = _collectionContract;
        originalCollectionInstance = Erc721Collection(collectionContract);
        // Entitle the admin to receive the sales funds
        fundsReceiver = _msgSender();
        // Setup starting sale phase ID
        _currentSalePhaseId = 1;
        // Setup mint fee receiver
        providerMintFee = _providerMintFee;
        contractProvider = payable(_contractProvider);
    }

    //------------------------------------------------------------------//
    //---------------------- Pause management --------------------------//
    //------------------------------------------------------------------//

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    //------------------------------------------------------------------//
    //---------------------- Contract modifiers ------------------------//
    //------------------------------------------------------------------//

    /**
     * @dev Check if the mint is active and prevent sales if it is not.
     */
    modifier mintActive() {
        require(isMintPaused == false, "Mint is not enabled now");
        _;
    }

    //------------------------------------------------------------------//
    //---------------------- Mint status management --------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Disable the mint
     *
     * @dev Disable to possibility to mint in each active sale phase
     */
    function disableMint() external onlyRole(MANAGER_ROLE) {
        isMintPaused = true;
        emit MintDisabled(_msgSender(), block.number);
    }

    /**
     * @notice Enable the mint
     *
     * @dev Enable to possibility to mint in each active sale phase
     */
    function enableMint() external onlyRole(MANAGER_ROLE) {
        isMintPaused = false;
        emit MintEnabled(_msgSender(), block.number);
    }

    //------------------------------------------------------------------//
    //---------------------- Sale phases management --------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Check if a specific sale phase is currently active
     *
     * @param salePhaseId ID of the sale phase to ask for
     *
     * @return 'true' if the sale phase is currently active, 'false' otherwise
     */
    function isSalePhaseActive(uint256 salePhaseId) public view returns (bool) {
        SalePhase memory saleDetails = salePhaseDetails[salePhaseId];

        if (
            block.number >= saleDetails.startBlock &&
            block.number <= saleDetails.endBlock
        ) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * @notice Specify the details a new sale phase, create and activate it
     *
     * @dev Create a new sale phase (enabled automatically) and store its details
     *
     * @param whitelistRequired 'true' if the sale phase to create will allow only
     *      whitelisted addresses to mint, 'false' otherwise
     * @param startBlock block number at which the sale phase starts
     * @param endBlock block number at which the sale phase end. Must be greater than {startBlock}
     * @param payInNativeCurrency 'true' if the sale is in the native currency, 'false' otherwise
     * @param paymentToken address of the ERC20 token to use to pay the mint in the sale phase.
     *      If it is in the native currency must provide an random address that will be ignored
     * @param mintPrice price for minting a single token
     * @param maxMintsPerWallet number of tokens mintable by the same wallet in this phase
     * @param maxMintableAmount total amount of tokens mintable in this sale phase
     */
    function createSalePhase(
        bool whitelistRequired,
        uint256 startBlock,
        uint256 endBlock,
        bool payInNativeCurrency,
        address paymentToken,
        uint256 mintPrice,
        uint256 maxMintsPerWallet,
        uint256 maxMintableAmount
    ) public onlyRole(MANAGER_ROLE) whenNotPaused returns (uint256) {
        require(startBlock < endBlock, "The sale time cannot be zero!");

        // Get and increment sale phase ID for the next sale
        uint256 phaseId = _currentSalePhaseId;
        _currentSalePhaseId = _currentSalePhaseId + 1;

        if (!payInNativeCurrency) {
            require(
                paymentToken != address(0),
                "The zero address is an invalid payment token address"
            );
        }

        SalePhase memory salePhase = SalePhase(
            phaseId,
            whitelistRequired,
            startBlock,
            endBlock,
            payInNativeCurrency,
            payInNativeCurrency ? address(0) : paymentToken,
            mintPrice,
            maxMintsPerWallet,
            maxMintableAmount
        );

        // Setup storage contract information related to the sale
        salePhaseDetails[phaseId] = salePhase;

        emit SalePhaseCreated(_msgSender(), phaseId, block.number);

        return phaseId;
    }

    /**
     * @notice Returns the ID of the latest sale phase created
     *
     * @return the ID of the latest sale phase created.
     *      Return 0 if no sale phase has been created yet.
     */
    function lastSalePhaseCreated() public view returns (uint256) {
        return _currentSalePhaseId - 1;
    }

    /**
     * @notice Grant the whitelist to a list of wallets to buy
     * in a specific sale phase
     *
     * @param salePhaseId ID of the sale phase to grant the whitelist to.
     *      The sale phase must exists, otherwise the transaction reverts.
     * @param wallets list of wallets to grant the whitelist.
     *      The length of the list must be at least 1.
     */
    function grantWhitelistForSalePhase(
        uint256 salePhaseId,
        address[] memory wallets
    ) external onlyRole(MANAGER_ROLE) whenNotPaused {
        // Be sure that this phase needs a whitelist
        SalePhase memory saleDetails = salePhaseDetails[salePhaseId];

        require(
            saleDetails.startBlock > 0,
            "The provided sale phase hasn't been created yet."
        );
        require(
            saleDetails.whitelistRequired,
            "This phase doesn't require a whitelist."
        );

        for (uint256 i = 0; i < wallets.length; i++) {
            address toWhitelist = wallets[i];
            whitelistedPhaseWallets[salePhaseId][toWhitelist] = true;
            emit WhitelistGranted(_msgSender(), toWhitelist, salePhaseId);
        }
    }

    /**
     * @notice Revoke the whitelist from the list of provided wallets
     *      related to a specific sale phase
     *
     * @param salePhaseId ID of the sale phase to grant the whitelist to.
     *      The sale phase must exists, otherwise the transaction reverts.
     * @param wallets List of wallets from which revoke the whitelist.
     *      The length of the list must be at least 1.
     */
    function revokeWhitelistFromSalePhase(
        uint256 salePhaseId,
        address[] memory wallets
    ) external onlyRole(MANAGER_ROLE) whenNotPaused {
        // Be sure that this phase needs a whitelist
        SalePhase memory saleDetails = salePhaseDetails[salePhaseId];

        require(
            saleDetails.startBlock > 0,
            "The provided sale phase hasn't been created yet."
        );
        require(
            saleDetails.whitelistRequired,
            "This phase doesn't require a whitelist"
        );

        for (uint256 i = 0; i < wallets.length; i++) {
            address toRemoveWhitelist = wallets[i];
            whitelistedPhaseWallets[salePhaseId][toRemoveWhitelist] = false;
            emit WhitelistRevoked(_msgSender(), toRemoveWhitelist, salePhaseId);
        }
    }

    /**
     * @notice Disable permanently a specific sale phase
     *
     * @dev Disable a specific sale phase by setting the time
     *      to an impossible timeframe (a block range that is already passed)
     *
     * @param salePhaseId ID of the sale phase to disabl
     */
    function disableSalePhase(uint256 salePhaseId)
        external
        onlyRole(MANAGER_ROLE)
    {
        salePhaseDetails[salePhaseId].startBlock = 1000;
        salePhaseDetails[salePhaseId].endBlock = 1001;
        emit SalePhaseDisabled(_msgSender(), salePhaseId, block.number);
    }

    //------------------------------------------------------------------//
    //---------------------- Funds & Payments management ---------------//
    //------------------------------------------------------------------//

    /**
     * @notice Update the address that is entitled to
     * receive the funds from the {collectionContract} sales
     *
     * @param _newFundsReceiver address the will be able to withdraw funds
     * stored in this smart contract
     */
    function updateFundsReceiver(address _newFundsReceiver)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            _newFundsReceiver != address(0),
            "Funds receiver can't be the zero address"
        );
        fundsReceiver = _newFundsReceiver;
        emit FundsReceiverUpdated(
            _msgSender(),
            _newFundsReceiver,
            block.number
        );
    }

    /**
     * @notice Let a contract manager to withdraw the funds stored
     *      in the contract to the current funds receiver.
     *      The manager can decide which token to withdraw and all the
     *      available amount will be transferred.
     *
     * @dev Let a wallet with the MANAGER_ROLE role to withdraw all the tokens
     *      (either ERC20 specified or native currency) directly
     *      into the {fundsReceiver} wallet address.
     *
     * @param isNativeCurrency 'true' if withdraw the current native currency,
     *      'false' otherwise.
     * @param erc20TokenAddress address of the ERC20 token to withdraw
     *
     * Note: the transaction reverts if the available amount of tokens to
     *      to withdraw is equal to 0.
     */
    function withdrawFunds(bool isNativeCurrency, address erc20TokenAddress)
        external
        onlyRole(MANAGER_ROLE)
        nonReentrant
    {
        if (isNativeCurrency) {
            // Withdraw native currency
            address payable receiver = payable(fundsReceiver);
            require(address(this).balance > 0, "Cannot withdraw 0 tokens");
            (bool sent, ) = receiver.call{value: address(this).balance}("");
            require(sent, "Failed to send Ether");
            emit FundsWithdrawn(fundsReceiver, address(this).balance);
        } else {
            // Withdraw all the available amount of a specific ERC20 currency
            IERC20 tokenInstance = IERC20(erc20TokenAddress);
            uint256 contractBalance = tokenInstance.balanceOf(address(this));
            require(contractBalance > 0, "Cannot withdraw 0 tokens");
            tokenInstance.safeTransfer(fundsReceiver, contractBalance);
            emit FundsWithdrawn(fundsReceiver, contractBalance);
        }
    }

    /**
     * @notice Let a user to pay the mint price for minting one token
     *      using the an ERC20 token.
     *
     * @dev Let a wallet to pay for minting by depositing into the contract
     *      the amount of tokens equal to the {mintPrice}
     *
     * @param mintPrice amount of tokens to transfer (payment) from the
     *      sender to this contract.
     * @param paymentToken address of the ERC20 token used for the payment
     */
    function _payErc20MintPrice(uint256 mintPrice, address paymentToken)
        private
    {
        address buyer = _msgSender();
        IERC20 tokenInstance = IERC20(paymentToken);
        require(
            tokenInstance.balanceOf(buyer) >= mintPrice,
            "Insufficient funds to mint."
        );
        require(
            tokenInstance.allowance(buyer, address(this)) >= mintPrice,
            "The current allowance can't cover the full mint price."
        );
        tokenInstance.safeTransferFrom(buyer, address(this), mintPrice);
        emit MintPaidWithErc20(
            _msgSender(),
            paymentToken,
            mintPrice,
            block.number
        );
    }

    /**
     * @notice Let a user to pay the mint price for minting one token
     *      using the blockchain native currency.
     *
     * @dev Let a wallet to pay for minting by depositing into the contract
     *      the amount of tokens equal to the {mintPrice}
     *
     * @param mintPrice amount of tokens to transfer (payment) from the
     *      sender to this contract.
     */
    function _payNativeCurrencyMintPrice(uint256 mintPrice) private {
        address payable contractAddress = payable(address(this));
        (bool sent, ) = contractAddress.call{value: mintPrice}("");
        require(sent, "Failed to pay the mint price");
        emit MintPaidWithNativeCurrency(_msgSender(), mintPrice, block.number);
    }

    /**
     * @dev Pay the mint fee {providerMintFee} to the fee receiver {contractProvider}
     *      upon a new successful mint. If the number of tokens to mint
     *      is more than 1 the fee will be equal to {providerMintFee} * tokensToMint.
     *
     * @param tokensToMint number of tokens of which pay the mint fee.
     */
    function _payProviderMintFee(uint256 tokensToMint) private {
        if (providerMintFee > 0) {
            (bool sent, ) = contractProvider.call{
                value: providerMintFee * tokensToMint
            }("");
            require(sent, "Failed to pay the mint fee");
        }
        emit MintFeePaid(
            _msgSender(),
            providerMintFee * tokensToMint,
            block.number
        );
    }

    /**
     * @dev Receive native currency fallback.
     *      Called when msg.data is empty
     */
    receive() external payable {
        emit NativePaymentReceived(_msgSender(), msg.value);
    }

    /**
     * @dev Receive native currency fallback.
     *      Called when msg.data is NOT empty
     */
    fallback() external payable {
        emit NativePaymentReceived(_msgSender(), msg.value);
    }

    //------------------------------------------------------------------//
    //---------------------- Mint operations ---------------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Let the sender to mint a token in a specified sale phase.
     *
     * @dev Let the transaction sender (whitelisted when required) to
     *      mint a one token in the specified sale phase if the phase
     *      is not yet ended
     *
     * @param salePhaseId ID of the sale phase in which mint the token
     */
    function _mintToken(uint256 salePhaseId) private {
        SalePhase memory saleDetails = salePhaseDetails[salePhaseId];

        // Check if sale phase exists
        require(saleDetails.startBlock > 0, "This sale phase doesn't exists.");
        // Check if sale is active
        require(isSalePhaseActive(salePhaseId), "Sale phase not active");

        // Retrieve useful details
        uint256 currentMaxPhaseMintableTokens = saleDetails.maxSalePhaseCap;
        bool whitelistRequired = saleDetails.whitelistRequired;
        uint256 mintPrice = saleDetails.mintPrice;
        address currentWallet = _msgSender();
        uint256 tokensAlreadyMinted = salePhaseMintedTokensCounter[salePhaseId];

        // Check if a new token can be minted
        require(
            tokensAlreadyMinted < currentMaxPhaseMintableTokens,
            "This sale is sold out."
        );

        // Check if the user is whitelisted for this sale phase
        if (whitelistRequired) {
            // Check if the sender is whitelisted
            require(
                whitelistedPhaseWallets[salePhaseId][currentWallet],
                "You are not allowed to mint in this phase"
            );
        }

        // Fetch payment info
        bool mustPayWithNativeCurrency = saleDetails.payInNativeCurrency;

        // Check if the user has reached the mint amount limit
        uint256 walletMintLimit = saleDetails.maxMintsPerWallet;
        if (walletMintLimit == UNLIMITED_MINTABLE_TOKENS) {
            // No mint limitations for this sale phase
            if (mintPrice > 0) {
                if (mustPayWithNativeCurrency) {
                    _payNativeCurrencyMintPrice(mintPrice);
                } else {
                    _payErc20MintPrice(mintPrice, saleDetails.paymentToken);
                }
            }
            // Increment sale phase minted tokens
            salePhaseMintedTokensCounter[salePhaseId]++;
            // Mint the token
            originalCollectionInstance.safeMint(currentWallet);
        } else {
            require(
                salePhaseMintedTokens[salePhaseId][currentWallet] <
                    walletMintLimit,
                "Max minting limit reached! You can't mint more tokens."
            );
            if (mintPrice > 0) {
                if (mustPayWithNativeCurrency) {
                    _payNativeCurrencyMintPrice(mintPrice);
                } else {
                    _payErc20MintPrice(mintPrice, saleDetails.paymentToken);
                }
            }
            // Increment sale phase minted tokens
            salePhaseMintedTokensCounter[salePhaseId]++;
            // Increment user phase minted tokens
            salePhaseMintedTokens[salePhaseId][currentWallet]++;
            // Mint the token
            originalCollectionInstance.safeMint(currentWallet);
        }
    }

    /**
     * @notice Mint a specified amount of tokens in a specific sale phase
     *
     * @dev Let the transaction sender wallet to mint the specified amount
     *      of tokens ({tokensToMint}) in the specified sale phase
     *      ({salePhaseId}). If the whitelisted is required the wallet must
     *      be whitelisted, otherwise reverts with an error.
     *
     * @param tokensToMint number of Titans to mint in this sale phase
     * @param salePhaseId ID of the sale phase in which buy the tokens
     */
    function mintTokens(uint256 tokensToMint, uint256 salePhaseId)
        public
        payable
        whenNotPaused
        mintActive
    {
        require(tokensToMint > 0, "Can't mint 0 tokens!");
        if (salePhaseDetails[salePhaseId].payInNativeCurrency) {
            uint256 amountRequired = (salePhaseDetails[salePhaseId].mintPrice +
                providerMintFee) * tokensToMint;
            if (msg.value != amountRequired) {
                revert WrongMessageValue(msg.value, amountRequired);
            }
        } else {
            if (msg.value != providerMintFee * tokensToMint) {
                revert WrongMessageValue(
                    msg.value,
                    providerMintFee * tokensToMint
                );
            }
        }
        _payProviderMintFee(tokensToMint);
        for (uint256 i = 0; i < tokensToMint; i++) {
            _mintToken(salePhaseId);
        }
        emit NftsMinted(_msgSender(), tokensToMint, salePhaseId, block.number);
    }

    /**
     * @notice Let the a wallet with the TEAM_MINTER_ROLE role to mint
     *      an arbitrary amount of tokens to the same wallet and outside
     *      any existing sale phase.
     *
     * @dev Let a wallet with the {TEAM_MINTER_ROLE} role to mint to the same
     *      wallet a batch number of tokens equal to {tokensToMint} outside
     *      any active/past sale phase.
     *
     * @param tokensToMint tokens to mint to the transaction sender wallet
     *
     * Note: if the amount of tokens to mint exceeds the max collection supply
     *      the transaction reverts with a custom error.
     */
    function teamMint(uint256 tokensToMint)
        external
        payable
        onlyRole(TEAM_MINTER_ROLE)
    {
        uint256 tokensAlreadyMinted = originalCollectionInstance
            .getCurrentSupply();

        require(
            tokensAlreadyMinted + tokensToMint <=
                originalCollectionInstance.getMaxCollectionSupply(),
            "Mint will lead to exceed the max collection supply"
        );
        // Check transaction msg.value for paying the provider fee
        if (msg.value != providerMintFee * tokensToMint) {
            revert WrongMessageValue(msg.value, providerMintFee * tokensToMint);
        }
        _payProviderMintFee(tokensToMint);
        for (uint256 i = 0; i < tokensToMint; i++) {
            originalCollectionInstance.safeMint(_msgSender());
        }
        emit TeamMintedNfts(_msgSender(), tokensToMint);
    }
}
