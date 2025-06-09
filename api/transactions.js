 // api/transactions.js
const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction'); // Path to your Transaction model

// GET /api/transactions - Fetch all transactions
router.get('/transactions', async (req, res) => {
    try {
        console.log('Fetching transactions from MongoDB...');
        const transactions = await Transaction.find({}).sort({ createdAt: -1 });
        console.log(`Found ${transactions.length} transactions`);
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            error: 'Failed to fetch transactions',
            details: error.message
        });
    }
});

// GET /api/transactions/user/:walletAddress - Fetch transactions by user wallet address
router.get('/transactions/user/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        if (!walletAddress) {
            return res.status(400).json({ error: 'Missing walletAddress parameter.' });
        }

        const transactions = await Transaction.find({
            $or: [
                { customerWalletAddress: walletAddress.toLowerCase() },
                { sellerWalletAddress: walletAddress.toLowerCase() }
            ]
        }).sort({ transactionDate: -1 });

        res.json(transactions);
    } catch (err) {
        console.error('Error fetching user transactions:', err.message);
        res.status(500).json({ error: 'Failed to fetch user transactions.' });
    }
});

// POST /api/transactions - Create a new transaction
router.post('/transactions', async (req, res) => {
    try {
        console.log('Creating new transaction:', req.body);
        const transaction = new Transaction(req.body);
        const savedTransaction = await transaction.save();
        console.log('Transaction created:', savedTransaction._id);
        res.status(201).json(savedTransaction);
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(400).json({
            error: 'Failed to create transaction',
            details: error.message
        });
    }
});

// Add other specific transaction routes (get by orderId, update by orderId) if you need them in this router
// Example (if not already in your full transactions.js):
/*
router.get('/transactions/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found', orderId });
        }
        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ error: 'Failed to fetch transaction', details: error.message });
    }
});

router.put('/transactions/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const transaction = await Transaction.findOneAndUpdate({ orderId }, req.body, { new: true, runValidators: true });
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found', orderId });
        }
        res.json(transaction);
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(400).json({ error: 'Failed to update transaction', details: error.message });
    }
});
*/

module.exports = router;