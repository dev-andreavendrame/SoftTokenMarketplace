const fs = require("fs");
const path = require("path");

function countLinesWithAsteriskOrNotEmpty(filename) {
	try {
		const filePath = path.join(__dirname, filename); // Use __dirname to get the current script's directory
		const data = fs.readFileSync(filePath, "utf8");
		const lines = data.split("\n");
		let lineCount = 0;

		/**
		 * A line is not Solidity code if matches one of the following conditions:
		 * 1. Line is empty
		 * 2. Line starts with '//' (is a comment)
		 * 3. Line includes the '*' character (is a multi-line comment)
		 */
		for (const line of lines) {
			if (line.trim() !== "" && !line.includes("*") && !line.trim().startsWith("//")) {
				lineCount++;
			}
		}

		return lineCount;
	} catch (error) {
		console.error("Error reading the file:", error);
		return -1; // Return -1 to indicate an error
	}
}

const fileNames = [
	"SnowMarketplace.sol",
	"SnowTracker.sol",
	"Erc1155Claimer.sol",
	"CollectionMinter.sol",
	//"TitanRevealer.sol",
	"Erc721Collection.sol",
];
var totalSolcLines = 0;
for (let i = 0; i < fileNames.length; i++) {
	const lineCount = countLinesWithAsteriskOrNotEmpty(fileNames[i]);
	totalSolcLines += lineCount;
	if (lineCount !== -1) {
		console.log(`The file '${fileNames[i]}' has ${lineCount} lines of Solidity code`);
	}
}
console.log(`\nTotal lines of Solidity code in the smart contracts to analyze: ${totalSolcLines}`);
