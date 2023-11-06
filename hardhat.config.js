require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-solhint");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	networks: {
		hardhat: {
			rpc: "http://127.0.0.1:8545/",
		},
	},

	solidity: "0.8.20",
};
