import React, { useState, useEffect } from 'react';
import * as ethers from "ethers";
import { BrowserProvider } from "ethers"; 

import {
    connectWallet,
    uploadMetadataToPinata,
    getEscrow,
    deliverOrder,
    confirmOrderDelivered,
    releaseToSeller,
    cancelTransactionBlockchain,
    cancelTransactionBackend,
    fetchTransactionsFromBackend
} from '/src/connect.js';

/**
 * OrderListPage component to display user transaction/order list.
 * Uses `setModalMessage`, `setModalType`, `setShowModal` props from App.jsx
 * to display modal notifications.
 */
const OrderListPage = ({ wallet, walletBalance, setModalMessage, setModalType, setShowModal }) => {
    const [orders, setOrders] = useState([]); // This will store all fetched transactions from MongoDB
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [sellerOrders, setSellerOrders] = useState([]);
    const [customerOrders, setCustomerOrders] = useState([]);

    const [showReceiptInputModal, setShowReceiptInputModal] = useState(false);
    const [currentOrderForReceipt, setCurrentOrderForReceipt] = useState(null);
    const [receiptFile, setReceiptFile] = useState(null);
    const [isSendingReceipt, setIsSendingReceipt] = useState(false);

    const closeModal = () => {
        setShowModal(false);
        setModalMessage('');
        setModalType('info');
    };

    // Function to load orders from MongoDB backend
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
            const fetchedTransactions = await fetchTransactionsFromBackend(); // Fetch from MongoDB backend
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

    // Use this effect to fetch orders from MongoDB when the wallet changes or component mounts
    useEffect(() => {
        fetchAndFilterOrders();
    }, [wallet]);

    // Functions to handle blockchain interactions (confirm, release, cancel)
    // These functions should call the respective contract functions from connect.js
    // and then re-fetch orders from the backend to update the UI.

    const handleConfirmDelivered = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Confirming order delivery on blockchain...");
        setModalType('info');
        setShowModal(true);
        try {
            const tx = await confirmOrderDelivered(orderId);
            await tx.wait();
            setModalMessage("Order delivery confirmed successfully!");
            setModalType('success');
            await fetchAndFilterOrders(); // Re-fetch from MongoDB to update status
        } catch (error) {
            console.error("Failed to confirm order delivery:", error);
            setModalMessage(`Failed to confirm delivery: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
        }
    };


    const handleReleaseToSeller = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Releasing funds to seller on blockchain...");
        setModalType('info');
        setShowModal(true);
        try {
            const tx = await releaseToSeller(orderId);
            await tx.wait();
            setModalMessage("Funds released to seller successfully!");
            setModalType('success');
            await fetchAndFilterOrders(); // Re-fetch from MongoDB to update status
        } catch (error) {
            console.error("Failed to release funds to seller:", error);
            setModalMessage(`Failed to release funds: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
        }
    };

    const handleCancelTransaction = async (orderId) => {
        setIsLoadingOrders(true);
        setModalMessage("Cancelling transaction on blockchain and updating database...");
        setModalType('info');
        setShowModal(true);
        try {
            // 1. Call smart contract to cancel the transaction on blockchain
            const tx = await cancelTransactionBlockchain(orderId);
            await tx.wait();
            console.log("Transaction cancelled on blockchain for orderId:", orderId);

            // 2. Call backend API to update/delete transaction in MongoDB
            const backendResponse = await cancelTransactionBackend(orderId, true, "User cancelled order from frontend");
            console.log("Backend response for cancellation:", backendResponse);

            setModalMessage("Transaction cancelled successfully!");
            setModalType('success');
            await fetchAndFilterOrders(); // Re-fetch from MongoDB to update status
        } catch (error) {
            console.error("Failed to cancel transaction:", error);
            setModalMessage(`Failed to cancel transaction: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true);
        }
    };


    // Function to open receipt submission modal
    const handleOpenSendReceiptModal = (order) => {
        setCurrentOrderForReceipt(order);
        setReceiptFile(null); // Reset input file
        setShowReceiptInputModal(true);
    };

    // Function to close receipt submission modal
    const handleCloseSendReceiptModal = () => {
        setShowReceiptInputModal(false);
        setCurrentOrderForReceipt(null);
        setReceiptFile(null);
    };

    // Function to send receipt (calls deliverOrder)
    const handleSendReceipt = async () => {
        if (!currentOrderForReceipt || !receiptFile) {
            setModalMessage("Order data or receipt file missing.");
            setModalType('error');
            setShowModal(true);
            return;
        }

        setIsSendingReceipt(true);
        setModalMessage("Uploading file to Pinata IPFS via backend...");
        setModalType('info');
        setShowModal(true);

        try {
            const reader = new FileReader();
            reader.readAsArrayBuffer(receiptFile); // Read file as ArrayBuffer

            reader.onloadend = async () => {
                const uint8Array = new Uint8Array(reader.result); // Konversi ArrayBuffer ke Uint8Array
                
                // Mulai perbaikan: Gunakan metode browser asli untuk base64 encoding
                let binaryString = '';
                uint8Array.forEach(byte => {
                    binaryString += String.fromCharCode(byte);
                });
                const base64String = btoa(binaryString); 

                const metadata = {
                    orderId: currentOrderForReceipt.orderId, 
                    fileName: receiptFile.name,
                    fileType: receiptFile.type,
                    fileData: base64String 
                };

                const ipfsHash = await uploadMetadataToPinata(metadata);
                const hashUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
                console.log("IPFS Hash (from backend):", ipfsHash);
                console.log("Full IPFS URL:", hashUrl);


                setModalMessage("File uploaded to IPFS. Sending transaction to blockchain...");
                setModalType('info');

                const tokenId = currentOrderForReceipt.tokenId || Math.floor(Date.now() / 1000); // Menggunakan tokenId yang sudah ada atau membuat yang baru
                const tx = await deliverOrder(currentOrderForReceipt.orderId, tokenId, hashUrl); // Gunakan orderId dari backend
                await tx.wait();

                setModalMessage(`Receipt sent successfully for Order ID: ${currentOrderForReceipt.orderId}! Status updated.`);
                setModalType('success');
                handleCloseSendReceiptModal();
                await fetchAndFilterOrders(); // Re-fetch orders from MongoDB to update status
            };

            reader.onerror = (error) => {
                throw new Error("Error reading file: " + error.target.error);
            };

        } catch (error) {
            console.error("Failed to send receipt:", error);
            setModalMessage(`Failed to send receipt: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsSendingReceipt(false);
            setShowModal(true);
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
                    <p className="text-gray-60-text-lg">Memuat daftar transaksi...</p>
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
                                            <p className="text-blue-500 text-sm mt-2">Menunggu konfirmasi dari pelanggan.</p>
                                        )}
                                        {order.blockchainStatus === 'DELIVERED' && (
                                            <p className="text-green-500 text-sm mt-2">Menunggu pelepasan dana dari pelanggan.</p>
                                        )}
                                        {order.blockchainStatus === 'AWAITING_PAYMENT' && (
                                            <p className="text-yellow-500 text-sm mt-2">Menunggu pembayaran dari pelanggan.</p>
                                        )}
                                        {order.blockchainStatus === 'COMPLETE' && order.uri && (
                                            <p className="text-green-600 text-sm mt-2">Receipt: <a href={order.uri.startsWith('http') ? order.uri : `https://gateway.pinata.cloud/ipfs/${order.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-700">View on IPFS</a></p>
                                        )}
                                        {order.blockchainStatus !== 'CANCELED' && order.blockchainStatus !== 'COMPLETE' && (
                                            <button
                                                onClick={() => handleCancelTransaction(order.orderId)}
                                                className="mt-2 w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isSendingReceipt || isLoadingOrders}
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
                        <h3 className="2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-blue-200">Order Anda Sebagai Pembeli ({customerOrders.length})</h3>
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
                                            <button
                                                onClick={() => handleConfirmDelivered(order.orderId)}
                                                className="mt-4 w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isLoadingOrders}
                                            >
                                                Konfirmasi Diterima
                                            </button>
                                        )}
                                        {order.blockchainStatus === 'DELIVERED' && (
                                            <button
                                                onClick={() => handleReleaseToSeller(order.orderId)}
                                                className="mt-4 w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isLoadingOrders}
                                            >
                                                Lepaskan Dana
                                            </button>
                                        )}
                                        {order.blockchainStatus === 'AWAITING_PAYMENT' && (
                                            <p className="text-yellow-500 text-sm mt-2">Menunggu pembayaran Anda. (Pembayaran dilakukan di halaman checkout)</p>
                                        )}
                                           {order.blockchainStatus === 'COMPLETE' && order.uri && (
                                                <p className="text-green-600 text-sm mt-2">Receipt: <a href={order.uri.startsWith('http') ? order.uri : `https://gateway.pinata.cloud/ipfs/${order.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-700">View on IPFS</a></p>
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
                        {receiptFile && <p className="text-sm text-gray-600 mb-4">File terpilih: {receiptFile.name}</p>}
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
                                {isSendingReceipt ? 'Mengirim...' : 'Kirim Resi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const uploadToPinata = async (file) => {
  const reader = new FileReader();

  reader.onloadend = async () => {
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${your_pinata_jwt}`,
      },
      body: createFormData(file)
    });

    const json = await res.json();
    console.log("Image IPFS Hash:", json.IpfsHash);
  };

  reader.readAsArrayBuffer(file); 
};

function createFormData(file) {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}
export default OrderListPage;
