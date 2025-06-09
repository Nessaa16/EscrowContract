import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider } from "ethers";

import {
  createEscrow,
  payEscrow,
  getEscrow,
  connectWallet
} from './connect';
//k
import CheckoutPage from './checkout';
import OrderListPage from './OrderListPage'; // Import komponen Daftar Order

// Data produk dummy (harga dalam ETH)
const initialProducts = [
  { id: 1, name: 'Laptop', price: 0.00015, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Laptop' },
  { id: 2, name: 'Smartphone', price: 0.00008, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Phone' },
  { id: 3, name: 'Smartwatch', price: 0.000025, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Watch' },
  { id: 4, name: 'Headphone', price: 0.000012, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Headphone' },
  { id: 5, name: 'Monitor', price: 0.000045, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Monitor' },
  { id: 6, name: 'Keyboard', price: 0.000009, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Keyboard' },
];


/**
 * Komponen ProductCard untuk menampilkan satu produk.
 */
const ProductCard = ({ product, onAddToCart }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center justify-between transition-transform transform hover:scale-105">
      <img
        src={product.imageUrl}
        alt={product.name}
        className="w-32 h-32 object-cover rounded-lg mb-4"
        onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/200x200/E0E0E0/666666?text=No+Image'; }}
      />
      <h3 className="text-xl font-semibold text-gray-800 mb-2 text-center">{product.name}</h3>
      <p className="text-blue-600 text-lg font-bold mb-4">
        {product.price.toFixed(4)} ETH
      </p>
      <button
        onClick={() => onAddToCart(product)}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-300 w-full"
      >
        Tambah ke Keranjang
      </button>
    </div>
  );
};

/**
 * Komponen CartItem untuk menampilkan satu item di keranjang.
 */
const CartItem = ({ item, onUpdateQuantity, onRemoveItemCompletely }) => {
  return (
    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg shadow-sm mb-3">
      <div className="flex items-center flex-grow">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-16 h-16 object-cover rounded-md mr-4"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/100x100/D0D0D0/555555?text=No+Image'; }}
      />
        <div>
          <h4 className="text-lg font-medium text-gray-800">{item.name}</h4>
          <p className="text-gray-600">{item.price.toFixed(4)} ETH</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
          className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300 focus:outline-none"
          disabled={item.quantity <= 1}
        >
          -
        </button>
        <input
          type="number"
          value={item.quantity}
          onChange={(e) => {
            const newQuantity = parseInt(e.target.value);
            if (!isNaN(newQuantity) && newQuantity >= 0) {
              onUpdateQuantity(item.id, newQuantity);
            }
          }}
          className="w-16 text-center border rounded-md py-1"
          min="0"
        />
        <button
          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
          className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-300 focus:outline-none"
        >
          +
        </button>
        <button
          onClick={() => onRemoveItemCompletely(item.id)}
          className="text-red-600 hover:text-red-800 font-bold text-xl p-2 rounded-full hover:bg-red-100 transition-colors duration-300 ml-2"
          aria-label={`Hapus ${item.name} dari keranjang`}
        >
          &times;
        </button>
      </div>
    </div>
  );
};

/**
 * Custom Modal Component for displaying messages and transaction status.
 */
const CustomModal = ({ show, message, onClose, type = 'info' }) => {
  if (!show) return null;

  const bgColor = type === 'success' ? 'bg-green-100 border-green-400 text-green-700' :
    type === 'error' ? 'bg-red-100 border-red-400 text-red-700' :
      'bg-blue-100 border-blue-400 text-blue-700';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`relative ${bgColor} border rounded-lg shadow-xl p-8 max-w-md w-full`}>
        <p className="text-lg font-semibold text-center mb-6">{message}</p>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl font-bold"
          aria-label={`Close`}
        >
          &times;
        </button>
      </div>
    </div>
  );
};


/**
 * Komponen utama aplikasi E-commerce.
 * Mengelola state produk dan keranjang belanja, serta persistensi data.
 */
function App() {
  const [products] = useState(initialProducts);
  const [wallet, setWallet] = useState(""); // Alamat dompet yang terhubung

  // Fungsi untuk menghubungkan dompet
  const handleConnectWallet = async () => {
    const connectedAddress = await connectWallet();
    if (connectedAddress) {
      setWallet(connectedAddress);
    }
  }

  // Efek samping: Ambil saldo dompet saat terhubung atau alamat berubah
  useEffect(() => {
    const fetchBalance = async () => {
      if (wallet && window.ethereum) {
        try {
          const provider = new BrowserProvider(window.ethereum);
          const balance = await provider.getBalance(wallet);
          setWalletBalance(ethers.formatEther(balance));
        } catch (error) {
          console.error("Gagal mengambil saldo dompet:", error);
          setWalletBalance(null);
        }
      } else {
        setWalletBalance(null);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [wallet]);


  const [cartItems, setCartItems] = useState(() => {
    try {
      const storedCartItems = localStorage.getItem('cartItems');
      return storedCartItems ? JSON.parse(storedCartItems) : [];
    } catch (error) {
      console.error("Gagal memuat keranjang dari Local Storage:", error);
      return [];
    }
  });

  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info');
  const [isLoading, setIsLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);

  const [showCheckoutPage, setShowCheckoutPage] = useState(false);
  const [showOrdersPage, setShowOrdersPage] = useState(false);


  useEffect(() => {
    try {
      localStorage.setItem('cartItems', JSON.stringify(cartItems));
    } catch (error) {
      console.error("Gagal menyimpan keranjang ke Local Storage:", error);
    }
  }, [cartItems]);

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleAddToCart = (productToAdd) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === productToAdd.id);

      if (existingItem) {
        return prevItems.map((item) =>
          item.id === productToAdd.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prevItems, { ...productToAdd, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (idToUpdate, newQuantity) => {
    setCartItems((prevItems) => {
      if (newQuantity <= 0) {
        return prevItems.filter((item) => item.id !== idToUpdate);
      } else {
        return prevItems.map((item) =>
          item.id === idToUpdate ? { ...item, quantity: newQuantity } : item
        );
      }
    });
  };

  const removeItemCompletely = (idToRemove) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== idToRemove));
  };

  const handleProceedToCheckout = () => {
    if (!wallet) {
      setModalMessage("Please connect your wallet first to proceed to checkout.");
      setModalType('info');
      setShowModal(true);
      return;
    }
    if (cartItems.length === 0) {
      setModalMessage("Your cart is empty. Add items before checking out.");
      setModalType('info');
      setShowModal(true);
      return;
    }
    setShowCheckoutPage(true);
    setShowOrdersPage(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
    setModalType('info');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-inter antialiased">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight">
          Toko Yobel <span className="text-blue-600">Ganteng</span>
        </h1>
        <button
          onClick={handleConnectWallet}
          className='bg-blue-600 font-semibold text-white text-lg rounded-xl p-2 mt-4 hover:bg-blue-700 transition-colors duration-300'
        >
          {wallet ? `Connected: ${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}` : "Connect Wallet"}
        </button>
        {wallet && walletBalance !== null && (
          <p className="text-lg text-gray-700 mt-2">Saldo Anda: <span className="font-bold text-blue-700">{parseFloat(walletBalance).toFixed(4)} ETH</span></p>
        )}
        <p className="text-xl text-gray-600 mt-4">Pesan produk teknologi favorit Anda dengan mudah!</p>
      </header>

      <main className="container mx-auto">
        {/* Tombol navigasi antara Daftar Produk dan Daftar Order */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => { setShowOrdersPage(false); setShowCheckoutPage(false); }}
            className={`px-6 py-3 rounded-lg text-xl font-semibold transition-colors duration-300 ${!showOrdersPage && !showCheckoutPage ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
          >
            Daftar Produk
          </button>
          <button
            onClick={() => { setShowOrdersPage(true); setShowCheckoutPage(false); }}
            className={`px-6 py-3 rounded-lg text-xl font-semibold transition-colors duration-300 ${showOrdersPage ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
          >
            Daftar Order
          </button>
        </div>


        {/* Render halaman berdasarkan state */}
        {showCheckoutPage ? (
          <CheckoutPage
            cartItems={cartItems}
            total={total}
            address={wallet}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            walletBalance={walletBalance}
            setModalMessage={setModalMessage}
            setModalType={setModalType}
            setShowModal={setShowModal}
            onBackToCart={() => setShowCheckoutPage(false)}
            onCheckoutSuccess={() => {
              setCartItems([]);
              setShowCheckoutPage(false);
            }}
          />
        ) : showOrdersPage ? (
          <OrderListPage
            wallet={wallet}
            walletBalance={walletBalance}
            setModalMessage={setModalMessage}
            setModalType={setModalType}
            setShowModal={setShowModal}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-xl">
              <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 pb-3 border-blue-200">Produk Tersedia</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} />
                ))}
              </div>
            </section>

            <aside className="lg:col-span-1 bg-white p-8 rounded-2xl shadow-xl">
              <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 pb-3 border-blue-200">Keranjang Belanja</h2>
              {cartItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Keranjang Anda kosong. Mulai belanja sekarang!</p>
              ) : (
                <>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {cartItems.map((item) => (
                      <CartItem
                        key={item.id}
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemoveItemCompletely={removeItemCompletely}
                      />
                    ))}
                  </div>
                  <div className="border-t-2 border-blue-200 pt-6 mt-6">
                    <p className="text-2xl font-bold text-gray-900 flex justify-between items-center">
                      Total:
                      <span className="text-blue-700">{total.toFixed(4)} ETH</span>
                    </p>
                    <button
                      className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg text-xl font-semibold hover:bg-green-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleProceedToCheckout}
                      disabled={!wallet || cartItems.length === 0}
                    >
                      Checkout
                    </button>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </main>

      <footer className="text-center mt-16 text-gray-600 text-sm">
        <p>&copy; 2025 Toko Yobel Ganteng. Dibuat dengan ❤️ oleh Patrick.</p>
      </footer>

      <CustomModal
        show={showModal}
        message={modalMessage}
        onClose={closeModal}
        type={modalType}
      />
    </div>
  );
}

export default App;