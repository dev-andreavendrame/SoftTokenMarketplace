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

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

/*
 * This contract represents a traditional ERC721 collection with few custom features.
 *
 * Basic features of the collection:
 * - Custom token IDs range: that is available by specifing the {_maximumNftTokenId}
 * and the {_maximumNftTokenId} when deploying the contract.
 * - Custom URIs: on the deployment time the deployer can set a partial metadata URL
 * that will be used to mint all the new tokens. After the deployment is possible
 * instead to customize the exisist token URIs by editing the value through
 * a custom function.
 * - Mint from third party: it is possible to let a third party, EOA or smart contract,
 * to mint tokens from this contract. This is used to create the drop logic into a
 * different contract, but keeping the constraints of the collection.
 *
 * ----- Access control -----
 *
 * The contract (in addition to the DEFAULT_ADMIN_ROLE role) leverages the following roles:
 * - The pauser (PAUSER_ROLE) can enable/disable the possibility to mint new tokens
 * and change the URI of existing ones.
 * - The minter (MINTER_ROLE) is able to call the {safeMint} function to mint new
 * tokens of the collection.
 * - The URI editor (URI_EDITOR_ROLE) can change the URI of an existing collection token.
 *
 * ----- Owner control -----
 *
 * This contract supports the Ownable interface in addition to the AccessControl.
 * This will help in transfering the collection ownership in order to handle the
 * collection in future marketplaces without using always and only the deployer wallet.
 */
contract Erc721Collection is
    ERC721,
    ERC721URIStorage,
    ERC721Pausable,
    ERC721Burnable,
    AccessControl,
    Ownable,
    ERC2981
{
    // Access control roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_EDITOR_ROLE = keccak256("URI_EDITOR_ROLE");

    // Interface to support
    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;
    bytes4 private constant _INTERFACE_ID_ACCESS_CONTROL = 0x7965db0b;
    bytes4 private constant _INTERFACE_ID_ERC721_URI_STORAGE = 0x49064906;
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;

    // NFT token ID counter
    uint256 private _nextTokenId;

    // Collection supply constraints
    uint256 public immutable minimumNftTokenId;
    uint256 public immutable maximumNftTokenId;

    // Collection initial URI
    string public partialMetadataUri;

    // Royalties information
    address public immutable royaltiesReceiver;
    uint96 public immutable contractRoyaltiesBps;

    //------------------------------------------------------------------//
    //-------------------- Constructor ---------------------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Setup the contract for the collection specifying the medatata
     * URI, the token IDs range and the royalties receiver.
     *
     * @param _minimumNftTokenId ID of the first token minted in the collection
     * @param _maximumNftTokenId ID of the last token minted in the collection
     * @param _contractRoyaltiesBps amount of royalties to pay in secondary sales
     * expresses in Basic Points
     * @param _partialMetadataUri initial part of the token URI that will
     * be added by default to any token on mint time (when minting a new token the
     * current URI will be equal to "{_partialMetadataUri}{tokenID}.json").
     */
    constructor(
        uint256 _minimumNftTokenId,
        uint256 _maximumNftTokenId,
        uint96 _contractRoyaltiesBps,
        string memory _partialMetadataUri
    ) ERC721("NftCollection", "NFTC") Ownable(_msgSender()) {
        // Setup initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(PAUSER_ROLE, _msgSender());

        // Setup collection IDs range
        minimumNftTokenId = _minimumNftTokenId;
        maximumNftTokenId = _maximumNftTokenId;

        // Let the counter starts from the {_minimumNftTokenId} ID
        _nextTokenId = _minimumNftTokenId;

        // Set royalties for the collection
        royaltiesReceiver = _msgSender();
        contractRoyaltiesBps = _contractRoyaltiesBps;
        _setDefaultRoyalty(_msgSender(), _contractRoyaltiesBps);

        // Setup token metadata URI
        partialMetadataUri = _partialMetadataUri;
    }

    //------------------------------------------------------------------//
    //-------------------- Contract interactions management ------------//
    //------------------------------------------------------------------//

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    //------------------------------------------------------------------//
    //-------------------- Collection mint -----------------------------//
    //------------------------------------------------------------------//

    /**
     * @dev mint a token specifying the ID and the wallet address generating
     * automatically the token URI based on the constructor parameter provided
     */
    function _safeMintToken(address to, uint256 tokenId) private {
        // Create token URI
        string memory tokenUri = string(
            abi.encodePacked(
                partialMetadataUri,
                Strings.toString(tokenId),
                ".json"
            )
        );
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);
    }

    /**
     * @notice Mint the next token to the specified wallet
     *
     * @param to wallet that will receive the minted token
     */
    function safeMint(address to) public onlyRole(MINTER_ROLE) whenNotPaused {
        // Check if mint cap is reached
        require(
            _nextTokenId < maximumNftTokenId + 1,
            "Max supply reached. Can't mint more tokens"
        );

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        _safeMintToken(to, tokenId);
    }

    //------------------------------------------------------------------//
    //-------------------- Required Solidity overrides -----------------//
    //------------------------------------------------------------------//

    /**
     * @dev Default Solidity override
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Pausable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Default Solidity override
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Default Solidity override
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC2981, ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IAccessControl).interfaceId ||
            interfaceId == type(IERC721).interfaceId ||
            interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    //------------------------------------------------------------------//
    //-------------------- Colection URIs management -------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Change the metadata URI of an existing token of the collection
     *
     * @dev Change the token {tokenId} URI into the provided {_tokenURI}
     *
     * @param tokenId token of which edit the existing URI
     * @param newTokenURI new token URI to set
     */
    function setTokenURI(uint256 tokenId, string memory newTokenURI)
        external
        onlyRole(URI_EDITOR_ROLE)
        whenNotPaused
    {
        _setTokenURI(tokenId, newTokenURI);
    }

    /**
     * @dev Set the base URI of the collection to an empty string
     * in order to be able to set fully customized token URIs
     */
    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    //------------------------------------------------------------------//
    //-------------------- Collection supply checks --------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Get the current collection supply
     */
    function getCurrentSupply() public view returns (uint256) {
        if (_nextTokenId == 0) {
            return 0;
        } else {
            return _nextTokenId - minimumNftTokenId;
        }
    }

    /**
     * @notice Get the MAX collection supply
     */
    function getMaxCollectionSupply() public view returns (uint256) {
        return maximumNftTokenId - minimumNftTokenId + 1;
    }

    //------------------------------------------------------------------//
    //-------------------- Royalties management ------------------------//
    //------------------------------------------------------------------//

    /**
     * @notice Update the royalties receiver and the royalties amount
     *
     * @param receiver the new wallet that will receive the royalties
     * @param newBpsAmount the new amount of royalties to pay on any new sale
     */
    function updateDefaultRoyaties(address receiver, uint96 newBpsAmount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setDefaultRoyalty(receiver, newBpsAmount);
    }
}
