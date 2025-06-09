const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("EscrowContract", function () {
    let EscrowContractFactory; 
    let escrowContract;
    let owner, signerAsSeller, signerAsCustomer, signerAsOtherUser; 
    
    let defaultOrderId;
    let defaultOrderFee;
    let defaultPaymentDeadline;

    const OrderStatus = {
        AWAITING_PAYMENT: 0,
        AWAITING_DELIVERY: 1,
        IN_DELIVERY: 2,
        DELIVERED: 3,
        COMPLETE: 4,
        CANCELED: 5,
        DISPUTED: 6
    };

    beforeEach(async function () {
        [owner, signerAsSeller, signerAsCustomer, signerAsOtherUser] = await ethers.getSigners();
        EscrowContractFactory = await ethers.getContractFactory("EscrowContract");
        escrowContract = await EscrowContractFactory.deploy();

        defaultOrderId = "order-main-123";
        defaultOrderFee = ethers.parseEther("1.0");
        
        const latestBlock = await ethers.provider.getBlock("latest");
        defaultPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
    });

    describe("Deployment", function () {
        it("Should have correct ERC721 name and symbol", async function () {
            expect(await escrowContract.name()).to.equal("EscrowContract");
            expect(await escrowContract.symbol()).to.equal("ESC");
        });
    });

    describe("createEscrow", function () {
        it("Should create a new escrow with customer as msg.sender and emit NewEscrowCreated event", async function () {
            await expect(escrowContract.connect(signerAsCustomer).createEscrow(defaultOrderId, signerAsSeller.address, defaultOrderFee, defaultPaymentDeadline))
                .to.emit(escrowContract, "NewEscrowCreated")
                .withArgs(defaultOrderId, signerAsSeller.address, signerAsCustomer.address, defaultOrderFee);

            const escrow = await escrowContract.getEscrow(defaultOrderId);
            expect(escrow.customer).to.equal(signerAsCustomer.address); 
            expect(escrow.seller).to.equal(signerAsSeller.address);  
            expect(escrow.canceledBy).to.equal(ethers.ZeroAddress);
            expect(escrow.orderFee).to.equal(defaultOrderFee);
            expect(escrow.paymentDeadline).to.equal(defaultPaymentDeadline);
            expect(escrow.status).to.equal(OrderStatus.AWAITING_PAYMENT);
            expect(escrow.fundsDeposited).to.be.false;
        });

        it("Should allow creating multiple escrows with different customers and sellers", async function () {
            await escrowContract.connect(signerAsCustomer).createEscrow(defaultOrderId, signerAsSeller.address, defaultOrderFee, defaultPaymentDeadline);

            const orderId2 = "order-456";
            const orderFee2 = ethers.parseEther("0.5");
            const latestBlock = await ethers.provider.getBlock("latest");
            const paymentDeadline2 = BigInt(latestBlock.timestamp + 7200);
            
            const anotherSellerSigner = owner;

            await expect(escrowContract.connect(signerAsOtherUser).createEscrow(orderId2, anotherSellerSigner.address, orderFee2, paymentDeadline2))
                .to.emit(escrowContract, "NewEscrowCreated")
                .withArgs(orderId2, anotherSellerSigner.address, signerAsOtherUser.address, orderFee2);

            const escrow1 = await escrowContract.getEscrow(defaultOrderId);
            expect(escrow1.customer).to.equal(signerAsCustomer.address);
            expect(escrow1.seller).to.equal(signerAsSeller.address);

            const escrow2 = await escrowContract.getEscrow(orderId2);
            expect(escrow2.customer).to.equal(signerAsOtherUser.address);
            expect(escrow2.seller).to.equal(anotherSellerSigner.address);
            expect(escrow2.orderFee).to.equal(orderFee2);
        });
    });

    describe("payEscrow", function () {
        beforeEach(async function () {
            await escrowContract.connect(signerAsCustomer).createEscrow(defaultOrderId, signerAsSeller.address, defaultOrderFee, defaultPaymentDeadline);
        });

        it("Should allow customer (who created escrow) to pay, update status, and emit PaymentSuccessed event", async function () {
            await expect(escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: defaultOrderFee }))
                .to.emit(escrowContract, "PaymentSuccessed")
                .withArgs(defaultOrderId, signerAsCustomer.address, defaultOrderFee);

            const escrow = await escrowContract.getEscrow(defaultOrderId);
            expect(escrow.status).to.equal(OrderStatus.AWAITING_DELIVERY);
            expect(escrow.fundsDeposited).to.be.true;
            expect(await ethers.provider.getBalance(await escrowContract.getAddress())).to.equal(defaultOrderFee);
        });

        it("Should revert if payer is not the authorized customer", async function () {
            await expect(escrowContract.connect(signerAsOtherUser).payEscrow(defaultOrderId, { value: defaultOrderFee }))
                .to.be.revertedWith("You are not the authorized customer!");
             await expect(escrowContract.connect(signerAsSeller).payEscrow(defaultOrderId, { value: defaultOrderFee })) 
                .to.be.revertedWith("You are not the authorized customer!");
        });

        it("Should revert if status is not AWAITING_PAYMENT", async function () {
            await escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: defaultOrderFee }); 
            await expect(escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: defaultOrderFee }))
                .to.be.revertedWith("You don't have to do payment!");
        });

        it("Should revert if incorrect payment amount is sent", async function () {
            const wrongFee = ethers.parseEther("0.5");
            await expect(escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: wrongFee }))
                .to.be.revertedWith("Please insert the right amount of money!");
        });

        it("Should revert if payment is made after the paymentDeadline", async function () {
            await network.provider.send("evm_increaseTime", [3601]); 
            await network.provider.send("evm_mine"); 

            await expect(escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: defaultOrderFee }))
                .to.be.revertedWith("Overdue!");
        });
    });
    
    describe("deliverOrder", function () {
        const tokenId = BigInt(1); 
        const tokenURI = "ipfs://QmetadatahashDeliver";

        beforeEach(async function () {
            await escrowContract.connect(signerAsCustomer).createEscrow(defaultOrderId, signerAsSeller.address, defaultOrderFee, defaultPaymentDeadline);
            await escrowContract.connect(signerAsCustomer).payEscrow(defaultOrderId, { value: defaultOrderFee });
        });

        it("Should allow specified seller to deliver the order, mint NFT to customer, and emit OrderInDelivery event", async function () {
            await expect(escrowContract.connect(signerAsSeller).deliverOrder(defaultOrderId, tokenId, tokenURI))
                .to.emit(escrowContract, "OrderInDelivery")
                .withArgs(defaultOrderId, signerAsSeller.address, signerAsCustomer.address, tokenId);

            const escrow = await escrowContract.getEscrow(defaultOrderId);
            expect(escrow.status).to.equal(OrderStatus.IN_DELIVERY);
            expect(await escrowContract.ownerOf(tokenId)).to.equal(signerAsCustomer.address); 
            expect(await escrowContract.tokenURI(tokenId)).to.equal(tokenURI);
        });

        it("Should revert if caller is not the specified seller", async function () {
            const uniqueTokenIdForThisTest = BigInt(Date.now()); 
            await expect(escrowContract.connect(signerAsCustomer).deliverOrder(defaultOrderId, uniqueTokenIdForThisTest, tokenURI)) 
                .to.be.revertedWith("Only seller can call this function.");
            await expect(escrowContract.connect(signerAsOtherUser).deliverOrder(defaultOrderId, uniqueTokenIdForThisTest + BigInt(1), tokenURI)) 
                .to.be.revertedWith("Only seller can call this function.");
        });

        it("Should revert if order status is not AWAITING_DELIVERY (e.g., still AWAITING_PAYMENT)", async function () {
            const newOrderId = "unpaid-order-deliver";
            const latestBlock = await ethers.provider.getBlock("latest");
            const newPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
            await escrowContract.connect(signerAsCustomer).createEscrow(newOrderId, signerAsSeller.address, defaultOrderFee, newPaymentDeadline);
            
            const newTokenId = BigInt(Date.now()); 
            await expect(escrowContract.connect(signerAsSeller).deliverOrder(newOrderId, newTokenId, tokenURI))
                .to.be.revertedWith("Your order is not in the awaiting delivery status.");
        });
        
        // it("Should revert if token ID already exists", async function () {
        //     // Deliver order pertama sukses mint tokenId
        //     await escrowContract.connect(signerAsSeller).deliverOrder(defaultOrderId, tokenId, tokenURI); 

        //     // Setup order kedua
        //     const orderId2 = "order-duplicate-token";
        //     const latestBlock = await ethers.provider.getBlock("latest");
        //     const paymentDeadline2 = BigInt(latestBlock.timestamp + 3600);
        //     await escrowContract.connect(signerAsOtherUser).createEscrow(orderId2, signerAsSeller.address, defaultOrderFee, paymentDeadline2);
        //     await escrowContract.connect(signerAsOtherUser).payEscrow(orderId2, { value: defaultOrderFee });

        //     // Tes deliverOrder gagal karena tokenId sudah ada
        //     await expect(
        //         escrowContract.connect(signerAsSeller).deliverOrder(orderId2, tokenId, "ipfs://newhash")
        //     ).to.be.revertedWithCustomError(escrowContract, "NamaCustomError").withArgs(tokenId);
        // });

    });

    describe("confirmOrderDelivered", function () {
        const localTokenIdBase = BigInt(Date.now()); 
        const localTokenURI = "ipfs://Qconfirm";
        let orderIdForConfirm;
        let currentTokenIdForConfirm;


        beforeEach(async function () {
            orderIdForConfirm = `confirm-${Date.now()}`;
            currentTokenIdForConfirm = localTokenIdBase + BigInt(1); 
            const latestBlock = await ethers.provider.getBlock("latest");
            const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);

            await escrowContract.connect(signerAsCustomer).createEscrow(orderIdForConfirm, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
            await escrowContract.connect(signerAsCustomer).payEscrow(orderIdForConfirm, { value: defaultOrderFee });
            await escrowContract.connect(signerAsSeller).deliverOrder(orderIdForConfirm, currentTokenIdForConfirm, localTokenURI); 
        });

        it("Should allow customer to confirm delivery, update status, and emit OrderDeliveryConfirmed event", async function () {
            await expect(escrowContract.connect(signerAsCustomer).confirmOrderDelivered(orderIdForConfirm))
                .to.emit(escrowContract, "OrderDeliveryConfirmed")
                .withArgs(orderIdForConfirm, signerAsCustomer.address);

            const escrow = await escrowContract.getEscrow(orderIdForConfirm);
            expect(escrow.status).to.equal(OrderStatus.DELIVERED);
        });

        it("Should revert if caller is not the customer", async function () {
            await expect(escrowContract.connect(signerAsSeller).confirmOrderDelivered(orderIdForConfirm))
                .to.be.revertedWith("Only customer can change the status to delivered!");
            await expect(escrowContract.connect(signerAsOtherUser).confirmOrderDelivered(orderIdForConfirm))
                .to.be.revertedWith("Only customer can change the status to delivered!");
        });

        it("Should revert if order status is not IN_DELIVERY (e.g. AWAITING_DELIVERY)", async function () {
            const newOrderId = `confirm-fail-status-${Date.now()}`;
            const latestBlock = await ethers.provider.getBlock("latest");
            const newPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
            await escrowContract.connect(signerAsCustomer).createEscrow(newOrderId, signerAsSeller.address, defaultOrderFee, newPaymentDeadline);
            await escrowContract.connect(signerAsCustomer).payEscrow(newOrderId, { value: defaultOrderFee }); 

            await expect(escrowContract.connect(signerAsCustomer).confirmOrderDelivered(newOrderId))
                .to.be.revertedWith("Your order has not been processed.");
        });
    });

    describe("releaseToSeller", function () {
        const localTokenIdBase = BigInt(Date.now()); 
        const localTokenURI = "ipfs://Qrelease";
        let orderIdForRelease;
        let currentTokenIdForRelease;


        beforeEach(async function () {
            orderIdForRelease = `release-${Date.now()}`;
            currentTokenIdForRelease = localTokenIdBase + BigInt(2); 
            const latestBlock = await ethers.provider.getBlock("latest");
            const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);

            await escrowContract.connect(signerAsCustomer).createEscrow(orderIdForRelease, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
            await escrowContract.connect(signerAsCustomer).payEscrow(orderIdForRelease, { value: defaultOrderFee });
            await escrowContract.connect(signerAsSeller).deliverOrder(orderIdForRelease, currentTokenIdForRelease, localTokenURI); 
            await escrowContract.connect(signerAsCustomer).confirmOrderDelivered(orderIdForRelease);
        });

        it("Should allow customer to release funds to seller, update status, and emit FundsReleasedToSeller event", async function () {
            const sellerInitialBalance = await ethers.provider.getBalance(signerAsSeller.address);
            
            await expect(escrowContract.connect(signerAsCustomer).releaseToSeller(orderIdForRelease))
                .to.emit(escrowContract, "FundsReleasedToSeller")
                .withArgs(orderIdForRelease, signerAsSeller.address, defaultOrderFee);

            const escrow = await escrowContract.getEscrow(orderIdForRelease);
            expect(escrow.status).to.equal(OrderStatus.COMPLETE);
            expect(escrow.fundsDeposited).to.be.false;
            
            expect(await ethers.provider.getBalance(await escrowContract.getAddress())).to.equal(0); 

            const sellerFinalBalance = await ethers.provider.getBalance(signerAsSeller.address);
            expect(sellerFinalBalance).to.equal(sellerInitialBalance + defaultOrderFee);
        });

        it("Should revert if caller is not the customer", async function () {
            await expect(escrowContract.connect(signerAsSeller).releaseToSeller(orderIdForRelease))
                .to.be.revertedWith("Only customer can release the fee to the seller!");
        });

        it("Should revert if order status is not DELIVERED (e.g. IN_DELIVERY)", async function () {
            const newOrderId = `release-fail-status-${Date.now()}`;
            const newTokenId = BigInt(Date.now()) + BigInt(3); 
            const latestBlock = await ethers.provider.getBlock("latest");
            const newPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
            await escrowContract.connect(signerAsCustomer).createEscrow(newOrderId, signerAsSeller.address, defaultOrderFee, newPaymentDeadline);
            await escrowContract.connect(signerAsCustomer).payEscrow(newOrderId, { value: defaultOrderFee });
            await escrowContract.connect(signerAsSeller).deliverOrder(newOrderId, newTokenId, localTokenURI); 

            await expect(escrowContract.connect(signerAsCustomer).releaseToSeller(newOrderId))
                .to.be.revertedWith("You haven't confirmed your order!");
        });
    });

    describe("cancelTransaction", function () {
        describe("By Customer (Status: AWAITING_PAYMENT)", function () {
            let orderIdForCustomerCancel;
            beforeEach(async function () {
                orderIdForCustomerCancel = `cancel-cust-${Date.now()}`;
                const latestBlock = await ethers.provider.getBlock("latest");
                const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
                await escrowContract.connect(signerAsCustomer).createEscrow(orderIdForCustomerCancel, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
            });

            it("Should allow customer to cancel if AWAITING_PAYMENT and emit TransactionCanceled event", async function () {
                await expect(escrowContract.connect(signerAsCustomer).cancelTransaction(orderIdForCustomerCancel))
                    .to.emit(escrowContract, "TransactionCanceled")
                    .withArgs(orderIdForCustomerCancel, signerAsCustomer.address);

                const escrow = await escrowContract.getEscrow(orderIdForCustomerCancel);
                expect(escrow.status).to.equal(OrderStatus.CANCELED);
                expect(escrow.canceledBy).to.equal(signerAsCustomer.address);
                expect(escrow.fundsDeposited).to.be.false;
            });

            it("Should revert if customer tries to cancel when status is not AWAITING_PAYMENT (e.g. AWAITING_DELIVERY)", async function () {
                await escrowContract.connect(signerAsCustomer).payEscrow(orderIdForCustomerCancel, { value: defaultOrderFee }); 
                await expect(escrowContract.connect(signerAsCustomer).cancelTransaction(orderIdForCustomerCancel))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");
            });
        });

        describe("By Seller (Status: AWAITING_DELIVERY, Funds Deposited)", function () {
            let orderIdForSellerCancel;
            beforeEach(async function () {
                orderIdForSellerCancel = `cancel-seller-${Date.now()}`;
                const latestBlock = await ethers.provider.getBlock("latest");
                const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
                await escrowContract.connect(signerAsCustomer).createEscrow(orderIdForSellerCancel, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
                await escrowContract.connect(signerAsCustomer).payEscrow(orderIdForSellerCancel, { value: defaultOrderFee }); 
            });

            it("Should allow seller to cancel, refund customer, and emit TransactionCanceled event", async function () {
                const customerInitialBalance = await ethers.provider.getBalance(signerAsCustomer.address);
                
                await expect(escrowContract.connect(signerAsSeller).cancelTransaction(orderIdForSellerCancel))
                    .to.emit(escrowContract, "TransactionCanceled")
                    .withArgs(orderIdForSellerCancel, signerAsSeller.address);

                const escrow = await escrowContract.getEscrow(orderIdForSellerCancel);
                expect(escrow.status).to.equal(OrderStatus.CANCELED);
                expect(escrow.canceledBy).to.equal(signerAsSeller.address);
                expect(escrow.fundsDeposited).to.be.false;
                
                const customerFinalBalance = await ethers.provider.getBalance(signerAsCustomer.address);
                expect(customerFinalBalance).to.equal(customerInitialBalance + defaultOrderFee); 
            });

            it("Should revert if seller tries to cancel when order is AWAITING_PAYMENT", async function () {
                const newOrderId = `cancel-seller-nopay-${Date.now()}`;
                const latestBlock = await ethers.provider.getBlock("latest");
                const newPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
                await escrowContract.connect(signerAsCustomer).createEscrow(newOrderId, signerAsSeller.address, defaultOrderFee, newPaymentDeadline); 

                await expect(escrowContract.connect(signerAsSeller).cancelTransaction(newOrderId))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");
            });

             it("Should revert if seller tries to cancel when status is not AWAITING_DELIVERY (e.g. IN_DELIVERY)", async function () {
                const tokenIdToDeliver = BigInt(Date.now());
                await escrowContract.connect(signerAsSeller).deliverOrder(orderIdForSellerCancel, tokenIdToDeliver, "ipfs://someuri");

                await expect(escrowContract.connect(signerAsSeller).cancelTransaction(orderIdForSellerCancel))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");
            });
        });

        describe("General Cancellation Failures", function () {
            it("Should revert if an unauthorized user (not designated customer or seller for the allowed state) tries to cancel", async function () {
                const generalCancelOrderId = `gen-cancel-unauth-${Date.now()}`;
                const latestBlock = await ethers.provider.getBlock("latest");
                const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
                await escrowContract.connect(signerAsCustomer).createEscrow(generalCancelOrderId, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
                
                await expect(escrowContract.connect(signerAsOtherUser).cancelTransaction(generalCancelOrderId))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");
                 await expect(escrowContract.connect(signerAsSeller).cancelTransaction(generalCancelOrderId))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");

                await escrowContract.connect(signerAsCustomer).payEscrow(generalCancelOrderId, { value: defaultOrderFee });
                await expect(escrowContract.connect(signerAsOtherUser).cancelTransaction(generalCancelOrderId))
                    .to.be.revertedWith("Cancellation not allowed under current conditions or by this caller.");
            });
        });
    });

    describe("getEscrow", function () {
        it("Should return the correct escrow details for an existing order", async function () {
            const getOrderId = `get-escrow-exist-${Date.now()}`;
            const latestBlock = await ethers.provider.getBlock("latest");
            const localPaymentDeadline = BigInt(latestBlock.timestamp + 3600);
            await escrowContract.connect(signerAsCustomer).createEscrow(getOrderId, signerAsSeller.address, defaultOrderFee, localPaymentDeadline);
            
            const escrow = await escrowContract.getEscrow(getOrderId);
            expect(escrow.customer).to.equal(signerAsCustomer.address);
            expect(escrow.seller).to.equal(signerAsSeller.address);
            expect(escrow.orderFee).to.equal(defaultOrderFee);
        });

        it("Should return default/empty values for a non-existent orderId", async function () {
            const nonExistentOrderId = "non-existent-id-final";
            const escrow = await escrowContract.getEscrow(nonExistentOrderId);
            expect(escrow.customer).to.equal(ethers.ZeroAddress);
            expect(escrow.seller).to.equal(ethers.ZeroAddress);
            expect(escrow.orderFee).to.equal(0);
        });
    });

    describe("receive() fallback function", function () {
        it("Should allow the contract to receive Ether directly", async function () {
            const sendAmount = ethers.parseEther("0.1");
            const initialBalance = await ethers.provider.getBalance(await escrowContract.getAddress());
            await expect(
                owner.sendTransaction({ 
                    to: await escrowContract.getAddress(),
                    value: sendAmount,
                })
            ).to.not.be.reverted;
            expect(await ethers.provider.getBalance(await escrowContract.getAddress())).to.equal(initialBalance + sendAmount); 
        });
    });
});