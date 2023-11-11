require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-solhint");
require("hardhat-gas-reporter");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	networks: {
		hardhat: {
			rpc: "http://127.0.0.1:8545/",
		},
	},
	gasReporter: {
		enabled: true,
		outputFile: "gasReport.txt",
		noColors: true,
		gasPrice: 200, // Simulate congested network
		token: "MATIC",
		gasPriceApi: "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
		coinmarketcap: process.env.COINMARKETCAP_KEY,
	},

	solidity: "0.8.20",
};
