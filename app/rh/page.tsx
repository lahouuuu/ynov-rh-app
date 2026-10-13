'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListeDemandes } from '../../components/ListeDemandes';
import { Carte, Chargement, EnTetePage, LienBouton } from '../../components/ui';

function Contenu() {
  const statut = useSearchParams().get('statut') ?? 'en_decision_rh';
  return (
    <>
      <EnTetePage
        titre="Demandes de congé"
        sousTitre="Décidez des demandes de votre périmètre. Le solde est revérifié par le serveur à chaque approbation."
        actions={<LienBouton href="/planning?vue=rh" variante="secondaire">Voir le planning</LienBouton>}
      />
      <Carte><ListeDemandes key={statut} vue="rh" statutInitial={statut} afficherCollaborateur /></Carte>
    </>
  );
}

export default function PageRhDemandes() {
  return <Suspense fallback={<Chargement />}><Contenu /></Suspense>;
}
