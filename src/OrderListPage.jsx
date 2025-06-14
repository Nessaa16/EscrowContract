import React, { useState, useEffect } from 'react';
import * as ethers from "ethers";
import { BrowserProvider } from "ethers";

import {
    connectWallet,
    getEscrow,
    deliverOrder,
    confirmOrderDelivered,
    releaseToSeller,
    cancelTransactionBlockchain,
    cancelTransactionBackend,
    fetchTransactionsFromBackend,
    updateOrderStatusBackend,
    pinata 
} from '/src/connect.js';

/**
 * OrderListPage component to display user transaction/order list.
 * Uses `setModalMessage`, `setModalType`, `setShowModal` props from App.jsx
 * to display modal notifications.
 */
const OrderListPage = ({ wallet, walletBalance, setModalMessage, setModalType, setShowModal }) => {
    const [orders, setOrders] = useState([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [sellerOrders, setSellerOrders] = useState([]);
    const [customerOrders, setCustomerOrders] = useState([]);

    const [showReceiptInputModal, setShowReceiptInputModal] = useState(false);
    const [currentOrderForReceipt, setCurrentOrderForReceipt] = useState(null);
    const [receiptFile, setReceiptFile] = useState(null);
    const [isSendingReceipt, setIsSendingReceipt] = useState(false);
    const [description, setDescription] = useState("");

    const closeModal = () => {
        setShowModal(false);
        setModalMessage('');
        setModalType('info');
    };

    const fetchAndFilterOrders = async () => {
        if (!wallet) {
            setOrders([]);
            setSellerOrders([]);
            setCustomerOrders([]);
            return;
        }

        setIsLoadingOrders(true);
        setModalMessage("Fetching your orders from the database...");
        setModalType('info');
        setShowModal(true);

        try {
            const fetchedTransactions = await fetchTransactionsFromBackend();
            console.log("Fetched transactions from MongoDB:", fetchedTransactions);

            const filteredSellerOrders = fetchedTransactions.filter(
                (order) => order.sellerWalletAddress && order.sellerWalletAddress.toLowerCase() === wallet.toLowerCase()
            );
            const filteredCustomerOrders = fetchedTransactions.filter(
                (order) => order.customerWalletAddress && order.customerWalletAddress.toLowerCase() === wallet.toLowerCase()
            );

            setOrders(fetchedTransactions);
            setSellerOrders(filteredSellerOrders);
            setCustomerOrders(filteredCustomerOrders);

            setModalMessage("Orders fetched successfully from database!");
            setModalType('success');
        } catch (error) {
            console.error("Error fetching orders from backend:", error);
            setModalMessage(`Failed to fetch orders from database: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            if (setModalMessage) setShowModal(true);
        }
    };

    useEffect(() => {
        fetchAndFilterOrders();
    }, [wallet]);

    const handleConfirmDelivered = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Confirming order delivery on blockchain...");
        setModalType('info');
        setShowModal(true);
        try {
            console.log(`Attempting to confirm delivery for orderId: ${orderId}`);
            const tx = await confirmOrderDelivered(orderId);
            console.log("Transaction sent:", tx.hash);
            await tx.wait();
            console.log("Transaction confirmed on blockchain.");

            setModalMessage("Order delivery confirmed successfully!");
            setModalType('success');

            // Update backend status after blockchain confirmation
            console.log("Updating backend status for orderId:", orderId, "to DELIVERED");
            await updateOrderStatusBackend(orderId, {
                blockchainStatus: 'DELIVERED',
                deliveredAt: new Date().toISOString(),
                confirmedBy: wallet
            });

            console.log("Calling fetchAndFilterOrders to update UI...");
            await fetchAndFilterOrders();
            console.log("UI update process initiated.");

        } catch (error) {
            console.error("Failed to confirm order delivery:", error);
            setModalMessage(`Failed to confirm delivery: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
            console.log("Confirmation process finished.");
        }
    };

    const handleReleaseToSeller = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Releasing funds to seller on blockchain...");
        setModalType('info');
        setShowModal(true);
        try {
            console.log(`Attempting to release funds for orderId: ${orderId}`);
            const tx = await releaseToSeller(orderId);
            console.log("Transaction sent:", tx.hash);
            await tx.wait();
            console.log("Funds released on blockchain.");

            setModalMessage("Funds released to seller successfully!");
            setModalType('success');

            // Update backend status after blockchain confirmation
            console.log("Updating backend status for orderId:", orderId, "to COMPLETE");
            await updateOrderStatusBackend(orderId, {
                blockchainStatus: 'COMPLETE',
                completedAt: new Date().toISOString(),
                releasedBy: wallet
            });

            console.log("Calling fetchAndFilterOrders to update UI...");
            await fetchAndFilterOrders();
            console.log("UI update process initiated.");

        } catch (error) {
            console.error("Failed to release funds to seller:", error);
            setModalMessage(`Failed to release funds: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
            console.log("Release process finished.");
        }
    };

    const handleCancelTransaction = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Cancelling transaction on blockchain and updating database...");
        setModalType('info');
        setShowModal(true);
        
        try {
            const tx = await cancelTransactionBlockchain(orderId);
            await tx.wait();
            console.log("Transaction cancelled on blockchain for orderId:", orderId);

            const backendResponse = await cancelTransactionBackend(orderId, true, "User cancelled order from frontend");
            console.log("Backend response for cancellation:", backendResponse);

            setModalMessage("Transaction cancelled successfully!");
            setModalType('success');
            await fetchAndFilterOrders();
        } catch (error) {
            console.error("Failed to cancel transaction:", error);
            setModalMessage(`Failed to cancel transaction: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
        }
    };

    const handleOpenSendReceiptModal = (order) => {
        setCurrentOrderForReceipt(order);
        setReceiptFile(null);
        setDescription("");
        setShowReceiptInputModal(true);
    };

    const handleCloseSendReceiptModal = () => {
        setShowReceiptInputModal(false);
        setCurrentOrderForReceipt(null);
        setReceiptFile(null);
        setDescription("");
    };

   const handleSendReceipt = async () => {
    if (!currentOrderForReceipt || !receiptFile) {
        setModalMessage("Order data or receipt file missing.");
        setModalType('error');
        setShowModal(true);
        return;
    }

    setIsSendingReceipt(true);
    setModalMessage("Uploading file to Pinata IPFS...");
    setModalType('info');
    setShowModal(true);

    let customerNftMetadata, sellerNftMetadata;
    try {
        try {
            console.log("Starting file upload to Pinata...");
            console.log("Pinata object:", pinata);
            console.log("File to upload:", receiptFile);

            if (!pinata || !pinata.upload || typeof pinata.upload.public.file !== 'function') {
                throw new Error("Pinata is not properly initialized.");
            }

            // Upload file to IPFS
            const uploadResult = await pinata.upload.public.file(receiptFile);
            const hash = "https://gateway.pinata.cloud/ipfs/" + uploadResult.cid;
            console.log("Image uploaded to IPFS:", hash);

            // Create metadata for CUSTOMER NFT (Receipt)
            const customerMetadata = {
                name: `Receipt - ${currentOrderForReceipt.orderId}`,
                image: hash,
                description: description || 'Digital receipt for order completion - Customer Copy',
                attributes: [
                    {
                        trait_type: "Order ID",
                        value: currentOrderForReceipt.orderId
                    },
                    {
                        trait_type: "Order Fee",
                        value: currentOrderForReceipt.totalAmountETH + " ETH"
                    },
                    {
                        trait_type: "Type",
                        value: "Customer Receipt"
                    },
                    {
                        trait_type: "Seller",
                        value: currentOrderForReceipt.sellerWalletAddress
                    },
                    {
                        trait_type: "Customer", 
                        value: currentOrderForReceipt.customerWalletAddress
                    },
                    {
                        trait_type: "Upload Date",
                        value: new Date().toISOString()
                    }
                ],
                external_url: hash,
                background_color: "0066CC" // Blue for customer
            };

            // Create metadata for SELLER NFT (Sale Certificate)
            const sellerMetadata = {
                name: `Sale Certificate - ${currentOrderForReceipt.orderId}`,
                image: hash,
                description: description || 'Digital certificate for successful sale completion - Seller Copy',
                attributes: [
                    {
                        trait_type: "Order ID",
                        value: currentOrderForReceipt.orderId
                    },
                    {
                        trait_type: "Order Fee",
                        value: currentOrderForReceipt.totalAmountETH + " ETH"
                    },
                    {
                        trait_type: "Type",
                        value: "Seller Certificate"
                    },
                    {
                        trait_type: "Seller",
                        value: currentOrderForReceipt.sellerWalletAddress
                    },
                    {
                        trait_type: "Customer", 
                        value: currentOrderForReceipt.customerWalletAddress
                    },
                    {
                        trait_type: "Upload Date",
                        value: new Date().toISOString()
                    }
                ],
                external_url: hash,
                background_color: "00CC66" // Green for seller
            };

            // Upload both metadata to IPFS
            customerNftMetadata = await pinata.upload.public.json(customerMetadata);
            sellerNftMetadata = await pinata.upload.public.json(sellerMetadata);
            
            console.log("Customer metadata uploaded to IPFS:", customerNftMetadata.cid);
            console.log("Seller metadata uploaded to IPFS:", sellerNftMetadata.cid);

        } catch (error) {
            console.error("Pinata upload error:", error);
            throw new Error(`Failed to upload to Pinata: ${error.message || error.toString()}`);
        }

        setModalMessage("Files uploaded to IPFS. Minting to both customer and seller...");
        setModalType('info');

        // Generate unique token IDs for both NFTs
        const baseTimestamp = Math.floor(Date.now() / 1000);
        const customerTokenId = baseTimestamp;
        const sellerTokenId = baseTimestamp + 1;

        const customerMetadataUri = `https://gateway.pinata.cloud/ipfs/${customerNftMetadata.cid}`;
        const sellerMetadataUri = `https://gateway.pinata.cloud/ipfs/${sellerNftMetadata.cid}`;

        console.log("Starting minting process...");
        console.log("Customer Token ID:", customerTokenId, "URI:", customerMetadataUri);
        console.log("Seller Token ID:", sellerTokenId, "URI:", sellerMetadataUri);

        const tempOrderId = `${currentOrderForReceipt.orderId}_seller_nft`;
        const paymentDeadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        try {
            console.log("Creating temporary escrow..");
            await createEscrow(
                tempOrderId, 
                currentOrderForReceipt.sellerWalletAddress, 
                "0", 
                paymentDeadline
            );
            console.log("Temporary escrow created");
        } catch (escrowError) {
            console.log("Temporary escrow might already exist or creation failed:", escrowError.message);
        }

        console.log("Delivering receipts to customer...");
        const customerTx = await deliverOrder(
            currentOrderForReceipt.orderId, 
            customerTokenId, 
            customerMetadataUri, 
            currentOrderForReceipt.customerWalletAddress
        );
        await customerTx.wait();
        console.log("Customer receipts delivered successfully. Token ID:", customerTokenId);

        console.log("Delivering receipts to seller...");
        try {
            const sellerTx = await deliverOrder(
                tempOrderId, 
                sellerTokenId, 
                sellerMetadataUri, 
                currentOrderForReceipt.sellerWalletAddress
            );
            await sellerTx.wait();
            console.log("Seller receipts delivered successfully. Token ID:", sellerTokenId);
        } catch (sellerNftError) {
            console.error("Failed to deliver receipts to seller:", sellerNftError);
            console.log("Continuing with customer receipts only...");
        }

        setModalMessage("receipt minted successfully! Updating database...");
        setModalType('info');

        try {
            const updateResponse = await updateOrderStatusBackend(currentOrderForReceipt.orderId, {
                blockchainStatus: 'IN_DELIVERY',
                uri: customerMetadataUri,
                tokenId: customerTokenId,
                sellerTokenId: sellerTokenId,
                sellerUri: sellerMetadataUri,
                shippedAt: new Date().toISOString(),
                shippedBy: wallet,
                nftMintedTo: currentOrderForReceipt.customerWalletAddress,
                sellerNftMintedTo: currentOrderForReceipt.sellerWalletAddress
            });

            console.log("Database update response:", updateResponse);

            setModalMessage(`Receipt sent successfully! 
                Customer (Token ID: ${customerTokenId}) → ${currentOrderForReceipt.customerWalletAddress.slice(0,6)}...
                Seller (Token ID: ${sellerTokenId}) → ${currentOrderForReceipt.sellerWalletAddress.slice(0,6)}...
                Status updated to IN_DELIVERY.`);
            setModalType('success');

        } catch (dbError) {
            console.error("Database update failed:", dbError);
            setModalMessage(`database update failed: ${dbError.message}. Please refresh to see current status.`);
            setModalType('warning');
        }

    } catch (error) {
        console.error("An error occurred during receipt handling:", error);
        setModalMessage(`Failed to send receipt: ${error.message || error.toString()}`);
        setModalType('error');
    } finally {
        setIsSendingReceipt(false);
        setShowModal(true); 

        handleCloseSendReceiptModal();
        await fetchAndFilterOrders();
    }
};

    return (
        <div className="container mx-auto p-8 bg-white rounded-2xl shadow-xl min-h-[500px]">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">Daftar Transaksi Anda</h2>

            {!wallet ? (
                <p className="text-gray-500 text-center py-8 text-lg">
                    Silakan hubungkan dompet Anda untuk melihat daftar transaksi.
                </p>
            ) : isLoadingOrders ? (
                <div className="text-center py-8">
                    <p className="text-gray-600 text-lg">Memuat daftar transaksi...</p>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mt-4"></div>
                </div>
            ) : orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8 text-lg">
                    Tidak ada transaksi yang ditemukan untuk dompet ini.
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Seller Orders Section */}
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-green-200">Order Anda Sebagai Penjual ({sellerOrders.length})</h3>
                        {sellerOrders.length === 0 ? (
                            <p className="text-gray-500">Tidak ada order di mana Anda sebagai penjual.</p>
                        ) : (
                            <div className="space-y-4">
                                {sellerOrders.map((order) => (
                                    <div key={order.orderId} className="bg-green-50 p-6 rounded-lg shadow-sm border border-green-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-xl font-semibold text-gray-800 break-words pr-2">Order ID: <span className="text-green-700 text-lg">{order.orderId}</span></h4>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.blockchainStatus === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                                                order.blockchainStatus === 'CANCELED' ? 'bg-red-100 text-red-800' :
                                                    order.blockchainStatus === 'AWAITING_DELIVERY' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-blue-100 text-blue-800'
                                                }`}>
                                                {order.blockchainStatus.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-gray-700">Customer: <span className="font-mono text-sm">{order.customerWalletAddress}</span></p>
                                        <p className="text-gray-700">Total Amount: <span className="font-bold text-green-600">{order.totalAmountETH} ETH</span></p>
                                        <p className="text-gray-700">Items:</p>
                                        <ul className="list-disc list-inside text-gray-600 ml-4 text-sm">
                                            {order.items.map((item, idx) => (
                                                <li key={idx}>{item.name} (Qty: {item.quantity}, Price: {item.price} ETH)</li>
                                            ))}
                                        </ul>
                                        <p className="text-gray-700">Transaction Date: <span className="font-medium">{new Date(order.transactionDate).toLocaleString()}</span></p>

                                        {order.blockchainStatus === 'AWAITING_DELIVERY' && (
                                            <button
                                                onClick={() => handleOpenSendReceiptModal(order)}
                                                className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isSendingReceipt || isLoadingOrders}
                                            >
                                                {isSendingReceipt ? 'Sending...' : 'Kirim Resi'}
                                            </button>
                                        )}
                                        {order.blockchainStatus === 'IN_DELIVERY' && (
                                            <div className="mt-2">
                                                <p className="text-blue-500 text-sm">Menunggu konfirmasi dari pelanggan.</p>
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-1">Receipt (Token ID: {order.tokenId}) telah dikirim ke customer.</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus === 'DELIVERED' && (
                                            <div className="mt-2">
                                                <p className="text-green-500 text-sm">Menunggu pelepasan dana dari pelanggan.</p>
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-1">Receipt (Token ID: {order.tokenId}) berada di wallet customer.</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus === 'AWAITING_PAYMENT' && (
                                            <p className="text-yellow-500 text-sm mt-2">Menunggu pembayaran dari pelanggan.</p>
                                        )}
                                        {order.blockchainStatus === 'COMPLETE' && (
                                            <div className="mt-2">
                                                <p className="text-green-600 text-sm">✅ Transaksi selesai! Dana telah dilepaskan.</p>
                                                {order.uri && (
                                                    <p className="text-green-600 text-sm">Receipt: <a href={order.uri.startsWith('http') ? order.uri : `https://gateway.pinata.cloud/ipfs/${order.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-700">View on IPFS</a></p>
                                                )}
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-1">Receipt (Token ID: {order.tokenId}) tersimpan di wallet customer sebagai bukti transaksi.</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus !== 'CANCELED' && order.blockchainStatus !== 'COMPLETE' && (
                                            <button
                                                onClick={() => handleCancelTransaction(order.orderId)}
                                                className="mt-2 w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isLoadingOrders}
                                            >
                                                Batalkan Transaksi
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Buyer Orders Section */}
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-blue-200">Order Anda Sebagai Pembeli ({customerOrders.length})</h3>
                        {customerOrders.length === 0 ? (
                            <p className="text-gray-500">Tidak ada order di mana Anda sebagai pembeli.</p>
                        ) : (
                            <div className="space-y-4">
                                {customerOrders.map((order) => (
                                    <div key={order.orderId} className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-xl font-semibold text-gray-800 break-words pr-2">Order ID: <span className="text-blue-700 text-lg">{order.orderId}</span></h4>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.blockchainStatus === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                                                order.blockchainStatus === 'CANCELED' ? 'bg-red-100 text-red-800' :
                                                    order.blockchainStatus === 'AWAITING_PAYMENT' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-blue-100 text-blue-800'
                                                }`}>
                                                {order.blockchainStatus.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-gray-700">Seller: <span className="font-mono text-sm">{order.sellerWalletAddress}</span></p>
                                        <p className="text-gray-700">Total Amount: <span className="font-bold text-blue-600">{order.totalAmountETH} ETH</span></p>
                                        <p className="text-gray-700">Items:</p>
                                        <ul className="list-disc list-inside text-gray-600 ml-4 text-sm">
                                            {order.items.map((item, idx) => (
                                                <li key={idx}>{item.name} (Qty: {item.quantity}, Price: {item.price} ETH)</li>
                                            ))}
                                        </ul>
                                        <p className="text-gray-700">Transaction Date: <span className="font-medium">{new Date(order.transactionDate).toLocaleString()}</span></p>
                                        
                                        {order.blockchainStatus === 'IN_DELIVERY' && (
                                            <div className="mt-4">
                                                <button
                                                    onClick={() => handleConfirmDelivered(order.orderId)}
                                                    className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    disabled={isLoadingOrders}
                                                >
                                                    Konfirmasi Diterima
                                                </button>
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-2">Anda telah menerima Receipt (Token ID: {order.tokenId}) di wallet Anda!</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus === 'DELIVERED' && (
                                            <div className="mt-4">
                                                <button
                                                    onClick={() => handleReleaseToSeller(order.orderId)}
                                                    className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    disabled={isLoadingOrders}
                                                >
                                                    Lepaskan Dana
                                                </button>
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-2">Receipt (Token ID: {order.tokenId}) tersimpan di wallet Anda sebagai bukti transaksi.</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus === 'AWAITING_PAYMENT' && (
                                            <p className="text-yellow-500 text-sm mt-2">Menunggu pembayaran Anda. (Pembayaran dilakukan di halaman checkout)</p>
                                        )}
                                        {order.blockchainStatus === 'COMPLETE' && (
                                            <div className="mt-2">
                                                <p className="text-green-600 text-sm">✅ Transaksi selesai! Terima kasih atas pembelian Anda.</p>
                                                {order.uri && (
                                                    <p className="text-green-600 text-sm">Receipt: <a href={order.uri.startsWith('http') ? order.uri : `https://gateway.pinata.cloud/ipfs/${order.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-700">View on IPFS</a></p>
                                                )}
                                                {order.tokenId && (
                                                    <p className="text-green-600 text-xs mt-1">Receipt (Token ID: {order.tokenId}) tersimpan permanen di wallet Anda sebagai bukti pembelian!</p>
                                                )}
                                            </div>
                                        )}
                                        {order.blockchainStatus !== 'CANCELED' && order.blockchainStatus !== 'COMPLETE' && (
                                            <button
                                                onClick={() => handleCancelTransaction(order.orderId)}
                                                className="mt-2 w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isLoadingOrders}
                                            >
                                                Batalkan Transaksi
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal for receipt input */}
            {showReceiptInputModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Kirim Resi untuk Order: <span className="text-blue-600 break-words">{currentOrderForReceipt?.orderId}</span></h3>
                        <p className="text-gray-700 mb-4">Pilih gambar resi (.jpg, .png, .gif):</p>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setReceiptFile(e.target.files[0])}
                            className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isSendingReceipt}
                        />
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Deskripsi <span className="text-blue-600 break-words">{currentOrderForReceipt?.orderId}</span></h3>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Deskripsi pengiriman (opsional)"
                            className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isSendingReceipt}
                        />
                        {receiptFile && <p className="text-sm text-gray-600 mb-4">File terpilih: {receiptFile.name}</p>}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-yellow-800">
                                <strong>📝</strong> Mohon masukkan resi.
                            </p>
                        </div>
                        <div className="flex justify-end gap-4">
                            <button
                                onClick={handleCloseSendReceiptModal}
                                className="bg-gray-300 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors duration-300"
                                disabled={isSendingReceipt}
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSendReceipt}
                                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isSendingReceipt || !receiptFile}
                            >
                                {isSendingReceipt ? 'Mengirim Resi...' : 'Kirim Resi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderListPage;