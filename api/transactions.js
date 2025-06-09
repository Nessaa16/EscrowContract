const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction'); 

// GET /api/transactions - Fetch all transactions
router.get('/', async (req, res) => {
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
router.get('/user/:walletAddress', async (req, res) => {
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

// GET /api/transactions/:orderId - Get specific transaction by orderId
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log(`Fetching transaction with orderId: ${orderId}`);
        
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        console.log(`Transaction found: ${transaction._id}`);
        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ 
            error: 'Failed to fetch transaction', 
            details: error.message 
        });
    }
});

// POST /api/transactions - Create a new transaction
router.post('/', async (req, res) => {
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

// PUT /api/transactions/:orderId - Update transaction (general update)
router.put('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log(`Updating transaction ${orderId} with data:`, req.body);
        
        const transaction = await Transaction.findOneAndUpdate(
            { orderId }, 
            req.body, 
            { new: true, runValidators: true }
        );
        
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        console.log(`Transaction updated: ${transaction._id}`);
        res.json(transaction);
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(400).json({ 
            error: 'Failed to update transaction', 
            details: error.message 
        });
    }
});

// POST /api/transactions/:orderId/cancel - Cancel an order (with option to delete from DB)
router.post('/:orderId/cancel', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { cancelReason, cancelledBy, deleteFromDB } = req.body;
        
        console.log(`Attempting to cancel order: ${orderId}`);
        console.log('Cancel data:', { cancelReason, cancelledBy, deleteFromDB });
        
        // Find the transaction first
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        // Check if transaction can be cancelled
        const cancellableStatuses = ['AWAITING_DELIVERY', 'AWAITING_PAYMENT'];
        if (!cancellableStatuses.includes(transaction.blockchainStatus)) {
            return res.status(400).json({ 
                error: 'Transaction cannot be cancelled', 
                currentStatus: transaction.blockchainStatus,
                orderId,
                message: `Only orders with status ${cancellableStatuses.join(' or ')} can be cancelled`
            });
        }
        
        // Option 1: Delete from database completely
        if (deleteFromDB === true) {
            const deletedTransaction = await Transaction.findOneAndDelete({ orderId });
            
            console.log(`Order ${orderId} cancelled and deleted from database`);
            console.log('Deleted transaction data:', {
                orderId: deletedTransaction.orderId,
                status: deletedTransaction.blockchainStatus,
                totalAmount: deletedTransaction.totalAmountETH,
                customer: deletedTransaction.customerWalletAddress
            });
            
            res.json({
                success: true,
                message: 'Order cancelled and deleted from database successfully',
                action: 'DELETED_FROM_DATABASE',
                deletedTransaction: {
                    orderId: deletedTransaction.orderId,
                    totalAmountETH: deletedTransaction.totalAmountETH,
                    customerWalletAddress: deletedTransaction.customerWalletAddress,
                    originalStatus: deletedTransaction.blockchainStatus,
                    deletedAt: new Date().toISOString()
                }
            });
        } 
        // Option 2: Update status to cancelled (keep in database for audit trail)
        else {
            const updatedTransaction = await Transaction.findOneAndUpdate(
                { orderId },
                {
                    blockchainStatus: 'CANCELLED',
                    cancelReason: cancelReason || 'No reason provided',
                    cancelledBy: cancelledBy || 'Unknown',
                    cancelledAt: new Date(),
                    updatedAt: new Date()
                },
                { new: true, runValidators: true }
            );
            
            console.log(`Order ${orderId} cancelled successfully (kept in database)`);
            console.log('Updated transaction:', {
                orderId: updatedTransaction.orderId,
                newStatus: updatedTransaction.blockchainStatus,
                cancelReason: updatedTransaction.cancelReason,
                cancelledBy: updatedTransaction.cancelledBy,
                cancelledAt: updatedTransaction.cancelledAt
            });
            
            res.json({
                success: true,
                message: 'Order cancelled successfully',
                action: 'STATUS_UPDATED_TO_CANCELLED',
                transaction: updatedTransaction
            });
        }
        
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({
            error: 'Failed to cancel order',
            details: error.message,
            orderId: req.params.orderId
        });
    }
});

// POST /api/transactions/:orderId/ship - Ship an order
router.post('/:orderId/ship', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { trackingNumber, shippingCarrier, shippingAddress, shippedBy } = req.body;
        
        console.log(`Attempting to ship order: ${orderId}`);
        console.log('Shipping data:', { trackingNumber, shippingCarrier, shippingAddress, shippedBy });
        
        // Find the transaction first
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        // Check if transaction can be shipped
        if (transaction.blockchainStatus !== 'AWAITING_DELIVERY') {
            return res.status(400).json({ 
                error: 'Transaction cannot be shipped', 
                currentStatus: transaction.blockchainStatus,
                orderId,
                message: 'Only orders with AWAITING_DELIVERY status can be shipped'
            });
        }
        
        // Prepare shipping data
        const shippingData = {
            blockchainStatus: 'SHIPPED',
            shippedAt: new Date(),
            updatedAt: new Date()
        };
        
        // Add optional shipping details if provided
        if (trackingNumber) shippingData.trackingNumber = trackingNumber;
        if (shippingCarrier) shippingData.shippingCarrier = shippingCarrier;
        if (shippingAddress) shippingData.shippingAddress = shippingAddress;
        if (shippedBy) shippingData.shippedBy = shippedBy;
        
        // Update transaction status to shipped
        const updatedTransaction = await Transaction.findOneAndUpdate(
            { orderId },
            shippingData,
            { new: true, runValidators: true }
        );
        
        console.log(`Order ${orderId} shipped successfully`);
        console.log('Updated transaction:', {
            orderId: updatedTransaction.orderId,
            newStatus: updatedTransaction.blockchainStatus,
            shippedAt: updatedTransaction.shippedAt,
            trackingNumber: updatedTransaction.trackingNumber,
            shippingCarrier: updatedTransaction.shippingCarrier
        });
        
        res.json({
            success: true,
            message: 'Order shipped successfully',
            transaction: updatedTransaction
        });
        
    } catch (error) {
        console.error('Error shipping order:', error);
        res.status(500).json({
            error: 'Failed to ship order',
            details: error.message,
            orderId: req.params.orderId
        });
    }
});

// POST /api/transactions/:orderId/complete - Complete/Deliver an order
router.post('/:orderId/complete', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { deliveryConfirmation, completedBy } = req.body;
        
        console.log(`Attempting to complete order: ${orderId}`);
        
        // Find the transaction first
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        // Check if transaction can be completed
        if (transaction.blockchainStatus !== 'SHIPPED') {
            return res.status(400).json({ 
                error: 'Transaction cannot be completed', 
                currentStatus: transaction.blockchainStatus,
                orderId,
                message: 'Only shipped orders can be completed'
            });
        }
        
        // Update transaction status to completed
        const updatedTransaction = await Transaction.findOneAndUpdate(
            { orderId },
            {
                blockchainStatus: 'COMPLETED',
                completedAt: new Date(),
                deliveryConfirmation: deliveryConfirmation || 'Delivered successfully',
                completedBy: completedBy || 'System',
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        );
        
        console.log(`Order ${orderId} completed successfully`);
        console.log('Completed transaction:', {
            orderId: updatedTransaction.orderId,
            newStatus: updatedTransaction.blockchainStatus,
            completedAt: updatedTransaction.completedAt,
            deliveryConfirmation: updatedTransaction.deliveryConfirmation
        });
        
        res.json({
            success: true,
            message: 'Order completed successfully',
            transaction: updatedTransaction
        });
        
    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({
            error: 'Failed to complete order',
            details: error.message,
            orderId: req.params.orderId
        });
    }
});

// GET /api/transactions/:orderId/status - Get order status
router.get('/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const transaction = await Transaction.findOne({ orderId });
        if (!transaction) {
            return res.status(404).json({ 
                error: 'Transaction not found', 
                orderId 
            });
        }
        
        res.json({
            orderId: transaction.orderId,
            status: transaction.blockchainStatus,
            createdAt: transaction.transactionDate,
            updatedAt: transaction.updatedAt,
            ...(transaction.shippedAt && { shippedAt: transaction.shippedAt }),
            ...(transaction.completedAt && { completedAt: transaction.completedAt }),
            ...(transaction.cancelledAt && { cancelledAt: transaction.cancelledAt }),
            ...(transaction.trackingNumber && { trackingNumber: transaction.trackingNumber }),
            ...(transaction.shippingCarrier && { shippingCarrier: transaction.shippingCarrier }),
            ...(transaction.cancelReason && { cancelReason: transaction.cancelReason })
        });
        
    } catch (error) {
        console.error('Error fetching order status:', error);
        res.status(500).json({
            error: 'Failed to fetch order status',
            details: error.message
        });
    }
});

module.exports = router;