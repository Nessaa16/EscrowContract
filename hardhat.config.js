require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28", // Versi Solidity tetap sama
  networks: {
    holesky: { 
      url: "https://ethereum-holesky-rpc.publicnode.com",
      accounts: [process.env.HOLESKY_PRIVATE_KEY]
    },
  },
  etherscan: {
    apiKey: {
      holesky: process.env.API_KEY
    }
  }
};