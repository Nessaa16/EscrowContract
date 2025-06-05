const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const Escrow = require('../../../models/escrow');

// Hanya connect jika belum terhubung
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB error:', err));
}

app.get('/', async (req, res) => {
  try {
    const escrows = await Escrow.find();
    res.json(escrows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

module.exports = app;
module.exports.handler = serverless(app);
