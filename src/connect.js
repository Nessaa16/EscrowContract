import { BrowserProvider, Contract, JsonRpcProvider, ethers } from "ethers";
import abi from "./abi.json" 

const address = "0x5d0EeDC820CDafbEC7bc8458C8ceE8409FDaCC20"; // Your contract address
const url = "https://ethereum-holesky-rpc.publicnode.com/"; // Holesky RPC URL


/**
 * Function to connect wallet to DApp and get the first account address.
 * Requires 'ethereum' object (e.g., MetaMask).
 * @returns {Promise<string|undefined>} Connected account address or undefined if failed.
 */
export async function connectWallet() {
    try {
        // Ensure window.ethereum (Web3 wallet provider) is available
        if (!window.ethereum) {
            alert("Please install a Web3 wallet (e.g., MetaMask) to connect!");
            return;
        }

        // Request accounts from the connected wallet
        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
        });

        // Check if any accounts are connected
        if (!accounts || accounts.length === 0) {
            alert("No accounts connected! Please connect a wallet!");
            return;
        }

        // Return the first connected account address
        return accounts[0];
    } catch (error) {
        console.error("Error connecting wallet:", error.message);
        alert(`Failed to connect wallet: ${error.message}`);
        return;
    }
}


/**
 * Connects to the contract using the wallet (for signing transactions).
 * This function will internally use window.ethereum.
 * @returns {Promise<Contract>} Ethers.js contract instance connected with the signer.
 */
async function ethContract() {
    // Create a BrowserProvider from window.ethereum
    const browser = new BrowserProvider(window.ethereum);
    // Get the signer (user account) to send transactions
    const user = await browser.getSigner();
    // Create a Contract instance with contract address, ABI, and signer
    const contract = new Contract(address, abi, user);
    return contract;
}

/**
 * Connects to the contract without a wallet (for read-only operations).
 * @returns {Promise<Contract>} Ethers.js contract instance connected with the provider.
 */
async function ethWithoutWallet() {
    // Create a JsonRpcProvider to connect to the blockchain RPC URL
    const browser = new JsonRpcProvider(url);
    // Create a Contract instance with contract address, ABI, and provider
    const contract = new Contract(address, abi, browser);
    return contract;
}

/**
 * Creates a new escrow. Only the seller can call this function.
 * @param {string} orderId - Unique ID for the order.
 * @param {string} customer - Customer address.
 * @param {string} orderFee - Order fee in wei (as string or BigInt).
 * @param {number} paymentDeadline - Payment deadline as Unix timestamp (seconds).
 * @returns {Promise<any>} Transaction response.
 */
export async function createEscrow(orderId, customer, orderFee, paymentDeadline) {
    const contract = await ethContract(); // ethContract already uses window.ethereum
    const tx = await contract.createEscrow(orderId, customer, orderFee, paymentDeadline);
    return tx; // Return transaction object to await its confirmation
}

/**
 * Allows the customer to pay the escrow fee.
 * @param {string} orderId - ID of the order to be paid.
 * @param {string} amountInWei - Amount to be paid, in wei (must match orderFee).
 * @returns {Promise<any>} Transaction response.
 */
export async function payEscrow(orderId, amountInWei) {
    const contract = await ethContract(); // ethContract already uses window.ethereum
    const tx = await contract.payEscrow(orderId, { value: amountInWei });
    return tx;
}

/**
 * Allows the seller to deliver the order and mint an NFT.
 * @param {string} orderId - Order ID.
 * @param {number} tokenId - Unique ID for the NFT.
 * @param {string} uri - URI for NFT metadata.
 * @returns {Promise<any>} Transaction response.
 */
export async function deliverOrder(orderId, tokenId, uri) {
    const contract = await ethContract();
    const tx = await contract.deliverOrder(orderId, tokenId, uri);
    return tx;
}

/**
 * Allows the customer to confirm that the order has been delivered.
 * @param {string} orderId - Order ID.
 * @returns {Promise<any>} Transaction response.
 */
export async function confirmOrderDelivered(orderId) {
    const contract = await ethContract();
    const tx = await contract.confirmOrderDelivered(orderId);
    return tx;
}

/**
 * Allows the customer to release funds to the seller after delivery confirmation.
 * @param {string} orderId - Order ID.
 * @returns {Promise<any>} Transaction response.
 */
export async function releaseToSeller(orderId) {
    const contract = await ethContract();
    const tx = await contract.releaseToSeller(orderId);
    return tx;
}

/**
 * Allows the customer or seller to cancel the transaction under certain conditions.
 * @param {string} orderId - Order ID.
 * @returns {Promise<any>} Transaction response.
 */
export async function cancelTransaction(orderId) {
    const contract = await ethContract();
    const tx = await contract.cancelTransaction(orderId);
    return tx;
}

/**
 * Retrieves details of a specific escrow.
 * @param {string} orderId - Order ID to retrieve.
 * @returns {Promise<Object>} Parsed escrow details.
 */
export async function getEscrow(orderId) {
    const contract = await ethWithoutWallet();
    const data = await contract.getEscrow(orderId);
    return parseEscrow(data);
}

/**
 * Parses raw escrow data returned from the smart contract into a more readable format.
 * @param {Array} data - Raw escrow data array from the smart contract.
 * @returns {Object} Parsed escrow object.
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
        orderFee: ethers.formatEther(data.orderFee), // Convert from Wei to Ether
        paymentDeadline: Number(data.paymentDeadline), // Convert BigInt to Number
        status: statusMap[Number(data.status)],
        fundsDeposited: data.fundsDeposited,
    };
}

// Function to upload metadata to Pinata via your backend
/**
 * Function to upload metadata to Pinata via the backend API.
 * @param {Object} metadata - Metadata object to be uploaded.
 * @returns {Promise<string>} IPFS hash (CID) of the uploaded metadata.
 */
export async function uploadMetadataToPinata(metadata) {
    try {
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

/**
 * Fetches transaction list from the MongoDB backend.
 * @returns {Promise<Array<Object>>} Array containing transaction objects from the database.
 */
export async function fetchTransactionsFromBackend() {
    try {
        // IMPORTANT: Ensure this URL correctly targets your backend endpoint
        const response = await fetch('/api/transactions-list', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch transactions from backend');
        }

        const data = await response.json();
        return data; // Returns array of transaction data from MongoDB
    } catch (error) {
        console.error("Error fetching transactions from backend:", error.message);
        alert(`Failed to fetch transactions: ${error.message}`);
        throw error; // Re-throw to allow caller to handle
    }
}