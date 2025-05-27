const hre = require("hardhat");

async function main() {
  const EscrowContract = await hre.ethers.getContractFactory("EscrowContract");
  const escrow = await EscrowContract.deploy();
  await escrow.deployed();
  console.log("Deployed to:", escrow.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
