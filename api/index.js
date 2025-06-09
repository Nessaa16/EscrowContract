const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http'); // Required for Vercel serverless functions
const cors = require('cors');

require('dotenv').config();
const PinataSDK = require('@pinata/sdk'); // For Pinata interaction

const app = express();

app.use(cors());
app.use(express.json());

const Escrow = require('../models/escrow');
const Transaction = require('../models/transaction');

const transactionsRouter = require('./transactions');

const pinata = new PinataSDK({
    pinataJwt: process.env.VITE_JWT,
    pinataGateway: process.env.VITE_GATEWAY
});

// Connect to MongoDB using Mongoose
if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB connected'))
        .catch((err) => console.error('MongoDB error:', err));
}

app.use('/api/transactions', transactionsRouter);

app.post('/upload-json-to-pinata', async (req, res) => {
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

        const result = await pinata.pinJSONToPinata(jsonContent, options);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error uploading JSON to Pinata:', error);
        res.status(500).json({ error: 'Failed to upload JSON to Pinata' });
    }
});

module.exports = app;
module.exports.handler = serverless(app);