// src/App.jsx
import React, { useState, useEffect } from 'react';

const initialProducts = [
  { id: 1, name: 'Laptop Gaming', price: 15000000, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Laptop' },
  { id: 2, name: 'Smartphone Terbaru', price: 8000000, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Phone' },
  { id: 3, name: 'Smartwatch Premium', price: 2500000, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Watch' },
  { id: 4, name: 'Headphone Nirkabel', price: 1200000, imageUrl: 'https://placehold.co/200x200/F0F0F0/000000?text=Headphone' },
];

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
        Rp {product.price.toLocaleString('id-ID')}
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

const CartItem = ({ item, onRemoveFromCart }) => {
  return (
    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg shadow-sm mb-3">
      <div className="flex items-center">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-16 h-16 object-cover rounded-md mr-4"
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/100x100/D0D0D0/555555?text=No+Image'; }}
        />
        <div>
          <h4 className="text-lg font-medium text-gray-800">{item.name}</h4>
          <p className="text-gray-600">
            Rp {item.price.toLocaleString('id-ID')} x {item.quantity}
          </p>
        </div>
      </div>
      <button
        onClick={() => onRemoveFromCart(item.id)}
        className="text-red-600 hover:text-red-800 font-bold text-xl p-2 rounded-full hover:bg-red-100 transition-colors duration-300"
        aria-label={`Hapus ${item.name} dari keranjang`}
      >
        &times;
      </button>
    </div>
  );
};

function App() {
  const [products] = useState(initialProducts);
  const [cartItems, setCartItems] = useState([]);
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);


  const addToCart = (productToAdd) => {
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

  const removeFromCart = (idToRemove) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === idToRemove);

      if (existingItem && existingItem.quantity > 1) {
        return prevItems.map((item) =>
          item.id === idToRemove ? { ...item, quantity: item.quantity - 1 } : item
        );
      } else {
        return prevItems.filter((item) => item.id !== idToRemove);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-inter antialiased">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight">
          Toko Elektronik <span className="text-blue-600">React</span>
        </h1>
        <p className="text-xl text-gray-600 mt-4">Pesan produk teknologi favorit Anda dengan mudah!</p>
      </header>

      <main className="container mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bagian Daftar Produk */}
        <section className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-xl">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 pb-3 border-blue-200">Daftar Produk</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
            ))}
          </div>
        </section>

        {/* Bagian Keranjang Belanja */}
        <aside className="lg:col-span-1 bg-white p-8 rounded-2xl shadow-xl">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 pb-3 border-blue-200">Keranjang Belanja</h2>
          {cartItems.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Keranjang Anda kosong. Mulai belanja sekarang!</p>
          ) : (
            <>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {cartItems.map((item) => (
                  <CartItem key={item.id} item={item} onRemoveFromCart={removeFromCart} />
                ))}
              </div>
              <div className="border-t-2 border-blue-200 pt-6 mt-6">
                <p className="text-2xl font-bold text-gray-900 flex justify-between items-center">
                  Total:
                  <span className="text-blue-700">Rp {total.toLocaleString('id-ID')}</span>
                </p>
                <button
                  className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg text-xl font-semibold hover:bg-green-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                  onClick={() => alert('Fitur checkout belum diimplementasikan!')}
                >
                  Checkout
                </button>
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="text-center mt-16 text-gray-600 text-sm">
        <p>&copy; 2025 Toko Elektronik React. Dibuat dengan ❤️ oleh Gemini.</p>
      </footer>
    </div>
  );
}

export default App;
