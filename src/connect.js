import { BrowserProvider, Contract, JsonRpcProvider, ethers } from "ethers";
import abi from "./abi.json" 

const address = "0x5d0EeDC820CDafbEC7bc8458C8ceE8409FDaCC20"; // Alamat kontrak Anda
const url = "https://ethereum-holesky-rpc.publicnode.com/"; // URL RPC Holesky


/**
 * Fungsi untuk menghubungkan dompet ke DApp dan mendapatkan alamat akun pertama.
 * Memerlukan 'ethereum' object (misalnya dari MetaMask).
 * @returns {Promise<string|undefined>} Alamat akun yang terhubung atau undefined jika gagal.
 */
export async function connectWallet() {
    try {
        // Memastikan window.ethereum (penyedia dompet Web3) tersedia
        if (!window.ethereum) {
            alert("Please install a Web3 wallet (e.g., MetaMask) to connect!");
            return;
        }

        // Meminta akun dari dompet yang terhubung
        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
        });

        // Memeriksa apakah ada akun yang terhubung
        if (!accounts || accounts.length === 0) {
            alert("No accounts connected! Please connect a wallet!");
            return;
        }

        // Mengembalikan alamat akun pertama yang terhubung
        return accounts[0];
    } catch (error) {
        console.error("Error connecting wallet:", error.message);
        alert(`Failed to connect wallet: ${error.message}`);
        return;
    }
}


/**
 * Menghubungkan ke kontrak menggunakan dompet (untuk menandatangani transaksi).
 * Fungsi ini secara internal akan menggunakan window.ethereum.
 * @returns {Promise<Contract>} Instance kontrak ethers.js yang terhubung dengan signer.
 */
async function ethContract() {
    // Membuat BrowserProvider dari window.ethereum
    const browser = new BrowserProvider(window.ethereum);
    // Mendapatkan signer (akun pengguna) untuk mengirim transaksi
    const user = await browser.getSigner();
    // Membuat instance Contract dengan alamat kontrak, ABI, dan signer
    const contract = new Contract(address, abi, user);
    return contract;
}

/**
 * Menghubungkan ke kontrak tanpa dompet (untuk operasi read-only).
 * @returns {Promise<Contract>} Instance kontrak ethers.js yang terhubung dengan provider.
 */
async function ethWithoutWallet() {
    // Membuat JsonRpcProvider untuk terhubung ke URL RPC blockchain
    const browser = new JsonRpcProvider(url);
    // Membuat instance Contract dengan alamat kontrak, ABI, dan provider
    const contract = new Contract(address, abi, browser);
    return contract;
}

/**
 * Membuat escrow baru. Hanya seller yang dapat memanggil fungsi ini.
 * @param {string} orderId - ID unik untuk order.
 * @param {string} customer - Alamat customer.
 * @param {string} orderFee - Biaya order dalam wei (sebagai string atau BigInt).
 * @param {number} paymentDeadline - Batas waktu pembayaran sebagai Unix timestamp (detik).
 * @returns {Promise<any>} Response transaksi.
 */
export async function createEscrow(orderId, customer, orderFee, paymentDeadline) {
    const contract = await ethContract(); // ethContract sudah menggunakan window.ethereum
    const tx = await contract.createEscrow(orderId, customer, orderFee, paymentDeadline);
    return tx; // Mengembalikan objek transaksi agar bisa menunggu konfirmasinya
}

/**
 * Memungkinkan customer untuk membayar biaya escrow.
 * @param {string} orderId - ID order yang akan dibayar.
 * @param {string} amountInWei - Jumlah yang akan dibayar, dalam wei (harus cocok dengan orderFee).
 * @returns {Promise<any>} Response transaksi.
 */
export async function payEscrow(orderId, amountInWei) {
    const contract = await ethContract(); // ethContract sudah menggunakan window.ethereum
    const tx = await contract.payEscrow(orderId, { value: amountInWei });
    return tx;
}

/**
 * Memungkinkan seller untuk mengirimkan order dan mencetak NFT.
 * @param {string} orderId - ID order.
 * @param {number} tokenId - ID unik untuk NFT.
 * @param {string} uri - URI untuk metadata NFT.
 * @returns {Promise<any>} Response transaksi.
 */
export async function deliverOrder(orderId, tokenId, uri) {
    const contract = await ethContract();
    const tx = await contract.deliverOrder(orderId, tokenId, uri);
    return tx;
}

/**
 * Memungkinkan customer untuk mengkonfirmasi bahwa order telah dikirim.
 * @param {string} orderId - ID order.
 * @returns {Promise<any>} Response transaksi.
 */
export async function confirmOrderDelivered(orderId) {
    const contract = await ethContract();
    const tx = await contract.confirmOrderDelivered(orderId);
    return tx;
}

/**
 * Memungkinkan customer untuk melepaskan dana ke seller setelah konfirmasi pengiriman.
 * @param {string} orderId - ID order.
 * @returns {Promise<any>} Response transaksi.
 */
export async function releaseToSeller(orderId) {
    const contract = await ethContract();
    const tx = await contract.releaseToSeller(orderId);
    return tx;
}

/**
 * Memungkinkan customer atau seller untuk membatalkan transaksi dalam kondisi tertentu.
 * @param {string} orderId - ID order.
 * @returns {Promise<any>} Response transaksi.
 */
export async function cancelTransaction(orderId) {
    const contract = await ethContract();
    const tx = await contract.cancelTransaction(orderId);
    return tx;
}

/**
 * Mengambil detail escrow tertentu.
 * @param {string} orderId - ID order yang akan diambil.
 * @returns {Promise<Object>} Detail escrow yang sudah di-parse.
 */
export async function getEscrow(orderId) {
    const contract = await ethWithoutWallet();
    const data = await contract.getEscrow(orderId);
    return parseEscrow(data);
}

/**
 * Mem-parse data escrow mentah yang dikembalikan dari smart contract ke format yang lebih mudah dibaca.
 * @param {Array} data - Array data escrow mentah dari smart contract.
 * @returns {Object} Objek escrow yang sudah di-parse.
 */
function parseEscrow(data) {
    const statusMap = [
        "AWAITING_PAYMENT", // 0
        "AWAITING_DELIVERY", // 1
        "IN_DELIVERY",       // 2
        "DELIVERED",         // 3
        "COMPLETE",          // 4
        "CANCELED",          // 5
        "DISPUTED"           // 6
    ];

    return {
        customer: data.customer,
        seller: data.seller,
        canceledBy: data.canceledBy,
        orderFee: ethers.formatEther(data.orderFee), // Konversi dari Wei ke Ether
        paymentDeadline: Number(data.paymentDeadline), // Konversi BigInt ke Number
        status: statusMap[Number(data.status)],
        fundsDeposited: data.fundsDeposited,
    };
}

// New function to upload metadata to Pinata via your backend
/**
 * Fungsi untuk mengunggah metadata ke Pinata melalui backend API.
 * @param {Object} metadata - Objek metadata yang akan diunggah.
 * @returns {Promise<string>} IPFS hash (CID) dari metadata yang diunggah.
 */
export async function uploadMetadataToPinata(metadata) {
    try {
        // IMPORTANT: Adjust this URL to match your backend's actual address and endpoint
        // If running locally, it might be 'http://localhost:3001/upload-json-to-pinata'
        // If deployed, it will be your Vercel API endpoint, e.g., '/api/upload-json-to-pinata'
        const response = await fetch('/api/upload-json-to-pinata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jsonContent: metadata }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to upload metadata to Pinata via backend');
        }

        const data = await response.json();
        return data.IpfsHash; // Pinata's response usually contains IpfsHash
    } catch (error) {
        console.error("Error uploading metadata to Pinata:", error.message);
        alert(`Failed to upload metadata: ${error.message}`);
        throw error; // Re-throw to allow caller to handle
    }
}