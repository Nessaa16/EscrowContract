// models/transaction.js
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true }, 
  customerWalletAddress: { type: String, required: true }, 
  sellerWalletAddress: { type: String }, 
  items: [{
    id: { type: Number, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, 
    quantity: { type: Number, required: true }
  }],
  totalAmountETH: { type: Number, required: true },
  transactionDate: { type: Date, default: Date.now },
  blockchainStatus: { type: String, enum: ['AWAITING_PAYMENT', 'AWAITING_DELIVERY', 'IN_DELIVERY', 'DELIVERED', 'COMPLETE', 'CANCELED', 'DISPUTED'], required: true }, // Status from the blockchain escrow
}, { timestamps: true }); 

module.exports = mongoose.model("Transaction", transactionSchema);