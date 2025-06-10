// api/index.js
const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const cors = require('cors');

require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const Escrow = require('../models/escrow'); 
const Transaction = require('../models/transaction');

const transactionsRouter = require('./transactions');

// Connect to MongoDB using Mongoose
if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB connected'))
        .catch((err) => console.error('MongoDB error:', err));
}

app.use('/api/transactions', transactionsRouter);


module.exports = app;
module.exports.handler = serverless(app);