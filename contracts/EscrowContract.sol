// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract EscrowContract is ERC721URIStorage {

    enum OrderStatus {
        AWAITING_PAYMENT, // 0
        AWAITING_DELIVERY, // 1
        IN_DELIVERY, // 2
        DELIVERED, // 3
        COMPLETE, // 4
        CANCELED, // 5
        DISPUTED // 6
    }

    struct Escrow {
        address customer;
        address seller;
        address canceledBy;
        uint256 orderFee;
        uint256 paymentDeadline;  
        OrderStatus status;    
        bool fundsDeposited;  
    }

    // format metadata / JSON di nft --> uri
    // 1. order id -- name
    // 2. image
    // 3. description
    // 4. order fee
    // 5. seller

    mapping(string => Escrow) private escrows;
    mapping(string => uint256) private escrowBalances;

    event NewEscrowCreated(string orderId, address indexed seller, address indexed customer, uint256 orderFee);
    event PaymentSuccessed(string orderId, address indexed customer, uint256 amount);
    event OrderInDelivery(string orderId, address indexed seller, address indexed customer, uint256 tokenId);
    event OrderDeliveryConfirmed(string orderId, address indexed customer);
    event FundsReleasedToSeller(string orderId, address indexed seller, uint256 amount);
    event TransactionCanceled(string orderId, address indexed canceledBy);

    constructor() ERC721("EscrowContract", "ESC") {}
    
    function createEscrow(string memory orderId, address seller, uint256 orderFee, uint256 paymentDeadline) external {
        escrows[orderId] = Escrow(msg.sender, seller, address(0), orderFee, paymentDeadline, OrderStatus.AWAITING_PAYMENT, false);

        emit NewEscrowCreated(orderId, seller, msg.sender, orderFee);
    }

    function payEscrow(string memory orderId) external payable {
        Escrow storage currentEscrow = escrows[orderId];

        require(msg.sender == currentEscrow.customer, "You are not the authorized customer!");
        require(currentEscrow.status == OrderStatus.AWAITING_PAYMENT, "You don't have to do payment!");
        require(currentEscrow.orderFee == msg.value, "Please insert the right amount of money!");
        require(block.timestamp <= currentEscrow.paymentDeadline, "Overdue!");

        escrowBalances[orderId] = msg.value;
        currentEscrow.fundsDeposited = true;
        currentEscrow.status = OrderStatus.AWAITING_DELIVERY;

        emit PaymentSuccessed(orderId, currentEscrow.customer, msg.value);
    }

    function deliverOrder(string memory orderId, uint256 tokenId, string memory uri) external {
        Escrow storage currentEscrow = escrows[orderId];

        require(msg.sender == currentEscrow.seller, "Only seller can call this function.");
        require(currentEscrow.status == OrderStatus.AWAITING_DELIVERY, "Your order is not in the awaiting delivery status.");
        require(currentEscrow.fundsDeposited, "Customer hasn't deposited.");
        currentEscrow.status = OrderStatus.IN_DELIVERY;

        _safeMint(escrows[orderId].customer, tokenId);     
        _setTokenURI(tokenId, uri);

        emit OrderInDelivery(orderId, msg.sender, currentEscrow.customer, tokenId);
    }

    function confirmOrderDelivered(string memory orderId) external {
        Escrow storage currentEscrow = escrows[orderId];
        require(msg.sender == currentEscrow.customer, "Only customer can change the status to delivered!");
        require(currentEscrow.status == OrderStatus.IN_DELIVERY, "Your order has not been processed.");
        currentEscrow.status = OrderStatus.DELIVERED;

        emit OrderDeliveryConfirmed(orderId, currentEscrow.customer);
    }

    function releaseToSeller(string memory orderId) external {
        Escrow storage currentEscrow = escrows[orderId];
        require(msg.sender == currentEscrow.customer, "Only customer can release the fee to the seller!");
        require(currentEscrow.status == OrderStatus.DELIVERED, "You haven't confirmed your order!");
        require(currentEscrow.fundsDeposited, "No money to release to the seller.");

        uint256 amountToRelease = escrowBalances[orderId];
        require(amountToRelease > 0, "No amount of money to release!");

        escrowBalances[orderId] = 0;
        currentEscrow.fundsDeposited = false;   
        currentEscrow.status = OrderStatus.COMPLETE;

        (bool sent, ) = payable(currentEscrow.seller).call{value : amountToRelease}("");
        require(sent, "Failed to release the money to the seller!");

        emit FundsReleasedToSeller(orderId, currentEscrow.seller, amountToRelease);
    }   

    function cancelTransaction(string memory orderId) external {
        Escrow storage currentEscrow = escrows[orderId];

        if (msg.sender == currentEscrow.customer && currentEscrow.status == OrderStatus.AWAITING_PAYMENT) {
            currentEscrow.canceledBy = msg.sender;
            currentEscrow.status = OrderStatus.CANCELED;
            emit TransactionCanceled(orderId, msg.sender);
        }

        else if (msg.sender == currentEscrow.seller && currentEscrow.status == OrderStatus.AWAITING_DELIVERY) {
            currentEscrow.canceledBy = msg.sender;
            require(currentEscrow.fundsDeposited, "No funds deposited to refund.");

            uint256 amountToRefund = escrowBalances[orderId];
            require(amountToRefund > 0, "Amount to refund must be greater than 0.");

            escrowBalances[orderId] = 0;
            currentEscrow.fundsDeposited = false;

            (bool sent, ) = payable(currentEscrow.customer).call{value : amountToRefund}("");
            require(sent, "Failed to refund.");

            currentEscrow.status = OrderStatus.CANCELED;

            emit TransactionCanceled(orderId, msg.sender);
        } 

        else {
            revert("Cancellation not allowed under current conditions or by this caller.");
        }
    }

    function getEscrow(string memory orderId) external view returns (Escrow memory) {
        return escrows[orderId];
    }

    // supaya smart contract bisa terima uang (ETH)
    receive() external payable {}
}