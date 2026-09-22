'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Écouteur d'état d'authentification Firebase
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Utilisateur non connecté : retour à l'accueil
        router.push('/'); 
      } else {
        // Utilisateur identifié : on lève le rideau
        setLoading(false); 
      }
    });

    return () => unsubscribe(); // Nettoyage
  }, [router]);

  // Écran d'attente pendant la vérification
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23b2a4]"></div>
      </div>
    );
  }

  // Le vrai contenu sécurisé
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center" style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <h1 className="text-3xl font-bold text-[#1d1d1e] mb-4">Bienvenue sur l'espace RH</h1>
      <p className="text-gray-600 mb-8">Votre tableau de bord sécurisé est en cours de construction.</p>
      
      <button 
        onClick={() => auth.signOut()} 
        className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  );
}