'use client';
/**
 * Contexte de session : utilisateur Firebase + profil applicatif (/api/moi).
 * Le profil sert uniquement à adapter l'interface ; chaque action est
 * revérifiée par l'API.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from './firebase';
import { api, ErreurApi, messageErreur } from './api';
import type { Profil } from './types';

interface Session {
  utilisateur: User | null;
  profil: Profil | null;
  chargement: boolean;
  erreur: string | null;
  rafraichir: () => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Session | null>(null);

export function FournisseurSession({ children }: { children: React.ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<User | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerProfil = useCallback(async () => {
    try {
      setProfil(await api.get<Profil>('/moi'));
      setErreur(null);
    } catch (e) {
      setProfil(null);
      setErreur(messageErreur(e));
      // Compte désactivé ou inconnu : on ferme la session
      if (e instanceof ErreurApi && (e.statut === 401 || e.statut === 403)) await signOut(auth);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUtilisateur(u);
      if (u) await chargerProfil();
      else setProfil(null);
      setChargement(false);
    });
  }, [chargerProfil]);

  // Déconnexion automatique après inactivité (postes partagés, oubli de session)
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!utilisateur) return;
    const delai = Number(process.env.NEXT_PUBLIC_INACTIVITE_MINUTES ?? 30) * 60_000;
    const relancer = () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(async () => {
        await signOut(auth);
        router.replace('/?session=expiree');
      }, delai);
    };
    const evenements = ['mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];
    evenements.forEach((e) => window.addEventListener(e, relancer, { passive: true }));
    relancer();
    return () => {
      evenements.forEach((e) => window.removeEventListener(e, relancer));
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [utilisateur, router]);

  const valeur: Session = {
    utilisateur,
    profil,
    chargement,
    erreur,
    rafraichir: chargerProfil,
    deconnecter: async () => {
      await signOut(auth);
      setProfil(null);
    },
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession doit être utilisé dans FournisseurSession');
  return s;
}
