// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract EscrowContract is ERC721URIStorage {
    enum OrderStatus {
        AWAITING_PAYMENT, // 0
        AWAITING_DELIVERY, // 1
        IN_DELIVERY, // 2
        COMPLETE, // 3
        CANCELED, // 4
        DISPUTED // 5
    }

    struct Escrow {
        string orderId;
        address customer;
        address seller;
        uint256 orderFee;
        uint256 paymentDeadline;
        OrderStatus status;
        bool exists;
    }

    mapping(string => Escrow) private escrows;

    event EscrowCreated(
        string orderId,
        address indexed customer,
        address indexed seller,
        uint256 orderFee,
        uint256 paymentDeadline
    );

    event OrderPaid(string orderId);
    event OrderDelivered(string orderId, uint256 tokenId, string uri);

    constructor() ERC721("EscrowContract", "NGT") {}

    function createEscrow(
        string memory orderId,
        address customer,
        uint256 orderFee,
        uint256 paymentDeadline
    ) external {
        require(!escrows[orderId].exists, "Escrow already exists");

        escrows[orderId] = Escrow({
            orderId: orderId,
            customer: customer,
            seller: msg.sender,
            orderFee: orderFee,
            paymentDeadline: paymentDeadline,
            status: OrderStatus.AWAITING_PAYMENT,
            exists: true
        });

        emit EscrowCreated(orderId, customer, msg.sender, orderFee, paymentDeadline);
    }

    function payEscrow(string memory orderId) external payable {
        Escrow storage escrow = escrows[orderId];
        require(escrow.exists, "Escrow not found");
        require(msg.value == escrow.orderFee, "Incorrect payment");
        require(escrow.status == OrderStatus.AWAITING_PAYMENT, "Wrong status");

        escrow.status = OrderStatus.AWAITING_DELIVERY;

        (bool sent, ) = address(this).call{value: msg.value}("");
        require(sent, "Failed to transfer");

        emit OrderPaid(orderId);
    }

    function deliverOrder(
        string memory orderId,
        uint256 tokenId,
        string memory uri
    ) external {
        Escrow storage escrow = escrows[orderId];
        require(escrow.exists, "Escrow not found");
        require(msg.sender == escrow.seller, "Only seller can deliver");
        require(escrow.status == OrderStatus.AWAITING_DELIVERY, "Wrong status");

        escrow.status = OrderStatus.IN_DELIVERY;

        _safeMint(escrow.customer, tokenId);
        _setTokenURI(tokenId, uri);

        emit OrderDelivered(orderId, tokenId, uri);
    }

    function getEscrow(string memory orderId) external view returns (
        string memory,
        address,
        address,
        uint256,
        uint256,
        OrderStatus
    ) {
        Escrow memory escrow = escrows[orderId];
        require(escrow.exists, "Escrow not found");

        return (
            escrow.orderId,
            escrow.customer,
            escrow.seller,
            escrow.orderFee,
            escrow.paymentDeadline,
            escrow.status
        );
    }

    function releaseToSeller(string memory orderId) external {
       
    }

    function cancelTransaction(string memory orderId) external {
      
    }

    receive() external payable {}
}
