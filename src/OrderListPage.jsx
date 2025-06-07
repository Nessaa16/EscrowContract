import React, { useState, useEffect } from 'react';
// import { ethers, BrowserProvider } from "ethers"; 

import {
    connectWallet, 
    uploadMetadataToPinata, 
    getEscrow, 
    deliverOrder 
} from '/src/connect.js';

/**
 * Komponen OrderListPage untuk menampilkan daftar transaksi/order pengguna.
 * Menggunakan prop `setModalMessage`, `setModalType`, `setShowModal` dari App.jsx
 * untuk menampilkan notifikasi modal.
 */
const OrderListPage = ({ wallet, walletBalance, setModalMessage, setModalType, setShowModal }) => {
    const [orders, setOrders] = useState([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [sellerOrders, setSellerOrders] = useState([]);
    const [customerOrders, setCustomerOrders] = useState([]);

    // State untuk pop-up pengiriman resi
    const [showReceiptInputModal, setShowReceiptInputModal] = useState(false);
    const [currentOrderForReceipt, setCurrentOrderForReceipt] = useState(null);
    const [receiptFile, setReceiptFile] = useState(null);
    const [isSendingReceipt, setIsSendingReceipt] = useState(false);


    // Fungsi untuk menutup modal yang dikelola oleh App.jsx
    const closeModal = () => {
        setShowModal(false);
        setModalMessage('');
        setModalType('info');
    };

    // Fungsi untuk memuat order dari blockchain
    const fetchUserOrders = async () => {
        if (!wallet) {
            setOrders([]);
            setSellerOrders([]);
            setCustomerOrders([]);
            return;
        }

        setIsLoadingOrders(true);
        setModalMessage("Fetching your orders...");
        setModalType('info');
        setShowModal(true); // Tampilkan modal loading

        try {
            // --- SIMULASI PENGAMBILAN ORDER ID ---
            // Dalam aplikasi nyata, Anda akan memiliki cara untuk mendapatkan daftar orderId
            // yang terkait dengan 'wallet' ini.
            // Anda perlu menyimpan orderId yang baru dibuat di Local Storage setelah checkout
            // atau menggunakan sistem indeksasi off-chain (misalnya Firestore) yang mendengarkan event kontrak.
            const dummyOrderIds = [
                `order_1749118541`, // Contoh orderId yang mungkin sudah ada di blockchain
                `order_1749118417`,
                // Tambahkan orderId yang baru saja Anda buat melalui halaman checkout
                // Contoh: `order_1717616616789_3944`, // Jika Anda menyimpan orderId ini setelah checkout, ia akan diambil di sini
            ];

            // Opsional: Ambil orderId yang mungkin disimpan di Local Storage setelah checkout
            const storedOrderIds = JSON.parse(localStorage.getItem('myOrderIds') || '[]');
            const allOrderIdsToFetch = [...new Set([...dummyOrderIds, ...storedOrderIds])]; // Gabungkan dan hapus duplikat

            const fetchedOrders = [];
            for (const orderId of allOrderIdsToFetch) {
                try {
                    const orderData = await getEscrow(orderId); // getEscrow is from connect.js
                    // Hanya tambahkan order jika customer atau seller cocok dengan dompet yang terhubung.
                    if (orderData.customer.toLowerCase() === wallet.toLowerCase() || orderData.seller.toLowerCase() === wallet.toLowerCase()) {
                        fetchedOrders.push({ id: orderId, ...orderData });
                    }
                } catch (error) {
                    // Ini normal jika orderId dummy tidak ada di blockchain atau belum dikonfirmasi.
                    console.warn(`Could not fetch order ${orderId}:`, error.message);
                }
            }

            // Filter order menjadi sellerOrders dan customerOrders
            const filteredSellerOrders = fetchedOrders.filter(order => order.seller.toLowerCase() === wallet.toLowerCase());
            const filteredCustomerOrders = fetchedOrders.filter(order => order.customer.toLowerCase() === wallet.toLowerCase());

            setOrders(fetchedOrders); // Simpan semua order yang berhasil diambil
            setSellerOrders(filteredSellerOrders);
            setCustomerOrders(filteredCustomerOrders);

            setModalMessage("Orders fetched successfully!");
            setModalType('success');
        } catch (error) {
            console.error("Error fetching orders:", error);
            setModalMessage(`Failed to fetch orders: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsLoadingOrders(false);
            setShowModal(true); // Ensure modal is displayed for final status
        }
    };

    useEffect(() => {
        fetchUserOrders();
    }, [wallet]); // Ambil order setiap kali alamat dompet berubah

    // Fungsi untuk membuka modal pengiriman resi
    const handleOpenSendReceiptModal = (order) => {
        setCurrentOrderForReceipt(order);
        setReceiptFile(null); // Reset input file
        setShowReceiptInputModal(true);
    };

    // Fungsi untuk menutup modal pengiriman resi
    const handleCloseSendReceiptModal = () => {
        setShowReceiptInputModal(false);
        setCurrentOrderForReceipt(null);
        setReceiptFile(null);
    };

    // Fungsi untuk mengirim resi (memanggil deliverOrder)
    const handleSendReceipt = async () => {
        if (!currentOrderForReceipt || !receiptFile) {
            setModalMessage("Order data or receipt file missing.");
            setModalType('error');
            setShowModal(true);
            return;
        }

        setIsSendingReceipt(true);
        setModalMessage("Uploading file to Pinata IPFS via backend..."); // Updated message
        setModalType('info');
        setShowModal(true);

        try {
            // Mengunggah file ke Pinata melalui backend
            // Anda perlu membaca file sebagai ArrayBuffer atau serupa untuk dikirim melalui fetch
            // Atau, jika Pinata SDK backend endpoint mendukung FormData, Anda bisa mengirim file langsung.
            // Untuk JSON upload, Anda perlu mengonversi file menjadi base64 atau URL object jika ingin mengirim gambar.
            // Saat ini, backend kita hanya menerima JSON.
            // Jika receiptFile adalah gambar, Anda harus mengubahnya menjadi format JSON-serializable
            // (misalnya base64 string) dan mengirimnya ke backend.

            // Contoh sederhana: Mengirim nama file sebagai URI, ini hanya placeholder.
            // Untuk upload gambar sebenarnya, Anda perlu mengonversi receiptFile ke format yang bisa dikirim.
            // Misalnya: const reader = new FileReader(); reader.readAsDataURL(receiptFile);
            // Lalu kirim hasilnya ke backend sebagai bagian dari jsonContent.

            // Untuk contoh ini, kita asumsikan kita mengirim objek dengan nama file dan semacam "tipe"
            // Backend Pinata API (pinJSONToIPFS) mengharapkan JSON. Jika Anda ingin mengunggah file gambar,
            // Anda perlu menggunakan `pinFileToIPFS` di backend, dan frontend harus mengirim file sebagai FormData.
            // Untuk sementara, mari kita kirim metadata sederhana atau nama file.

            const metadata = {
                orderId: currentOrderForReceipt.id,
                fileName: receiptFile.name,
                fileType: receiptFile.type,
                // Dalam implementasi nyata, Anda akan mengonversi file ke base64
                // atau mengirimnya sebagai FormData jika backend Anda mendukungnya.
                // receiptData: await fileToBase64(receiptFile) // Misalnya
            };

            // Call the new function that communicates with your backend
            const ipfsHash = await uploadMetadataToPinata(metadata); // This calls your backend
            const hashUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`; // Construct the full URL
            console.log("IPFS Hash (from backend):", ipfsHash);
            console.log("Full IPFS URL:", hashUrl);


            setModalMessage("File uploaded to IPFS. Sending transaction to blockchain...");
            setModalType('info');

            const tokenId = Math.floor(Date.now() / 1000); // tokenId bisa berupa timestamp atau ID unik lainnya
            const tx = await deliverOrder(currentOrderForReceipt.id, tokenId, hashUrl); // deliverOrder is from connect.js
            await tx.wait(); // Tunggu transaksi dikonfirmasi

            setModalMessage(`Receipt sent successfully for Order ID: ${currentOrderForReceipt.id}! Status updated.`);
            setModalType('success');
            handleCloseSendReceiptModal(); // Tutup modal input resi
            fetchUserOrders(); // Muat ulang order untuk memperbarui status
        } catch (error) {
            console.error("Failed to send receipt:", error);
            setModalMessage(`Failed to send receipt: ${error.message || error.toString()}`);
            setModalType('error');
        } finally {
            setIsSendingReceipt(false);
            setShowModal(true); // Pastikan modal tetap tampil dengan status akhir
        }
    };

    // Helper function to convert file to base64 (if your backend needs base64 for image)
    // You would integrate this into handleSendReceipt if needed.
    // function fileToBase64(file) {
    //     return new Promise((resolve, reject) => {
    //         const reader = new FileReader();
    //         reader.readAsDataURL(file);
    //         reader.onload = () => resolve(reader.result);
    //         reader.onerror = error => reject(error);
    //     });
    // }


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
                    {/* Bagian Order Sebagai Penjual */}
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-green-200">Order Anda Sebagai Penjual ({sellerOrders.length})</h3>
                        {sellerOrders.length === 0 ? (
                            <p className="text-gray-500">Tidak ada order di mana Anda sebagai penjual.</p>
                        ) : (
                            <div className="space-y-4">
                                {sellerOrders.map((order) => (
                                    <div key={order.id} className="bg-green-50 p-6 rounded-lg shadow-sm border border-green-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-xl font-semibold text-gray-800 break-words pr-2">Order ID: <span className="text-green-700 text-lg">{order.id}</span></h4>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.status === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                                                order.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                                                    order.status === 'AWAITING_DELIVERY' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-blue-100 text-blue-800'
                                                }`}>
                                                {order.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-gray-700">Customer: <span className="font-mono text-sm">{order.customer}</span></p>
                                        <p className="text-gray-700">Fee: <span className="font-bold text-green-600">{order.orderFee} ETH</span></p>
                                        <p className="text-gray-700">Funds Deposited: <span className="font-medium">{order.fundsDeposited ? 'Yes' : 'No'}</span></p>

                                        {order.status === 'AWAITING_DELIVERY' && (
                                            <button
                                                onClick={() => handleOpenSendReceiptModal(order)}
                                                className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={isSendingReceipt}
                                            >
                                                {isSendingReceipt ? 'Sending...' : 'Kirim Resi'}
                                            </button>
                                        )}
                                        {order.status === 'IN_DELIVERY' && (
                                            <p className="text-blue-500 text-sm mt-2">Menunggu konfirmasi dari pelanggan.</p>
                                        )}
                                        {order.status === 'DELIVERED' && (
                                            <p className="text-green-500 text-sm mt-2">Menunggu pelepasan dana dari pelanggan.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bagian Order Sebagai Pembeli */}
                    <div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 border-blue-200">Order Anda Sebagai Pembeli ({customerOrders.length})</h3>
                        {customerOrders.length === 0 ? (
                            <p className="text-gray-500">Tidak ada order di mana Anda sebagai pembeli.</p>
                        ) : (
                            <div className="space-y-4">
                                {customerOrders.map((order) => (
                                    <div key={order.id} className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-xl font-semibold text-gray-800 break-words pr-2">Order ID: <span className="text-blue-700 text-lg">{order.id}</span></h4>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.status === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                                                order.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                                                    order.status === 'AWAITING_PAYMENT' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-blue-100 text-blue-800'
                                                }`}>
                                                {order.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-gray-700">Seller: <span className="font-mono text-sm">{order.seller}</span></p>
                                        <p className="text-gray-700">Fee: <span className="font-bold text-blue-600">{order.orderFee} ETH</span></p>
                                        <p className="text-gray-700">Payment Deadline: <span className="font-medium">{new Date(order.paymentDeadline * 1000).toLocaleString()}</span></p>
                                        <p className="text-gray-700">Funds Deposited: <span className="font-medium">{order.fundsDeposited ? 'Yes' : 'No'}</span></p>

                                        {/* Tombol Aksi Pembeli */}
                                        {order.status === 'IN_DELIVERY' && (
                                            <button
                                                onClick={() => { /* Implement confirmOrderDelivered here */ setModalMessage(`Konfirmasi pengiriman untuk ${order.id}`); setModalType('info'); setShowModal(true); }}
                                                className="mt-4 w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors duration-300"
                                            >
                                                Konfirmasi Diterima
                                            </button>
                                        )}
                                        {order.status === 'DELIVERED' && (
                                            <button
                                                onClick={() => { /* Implement releaseToSeller here */ setModalMessage(`Lepaskan dana ke penjual untuk ${order.id}`); setModalType('info'); setShowModal(true); }}
                                                className="mt-4 w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition-colors duration-300"
                                            >
                                                Lepaskan Dana
                                            </button>
                                        )}
                                        {order.status === 'AWAITING_PAYMENT' && (
                                            <p className="text-yellow-500 text-sm mt-2">Menunggu pembayaran Anda.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal untuk input resi pengiriman */}
            {showReceiptInputModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Kirim Resi untuk Order: <span className="text-blue-600 break-words">{currentOrderForReceipt?.id}</span></h3>
                        <p className="text-gray-700 mb-4">Pilih gambar resi (.jpg, .png, .gif):</p>
                        <input
                            type="file"
                            accept="image/*" // Hanya menerima file gambar
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
                                disabled={isSendingReceipt || !receiptFile} // Nonaktifkan jika tidak ada file
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

export default OrderListPage;