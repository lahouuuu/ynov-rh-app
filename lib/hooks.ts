'use client';
/**
 * Hooks de chargement de données. L'état est indexé par la « clé » de la
 * requête (chemin + version) : l'indicateur de chargement est dérivé, et les
 * mises à jour d'état n'ont lieu que dans les callbacks asynchrones.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, messageErreur } from './api';
import type { Page } from './types';

/** Charge une ressource de l'API ; `chemin` null = ne rien charger. */
export function useApi<T>(chemin: string | null) {
  const [version, setVersion] = useState(0);
  const cle = `${chemin}#${version}`;
  const [etat, setEtat] = useState<{ cle: string; donnees: T | null; erreur: string | null }>({ cle: '', donnees: null, erreur: null });
  const attentes = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!chemin) return;
    let actif = true;
    api.get<T>(chemin).then(
      (donnees) => actif && setEtat({ cle, donnees, erreur: null }),
      (e) => actif && setEtat((p) => ({ cle, donnees: p.donnees, erreur: messageErreur(e) })),
    ).finally(() => {
      attentes.current.splice(0).forEach((r) => r());
    });
    return () => {
      actif = false;
    };
  }, [chemin, cle]);

  const recharger = useCallback(
    () =>
      new Promise<void>((resolve) => {
        attentes.current.push(resolve);
        setVersion((v) => v + 1);
      }),
    [],
  );

  return {
    donnees: chemin ? etat.donnees : null,
    erreur: chemin ? etat.erreur : null,
    chargement: !!chemin && etat.cle !== cle,
    recharger,
  };
}

/** Liste paginée (« Afficher plus ») ; se réinitialise quand le chemin change. */
export function useListePaginee<T>(chemin: string | null) {
  const [version, setVersion] = useState(0);
  const cle = `${chemin}#${version}`;
  const [etat, setEtat] = useState<{ cle: string; elements: T[]; suivant: string | null; erreur: string | null }>({
    cle: '', elements: [], suivant: null, erreur: null,
  });
  const [chargementSuite, setChargementSuite] = useState(false);

  const url = useCallback(
    (curseur?: string) => {
      const sep = chemin!.includes('?') ? '&' : '?';
      return `${chemin}${curseur ? `${sep}curseur=${encodeURIComponent(curseur)}` : ''}`;
    },
    [chemin],
  );

  useEffect(() => {
    if (!chemin) return;
    let actif = true;
    api.get<Page<T>>(url()).then(
      (r) => actif && setEtat({ cle, elements: r.elements, suivant: r.suivant, erreur: null }),
      (e) => actif && setEtat({ cle, elements: [], suivant: null, erreur: messageErreur(e) }),
    );
    return () => {
      actif = false;
    };
  }, [chemin, cle, url]);

  const plus = async () => {
    if (!etat.suivant) return;
    setChargementSuite(true);
    try {
      const r = await api.get<Page<T>>(url(etat.suivant));
      setEtat((p) => ({ ...p, elements: [...p.elements, ...r.elements], suivant: r.suivant }));
    } catch (e) {
      setEtat((p) => ({ ...p, erreur: messageErreur(e) }));
    } finally {
      setChargementSuite(false);
    }
  };

  const aJour = etat.cle === cle;
  return {
    elements: aJour ? etat.elements : [],
    erreur: aJour ? etat.erreur : null,
    chargement: (!!chemin && !aJour) || chargementSuite,
    aSuivant: aJour && !!etat.suivant,
    plus,
    recharger: () => setVersion((v) => v + 1),
  };
}

/** Exécute une action (POST…) en gérant l'état « en cours » et l'erreur. */
export function useAction() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const executer = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setEnCours(true);
    setErreur(null);
    try {
      return await fn();
    } catch (e) {
      setErreur(messageErreur(e));
      return undefined;
    } finally {
      setEnCours(false);
    }
  }, []);
  return { enCours, erreur, setErreur, executer };
}
