const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http'); // Required for Vercel serverless functions
const cors = require('cors');

require('dotenv').config();
const PinataSDK = require('@pinata/sdk'); // For Pinata interaction

const app = express();

app.use(cors());
app.use(express.json());

const Escrow = require('../models/escrow'); // Assuming these models exist
const Transaction = require('../models/transaction'); // Assuming these models exist

const transactionsRouter = require('./transactions');

// Initialize Pinata SDK with environment variables
const pinata = new PinataSDK({
    pinataJwt: process.env.VITE_JWT, // Ensure VITE_JWT is set in your .env or Vercel environment variables
    pinataGateway: process.env.VITE_GATEWAY // Ensure VITE_GATEWAY is set
});

// Connect to MongoDB using Mongoose
// Check connection state to prevent multiple connections in serverless environment
if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGO_URI) // Ensure MONGO_URI is set
        .then(() => console.log('MongoDB connected'))
        .catch((err) => console.error('MongoDB error:', err));
}

// FIX: Mount transactionsRouter at '/transactions' instead of '/api/transactions'
// Vercel's vercel.json already handles routing /api/transactions to this serverless function's root.
app.use('/transactions', transactionsRouter);

// This route for Pinata upload is correctly defined at the root of the Express app,
// so when Vercel routes /api/upload-json-to-pinata to this function, it will match.
app.post('/upload-json-to-pinata', async (req, res) => {
    try {
        const { jsonContent } = req.body;
        if (!jsonContent) {
            return res.status(400).json({ error: 'Missing jsonContent in request body' });
        }

        const options = {
            pinataMetadata: {
                name: 'EscrowMetadata', // You might want to make this dynamic
            },
            pinataOptions: {
                cidVersion: 0,
            },
        };

        const result = await pinata.pinJSONToPinata(jsonContent, options);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error uploading JSON to Pinata:', error);
        res.status(500).json({ error: 'Failed to upload JSON to Pinata', details: error.message });
    }
});

// Export the Express app as a module
module.exports = app;

// Export the app as a serverless handler for Vercel
module.exports.handler = serverless(app);
