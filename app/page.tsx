'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert('Connexion réussie !');
    } catch (err: any) {
      setError('Identifiants incorrects ou compte inexistant.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image 
            src="/logo Maroc Ynov Campus transparent - Copie (2).png" 
            alt="Maroc Ynov Campus" 
            width={200} 
            height={100} 
            priority
          />
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-6" style={{ color: '#1d1d1e' }}>
          Espace RH
        </h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Courriel</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#23b2a4]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#23b2a4]"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-white font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#1d1d1e' }}
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}