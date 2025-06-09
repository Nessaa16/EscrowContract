import React from 'react';
import { ethers, BrowserProvider } from "ethers";

// Import functions from your connect.js file
import {
    createEscrow,
    payEscrow,
} from './connect'; 

/**
 * Komponen CheckoutPage untuk menampilkan ringkasan pesanan dan konfirmasi checkout.
 * Menerima props yang diperlukan dari App.jsx.
 */
const CheckoutPage = ({
    cartItems,
    total,
    address, // Ini adalah alamat dompet yang terhubung (string)
    isLoading,
    setIsLoading,
    walletBalance,
    setModalMessage,
    setModalType,
    setShowModal,
    onBackToCart,
    onCheckoutSuccess,
}) => {

    /**
     * Fungsi untuk menangani proses konfirmasi checkout dan interaksi dengan smart contract.
     */
    const handleConfirmCheckout = async () => {
        if (!address) { // Cek apakah alamat dompet sudah tersedia
            setModalMessage("Please connect your wallet first.");
            setModalType('info');
            setShowModal(true);
            return;
        }

        if (cartItems.length === 0) {
            setModalMessage("Your cart is empty. Nothing to checkout.");
            setModalType('info');
            setShowModal(true);
            return;
        }

        // Periksa apakah saldo cukup
        if (walletBalance !== null && parseFloat(walletBalance) < total) {
            setModalMessage(`Insufficient balance. You need ${total.toFixed(4)} ETH but have ${parseFloat(walletBalance).toFixed(4)} ETH.`);
            setModalType('error');
            setShowModal(true);
            return;
        }

        setIsLoading(true);
        setModalMessage("Initiating blockchain transaction...");
        setModalType('info');
        setShowModal(true);

        try {
            // Dapatkan alamat signer yang sebenarnya dari window.ethereum
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const signerAddress = await signer.getAddress(); // Alamat yang akan menandatangani transaksi

            // Hasilkan ID order unik (misalnya, timestamp + angka acak)
            const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            // Atur batas waktu pembayaran 7 menit dari sekarang (dalam detik)
            const paymentDeadline = Math.floor(Date.now() / 1000) + (7 * 60);

            // Konversi total harga dari ETH (number) ke Wei (BigInt) untuk interaksi kontrak
            const amountInWei = ethers.parseEther(total.toString());

            // Langkah 1: Buat Escrow (mensimulasikan tindakan penjual untuk tujuan demo)
            setModalMessage("Creating escrow on blockchain...");
            // Gunakan signerAddress sebagai customer untuk memastikan konsistensi
            const createEscrowTx = await createEscrow(orderId, signerAddress, amountInWei, paymentDeadline);
            console.log("Create Escrow Tx:", createEscrowTx);
            await createEscrowTx.wait(); // Pastikan transaksi createEscrow dikonfirmasi
            console.log("Escrow created successfully and confirmed for orderId:", orderId);

            // Langkah 2: Bayar Escrow (tindakan customer)
            setModalMessage("Depositing funds to escrow...");
            // payEscrow akan menggunakan signerAddress secara internal melalui ethContract()
            const payEscrowTx = await payEscrow(orderId, amountInWei);
            console.log("Pay Escrow Tx:", payEscrowTx);
            await payEscrowTx.wait(); // Tunggu transaksi pembayaran dikonfirmasi juga

            // 🚨 FIXED: Save transaction to backend MongoDB 🚨
            console.log("Saving transaction data to backend...");
            setModalMessage("Saving transaction data to database...");
            setModalType('info');
            setShowModal(true);

            try {
                // More robust data preparation
                const transactionData = {
                    orderId: orderId,
                    customerWalletAddress: signerAddress,
                    sellerWalletAddress: address, 
                    items: cartItems.map(item => ({
                        id: item.id || `item_${Date.now()}_${Math.random()}`, // Add the missing id field
                        name: String(item.name || ''),
                        quantity: parseInt(item.quantity) || 1,
                        price: parseFloat(item.price) || 0,
                    })),
                    totalAmountETH: parseFloat(total) || 0,
                    blockchainStatus: 'AWAITING_DELIVERY', 
                    transactionDate: new Date().toISOString() // Use ISO string for better compatibility
                };

                console.log("=== TRANSACTION DATA DEBUG ===");
                console.log("Original cartItems:", cartItems);
                console.log("Original total:", total);
                console.log("Processed transaction data:", JSON.stringify(transactionData, null, 2));

                // Get the base URL dynamically
                const baseUrl = window.location.origin;
                const apiUrl = `${baseUrl}/api/transactions`;
                
                console.log("API URL:", apiUrl);
                console.log("Making POST request...");

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(transactionData),
                });

                console.log("=== RESPONSE DEBUG ===");
                console.log("Response status:", response.status);
                console.log("Response statusText:", response.statusText);
                console.log("Response ok:", response.ok);
                
                // Get response body as text first
                const responseText = await response.text();
                console.log("Raw response body:", responseText);

                // Check if response is OK
                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    
                    try {
                        // Try to parse as JSON if it looks like JSON
                        if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
                            const jsonError = JSON.parse(responseText);
                            console.log("Parsed error JSON:", jsonError);
                            errorMessage = jsonError.error || jsonError.message || jsonError.details || errorMessage;
                        } else {
                            errorMessage = responseText || errorMessage;
                        }
                    } catch (parseError) {
                        console.error("Error parsing error response:", parseError);
                        errorMessage = responseText || errorMessage;
                    }
                    
                    console.error("Final error message:", errorMessage);
                    throw new Error(errorMessage);
                }

                // Parse successful response
                let savedData;
                try {
                    // Try to parse the response text as JSON
                    savedData = JSON.parse(responseText);
                    console.log("Transaction data successfully sent to backend and saved:", savedData);
                } catch (parseError) {
                    console.log("Response is not JSON, using text response:", responseText);
                    savedData = { message: responseText };
                }
                
                // Show success message
                setModalMessage(`Checkout successful! Order ID: ${orderId}. Transaction confirmed and saved to database.`);
                setModalType('success');
                setShowModal(true);
                
                // Call success callback
                onCheckoutSuccess();

            } catch (dbError) {
                console.error("Error saving transaction data to database:", dbError);
                console.error("Full error object:", dbError);
                
                setModalMessage(`Checkout successful on blockchain, but FAILED to save data to database: ${dbError.message || dbError.toString()}`);
                setModalType('error'); 
                setShowModal(true);
            }

        } catch (error) {
            console.error("Checkout failed:", error);
            setModalMessage(`Checkout failed: ${error.message || error.toString()}`);
            setModalType('error');
            setShowModal(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-8 bg-white rounded-2xl shadow-xl">
            <h2 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">Konfirmasi Pesanan Anda</h2>

            <div className="mb-8">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-blue-200">Ringkasan Pesanan</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {cartItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg shadow-sm">
                            <div className="flex items-center">
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="w-12 h-12 object-cover rounded-md mr-3"
                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/80x80/D0D0D0/555555?text=No+Image'; }}
                                />
                                <div>
                                    <p className="text-lg font-medium text-gray-800">{item.name}</p>
                                    <p className="text-gray-600 text-sm">Kuantitas: {item.quantity}</p>
                                </div>
                            </div>
                            <p className="text-blue-600 font-semibold">{(item.price * item.quantity).toFixed(4)} ETH</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t-2 border-blue-200 pt-6 mt-6">
                <p className="text-3xl font-bold text-gray-900 flex justify-between items-center mb-6">
                    Total Pembayaran:
                    <span className="text-blue-700">{total.toFixed(4)} ETH</span>
                </p>

                <button
                    onClick={handleConfirmCheckout}
                    className="w-full bg-green-600 text-white py-4 rounded-lg text-xl font-semibold hover:bg-green-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    disabled={isLoading || !address || cartItems.length === 0 || (walletBalance !== null && parseFloat(walletBalance) < total)}
                >
                    {isLoading ? 'Memproses Pesanan...' : 'Konfirmasi Checkout'}
                </button>
                <button
                    onClick={onBackToCart}
                    className="w-full bg-gray-300 text-gray-800 py-3 rounded-lg text-lg font-semibold hover:bg-gray-400 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                >
                    Kembali ke Keranjang
                </button>
            </div>
        </div>
    );
};

export default CheckoutPage;