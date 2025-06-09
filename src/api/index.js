const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');
const cors = require('cors');
require('dotenv').config();
const PinataSDK = require('@pinata/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const Escrow = require('../../models/escrow');
const Transaction = require('../../models/transaction');

const pinata = new PinataSDK({
    pinataJwt: process.env.VITE_JWT,
    pinataGateway: process.env.VITE_GATEWAY
});

// MongoDB connection
if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB connected'))
        .catch((err) => console.error('MongoDB error:', err));
}

// Add /api prefix to all routes
app.get('/api/transactions-list', async (req, res) => {
    try {
        const transactions = await Transaction.find();
        res.json(transactions);
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ error: 'Failed to fetch transaction data' });
    }
});

app.post('/api/upload-json-to-pinata', async (req, res) => {
    try {
        const { jsonContent } = req.body;
        if (!jsonContent) {
            return res.status(400).json({ error: 'Missing jsonContent in request body' });
        }

        const options = {
            pinataMetadata: {
                name: 'EscrowMetadata',
            },
            pinataOptions: {
                cidVersion: 0,
            },
        };

        const result = await pinata.pinJSONToIPFS(jsonContent, options);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error uploading JSON to Pinata:', error);
        res.status(500).json({ error: 'Failed to upload JSON to Pinata' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { orderId, customerWalletAddress, sellerWalletAddress, items, totalAmountETH, blockchainStatus } = req.body;

        if (!orderId || !customerWalletAddress || !items || !totalAmountETH || !blockchainStatus) {
            return res.status(400).json({ error: 'Missing required transaction data.' });
        }

        const newTransaction = new Transaction({
            orderId,
            customerWalletAddress,
            sellerWalletAddress,
            items,
            totalAmountETH,
            blockchainStatus,
        });

        await newTransaction.save();
        res.status(201).json({ message: 'Transaction saved successfully', transaction: newTransaction });
    } catch (error) {
        console.error('Error saving transaction:', error.message);
        if (error.code === 11000) {
            return res.status(409).json({ error: 'Transaction with this orderId already exists.' });
        }
        res.status(500).json({ error: 'Failed to save transaction.' });
    }
});

// Health check endpoint
app.get('/api', (req, res) => {
    res.json({ status: 'OK', message: 'API is running' });
});

module.exports = app;
module.exports.handler = serverless(app);