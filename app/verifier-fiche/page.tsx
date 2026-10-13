'use client';
/** Contrôle d'authenticité d'une fiche F031 imprimée (numéro + code de vérification). */
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import type { Fiche } from '../../lib/types';
import { Alerte, Bouton, Carte, Champ, classeSaisie, EnTetePage } from '../../components/ui';

type Resultat = { valide: true; fiche: Fiche } | { valide: false; fiche: { numero: string; etat: string } };

export default function PageVerifierFiche() {
  const [numero, setNumero] = useState('');
  const [code, setCode] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const action = useAction();

  async function verifier(e: React.FormEvent) {
    e.preventDefault();
    setResultat(null);
    const r = await action.executer(() =>
      api.get<Resultat>(`/demandes/fiches/verifier?numero=${encodeURIComponent(numero.trim())}&code=${encodeURIComponent(code.trim())}`),
    );
    if (r) setResultat(r);
  }

  return (
    <>
      <EnTetePage titre="Vérifier une fiche de congé" sousTitre="Saisissez le numéro et le code imprimés en bas de la fiche pour contrôler qu’elle n’a pas été modifiée." />
      <Carte className="max-w-2xl">
        <form onSubmit={verifier} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="N° de fiche" aide="Ex. : 2026-0012">{(id) => <input id={id} value={numero} onChange={(e) => setNumero(e.target.value)} className={`${classeSaisie} font-mono`} required />}</Champ>
            <Champ label="Code de vérification" aide="Ex. : 1A2B-3C4D-5E6F-7A8B">{(id) => <input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${classeSaisie} font-mono`} required />}</Champ>
          </div>
          <Bouton type="submit" enCours={action.enCours} disabled={!numero || !code}>Vérifier</Bouton>
        </form>
        <div className="mt-4 space-y-3">
          {action.erreur && <Alerte>{action.erreur}</Alerte>}
          {resultat?.valide && (
            <Alerte ton="succes" titre="Fiche authentique et à jour">
              <p>
                {resultat.fiche.contenu.prenom} {resultat.fiche.contenu.nom} — {resultat.fiche.contenu.periode} — {resultat.fiche.etat}.
              </p>
              <p className="mt-2">
                <Link className="font-semibold underline" href={`/conges/fiche?id=${resultat.fiche.id}`}>Ouvrir la fiche en ligne</Link>
              </p>
            </Alerte>
          )}
          {resultat && !resultat.valide && (
            <Alerte titre="Code invalide">
              Le code ne correspond pas à la fiche n° {resultat.fiche.numero} telle qu’elle est enregistrée ({resultat.fiche.etat.toLowerCase()}). Le document a pu être modifié, ou il s’agit d’une version antérieure : référez-vous à la fiche en ligne.
            </Alerte>
          )}
        </div>
      </Carte>
    </>
  );
}
