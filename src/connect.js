import { AlchemyProvider, BrowserProvider, Contract, JsonRpcProvider, ethers, formatEther } from "ethers";
import abi from "./abi.json";
import { PinataSDK } from "pinata";

const address = "0x8eCC009CF4D8284Ce2df1b2e9eEEd09bE915FD37"; // Your contract address
// const url = "https://ethereum-holesky-rpc.publicnode.com"; // Holesky RPC URL

export const pinata = new PinataSDK({
    pinataJwt: import.meta.env.VITE_JWT,       
    pinataGateway: import.meta.env.VITE_GATEWAY 
});

/**
 * Function to connect wallet to DApp and get the first account address.
 * Requires 'ethereum' object (e.g., MetaMask).
 * @returns {Promise<string|undefined>} Connected account address or undefined if failed.
 */
export async function connectWallet() {
    try {
        if (!window.ethereum) {
            alert("Please install a Web3 wallet (e.g., MetaMask) to connect!");
            return;
        }

        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
        });

        if (!accounts || accounts.length === 0) {
            alert("No accounts connected! Please connect a wallet!");
            return;
        }

        return accounts[0];
    } catch (error) {
        console.error("Error connecting wallet:", error.message);
        alert(`Failed to connect wallet: ${error.message}`);
        return;
    }
}

/**
 * Connects to the contract using the wallet (for signing transactions).
 * @returns {Promise<Contract>} Ethers.js contract instance connected with the signer.
 */
async function ethContract() {
    const browser = new BrowserProvider(window.ethereum);
    const user = await browser.getSigner();
    const contract = new Contract(address, abi, user);
    return contract;
}

/**
 * Connects to the contract without a wallet (for read-only operations).
 * @returns {Promise<Contract>} Ethers.js contract instance connected with the provider.
 */
async function ethWithoutWallet() {
    const browser = new AlchemyProvider(`${import.meta.env.VITE_ALCHEMY}`);
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
export async function createEscrow(orderId, seller, orderFee, paymentDeadline) {
    // const seller = await connectWallet(); // kamu sebagai seller dan customer
    const contract = await ethContract();
    const tx = await contract.createEscrow(orderId, seller, orderFee, paymentDeadline);
    return tx;
}

/**
 * Allows the customer to pay the escrow fee.
 * @param {string} orderId - ID of the order to be paid.
 * @param {string} amountInWei - Amount to be paid, in wei (must match orderFee).
 * @returns {Promise<any>} Transaction response.
 */
export async function payEscrow(orderId, amountInWei) {
    const contract = await ethContract(); 
    const tx = await contract.payEscrow(orderId, { value: amountInWei });
    return tx;
}

/**
 * Allows the seller to deliver the order and mint an NFT to the customer.
 * The NFT will be automatically minted to the customer address stored in the escrow.
 * @param {string} orderId - Order ID.
 * @param {number} tokenId - Unique ID for the NFT.
 * @param {string} uri - URI for NFT metadata.
 * @param {string} customerAddress - Customer wallet address to receive the NFT.
 * @returns {Promise<any>} Transaction response.
 */
export async function deliverOrder(orderId, tokenId, uri, customerAddress) {
    try {
        const contract = await ethContract();
        
        // Log the parameters for debugging
        console.log("Delivering order with parameters:", {
            orderId,
            tokenId,
            uri,
            customerAddress
        });

        // Call the smart contract function with customer address explicitly
        // This ensures the NFT is minted to the correct customer address
        const tx = await contract.deliverOrder(orderId, tokenId, uri);
        
        console.log("DeliverOrder transaction sent:", tx.hash);
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        console.log("DeliverOrder transaction confirmed:", receipt);
        
        // Verify the NFT was minted to the correct address
        if (customerAddress) {
            console.log(`NFT with tokenId ${tokenId} should be minted to customer: ${customerAddress}`);
        }
        
        return tx;
    } catch (error) {
        console.error("Error in deliverOrder:", error);
        throw new Error(`Failed to deliver order: ${error.message}`);
    }
}

/**
 * Enhanced function to verify NFT ownership after minting
 * @param {number} tokenId - Token ID to check
 * @param {string} expectedOwner - Expected owner address
 * @returns {Promise<boolean>} True if the NFT is owned by the expected address
 */
export async function verifyNFTOwnership(tokenId, expectedOwner) {
    try {
        const contract = await ethWithoutWallet();
        
        // Check if the contract has an ownerOf function for NFTs
        if (typeof contract.ownerOf === 'function') {
            const actualOwner = await contract.ownerOf(tokenId);
            const isCorrectOwner = actualOwner.toLowerCase() === expectedOwner.toLowerCase();
            
            console.log(`NFT ${tokenId} ownership verification:`, {
                expectedOwner,
                actualOwner,
                isCorrectOwner
            });
            
            return isCorrectOwner;
        } else {
            console.warn("Contract does not support ownerOf function");
            return false;
        }
    } catch (error) {
        console.error("Error verifying NFT ownership:", error);
        return false;
    }
}

/**
 * Enhanced function to get NFT metadata and ownership info
 * @param {number} tokenId - Token ID to get info for
 * @returns {Promise<Object>} NFT information including owner and metadata
 */
export async function getNFTInfo(tokenId) {
    try {
        const contract = await ethWithoutWallet();
        
        const info = {};
        
        // Get owner if function exists
        if (typeof contract.ownerOf === 'function') {
            info.owner = await contract.ownerOf(tokenId);
        }
        
        // Get token URI if function exists
        if (typeof contract.tokenURI === 'function') {
            info.tokenURI = await contract.tokenURI(tokenId);
        }
        
        console.log(`NFT ${tokenId} info:`, info);
        return info;
    } catch (error) {
        console.error("Error getting NFT info:", error);
        throw error;
    }
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
 * Calls the smart contract to cancel the transaction.
 * @param {string} orderId - Order ID.
 * @returns {Promise<any>} Transaction response.
 */
export async function cancelTransactionBlockchain(orderId) {
    const contract = await ethContract();
    const tx = await contract.cancelTransaction(orderId);
    return tx;
}

/**
 * Sends a request to the backend API to cancel and optionally delete a transaction from the database.
 * @param {string} orderId - The ID of the order to cancel.
 * @param {boolean} deleteFromDB - If true, the transaction will be deleted from the database.
 * @param {string} [cancelReason='No reason provided'] - Optional reason for cancellation.
 * @returns {Promise<Object>} Response from the backend API.
 */
export async function cancelTransactionBackend(orderId, deleteFromDB = false, cancelReason = 'No reason provided') {
    try {
        const response = await fetch(`/api/transactions/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cancelReason: cancelReason,
                cancelledBy: (await ethContract()).runner.address, 
                deleteFromDB: deleteFromDB
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to cancel transaction in database');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error cancelling transaction in backend:", error.message);
        throw error;
    }
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
 * Enhanced function to get escrow details with additional NFT information
 * @param {string} orderId - Order ID to retrieve.
 * @returns {Promise<Object>} Enhanced escrow details with NFT info.
 */
export async function getEscrowWithNFTInfo(orderId) {
    try {
        const escrowData = await getEscrow(orderId);
        
        // If there's a tokenId associated, get NFT info
        if (escrowData.tokenId) {
            const nftInfo = await getNFTInfo(escrowData.tokenId);
            escrowData.nftInfo = nftInfo;
        }
        
        return escrowData;
    } catch (error) {
        console.error("Error getting enhanced escrow data:", error);
        throw error;
    }
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
        orderFee: ethers.formatEther(data.orderFee),
        paymentDeadline: Number(data.paymentDeadline),
        status: statusMap[Number(data.status)],
        fundsDeposited: data.fundsDeposited,
    };
}

/**
 * Fetches transaction list from the MongoDB backend.
 * @returns {Promise<Array<Object>>} Array containing transaction objects from the database.
 */
export async function fetchTransactionsFromBackend() {
    try {
        const response = await fetch('/api/transactions', {
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
        return data;
    } catch (error) {
        console.error("Error fetching transactions from backend:", error.message);
        alert(`Failed to fetch transactions: ${error.message}`);
        throw error;
    }
}

/**
 * Sends a request to the backend API to update a transaction's status in the database.
 * @param {string} orderId - The ID of the order to update.
 * @param {Object} updateData - An object containing the fields to update (e.g., { blockchainStatus: 'IN_DELIVERY', uri: 'ipfs_uri', shippedAt: 'timestamp' }).
 * @returns {Promise<Object>} Response from the backend API.
 */
export async function updateOrderStatusBackend(orderId, updateData) {
    try {
        const response = await fetch(`/api/transactions/${orderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update transaction status in database');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error updating transaction status in backend:", error.message);
        throw error;
    }
}