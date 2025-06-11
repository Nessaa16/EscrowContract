require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28", // Versi Solidity tetap sama
  networks: {
    sepolia: { 
      url: `${process.env.INFURA_URL}`, // URL dari Sepolia
      accounts: [process.env.PRIVATE_KEY]
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.API_KEY
    }
  }
};