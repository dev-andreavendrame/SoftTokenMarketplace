#### NOTICE: This project is solely intended as a container for the smart contracts that need to be audited from Hacken. A full test suite that covers all the smart contracts features has not been developed, but the behavior of all the contracts has been extensively tested on-chain (on Mumbai, Polygon testnet).

# Project overview

The smart contracts contained in this repository allow the deployer to achieve the following features:

1. Create an ERC721 collection with some custom features like custom URI, third party minting and custom token IDs range.
2. Create a **minter contract** that allows the deployer sell ERC721 NFTs by creating allow lists, limited sale phases, pay with native currencies and ERC20 tokens and set a third-party to earn from each token sale.
3. Create a **soft-token contract**, a smart contract that simulates some of the ERC20 token features in a simplified way.
4. A simple marketplace for ERC721 and ERC1155 tokens that can be sold by selecting an ERC20 payment token.
5. An **ERC1155 claimer** contract that allows to claim ERC1155 tokens in _pseudo-random_ way and in a simple way.

# Project structure

The main project folder is structured as follows:

- Project root
  - contracts
    - **CollectionMinter.sol**
    - **Erc721Collection.sol**
    - **Erc1155Claimer.sol**
    - **SnowMarketplace.sol**
    - **SnowTracker.sol**
    - linesCounter.js
    - gasReport.txt
    - SimpleErc721.sol
    - SimpleErc1155.sol
  - test
    - test.js
    - scripts (empty)
  - ...

## Smart contracts (contracts folder)

### Relevant contracts

In the 'contracts' folder we can find 7 smart contracts.
For the aim of the audit only the following contracts need to be considered:

    CollectionMinter.sol
    Erc721Collection.sol
    Erc1155Claimer.sol
    SnowMarketplace.sol
    SnowTracker.sol

## Contracts relationships

The project contracts are aimed to provide different features and for this reason they can be grouped into 3 main logic blocks.

1. Create and sell an ERC721 token collection
2. Claim ERC1155 tokens
3. Manage a simple marketplace with a soft-token.

These 3 logic blocks dictate the relationships of the custom smart contracts reported above.

### Create and sell an ERC721 token collection

For this feature the smart contracts involved are `CollectionMinter.sol` and `Erc721Collection.sol`.

### Claim ERC1155 tokens

For this feature the smart contracts involved are `Erc1155Claimer.sol` and `SimpleErc1155.sol`.

### Manage and use a simple marketplace with a soft-token.

For this feature the smart contracts involved are `SnowTracker.sol`, `SnowMarketplace.sol`, `SimpleErc721.sol`, and `SimpleErc1155.sol` .

## Support contracts

The smart contracts with '_Simple_' as the beginning of the file name have been created in order (and only) to support the execution of the automated tests contained in the _test.js_, through the Hardhat command:

    npx hardhat test

OpenZeppelin contracts have been used as a safe base to build the custom contracts available in this repository.

# Specifications, functional and technical requirements.

The smart contract files include extensive documentation, offering a detailed overview of each contract's features, dependencies, and limitations. This encompasses a comprehensive breakdown of the overarching functions. Each custom function within these contracts is meticulously documented, specifying its behavior, input parameters, and resulting output or associated side effects. Furthermore, relationships, use cases, and both functional and technical requirements are presented in three separate documents, with each one corresponding to a logic block. These documents provide detailed insights into the features outlined above.

For each logical block below is linked the corresponding document:

- Create and sell an ERC721 token collection [Documentation](./docs/Doc%20-%20Create%20and%20sell%20an%20ERC721%20token%20collection.pdf)
- Claim ERC1155 tokens - [Documentation](./docs/Doc%20-%20Erc1155Claimer.pdf)
