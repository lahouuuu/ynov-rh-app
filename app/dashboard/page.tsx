'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('conge_paye');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const [requests, setRequests] = useState<any[]>([]);

  const fetchRequests = async (userEmail: string) => {
    try {
      const q = query(
        collection(db, 'demandes_conges'), 
        where('email_collaborateur', '==', userEmail)
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      data.sort((a: any, b: any) => b.date_debut.localeCompare(a.date_debut));
      setRequests(data);
    } catch (error) {
      console.error("Erreur de récupération :", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/'); 
      } else {
        setUser(currentUser);
        if (currentUser.email) {
          fetchRequests(currentUser.email);
        }
        setLoading(false); 
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return alert("Veuillez remplir les dates.");
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'demandes_conges'), {
        email_collaborateur: user?.email,
        date_debut: startDate,
        date_fin: endDate,
        motif: reason,
        statut: 'En attente',
        date_demande: serverTimestamp()
      });
      
      setSuccessMessage('Votre demande a été envoyée avec succès !');
      setStartDate('');
      setEndDate('');
      
      if (user?.email) fetchRequests(user.email);
      
      setTimeout(() => setSuccessMessage(''), 3000); 
    } catch (error) {
      console.error("Erreur d'ajout :", error);
      alert("Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23b2a4]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-md p-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-black">Espace Collaborateur</h1>
            <p className="text-gray-800 mt-2 font-medium">
              Connecté en tant que : <span className="font-bold text-[#23b2a4]">{user?.email}</span>
            </p>
          </div>
          <button 
            onClick={() => auth.signOut()} 
            className="px-4 py-2 border border-gray-400 rounded-md text-black hover:bg-gray-100 transition-colors text-sm font-semibold"
          >
            Se déconnecter
          </button>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg border border-gray-300 mb-8">
          <h2 className="text-xl font-bold text-black mb-6">Nouvelle demande de congé</h2>
          
          {successMessage && (
            <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-md border border-green-300 font-medium">
              {successMessage}
            </div>
          )}
          
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">Date de début</label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-400 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-[#23b2a4]" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">Date de fin</label>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-400 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-[#23b2a4]" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">Motif de l'absence</label>
              <select 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-400 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-[#23b2a4] bg-white"
              >
                <option value="conge_paye">Congé payé</option>
                <option value="maladie">Arrêt maladie</option>
                <option value="exceptionnel">Événement familial exceptionnel</option>
                <option value="sans_solde">Congé sans solde</option>
              </select>
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full md:w-auto px-6 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors font-bold shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Envoi en cours...' : 'Soumettre la demande'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-300">
          <h2 className="text-xl font-bold text-black mb-6">Historique de mes demandes</h2>
          
          {requests.length === 0 ? (
            <p className="text-gray-800 font-medium">Aucune demande n'a été soumise pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-gray-900">
                    <th className="py-3 px-2 font-bold">Date de début</th>
                    <th className="py-3 px-2 font-bold">Date de fin</th>
                    <th className="py-3 px-2 font-bold">Motif</th>
                    <th className="py-3 px-2 font-bold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b border-gray-200 text-gray-800 font-medium">
                      <td className="py-3 px-2">{req.date_debut}</td>
                      <td className="py-3 px-2">{req.date_fin}</td>
                      <td className="py-3 px-2 capitalize">{req.motif.replace('_', ' ')}</td>
                      <td className="py-3 px-2">
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold border border-yellow-300">
                          {req.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}