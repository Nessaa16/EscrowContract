
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const ContractModule = buildModule("ContractModule", (m) => {
  const contract = m.contract("EscrowContract");
  return { contract };
});

module.exports = ContractModule;
