const mongoose = require("mongoose");

const escrowSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customer: String,
  seller: String,
  orderFee: Number,
  paymentDeadline: Number,
  status: String,
  tokenId: Number,
  uri: String,
}, { timestamps: true });

module.exports = mongoose.model("Escrow", escrowSchema);
