'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useApp } from '@/context/AppContext';
import { useState } from 'react';

export default function Navbar() {
  const { config, user, cartCount, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand / Logo — agent sets logoUrl and businessName */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            {config?.logoUrl
              ? <Image src={config.logoUrl} alt={config.businessName} width={32} height={32} className="rounded" />
              : null}
            <span className="truncate max-w-45">{config?.businessName ?? 'BizStore'}</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-700">
            <Link href="/shop" className="hover:text-gray-900 transition-colors">Shop</Link>
            {user ? (
              <>
                <Link href="/orders" className="hover:text-gray-900 transition-colors">Orders</Link>
                <Link href="/account" className="hover:text-gray-900 transition-colors">Account</Link>
                {user.role === 'ADMIN' && (
                  <Link href="/store-admin" className="hover:text-gray-900 transition-colors font-semibold text-primary">Admin</Link>
                )}
                <span className="text-gray-300">|</span>
                <span className="text-gray-500 text-xs">{user.name}</span>
                <button onClick={logout} className="text-red-500 hover:text-red-700 transition-colors">Logout</button>
              </>
            ) : (
              <Link href="/auth" className="hover:text-gray-900 transition-colors">Login</Link>
            )}
            <Link href="/cart" className="relative hover:text-gray-900 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m12-9l2 9M9 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded text-gray-600 hover:bg-gray-100"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t px-4 pb-4 space-y-1 text-sm font-medium text-gray-700">
          <Link href="/shop" className="block py-2 hover:text-gray-900" onClick={() => setMenuOpen(false)}>Shop</Link>
          <Link href="/cart" className="block py-2 hover:text-gray-900" onClick={() => setMenuOpen(false)}>
            Cart {cartCount > 0 && <span className="text-xs font-bold text-primary">({cartCount})</span>}
          </Link>
          {user ? (
            <>
              <Link href="/orders" className="block py-2 hover:text-gray-900" onClick={() => setMenuOpen(false)}>Orders</Link>
              <Link href="/account" className="block py-2 hover:text-gray-900" onClick={() => setMenuOpen(false)}>Account</Link>
              {user.role === 'ADMIN' && (
                <Link href="/store-admin" className="block py-2 font-semibold text-primary" onClick={() => setMenuOpen(false)}>Admin Panel</Link>
              )}
              <div className="py-2 text-xs text-gray-500">{user.name}</div>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="block w-full text-left py-2 text-red-500 hover:text-red-700"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/auth" className="block py-2 hover:text-gray-900" onClick={() => setMenuOpen(false)}>Login</Link>
          )}
        </div>
      )}
    </nav>
  );
}
