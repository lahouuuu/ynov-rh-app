'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListeDemandes } from '../../components/ListeDemandes';
import { ListeSignalements } from '../../components/ListeSignalements';
import { Carte, Chargement, EnTetePage, Onglets } from '../../components/ui';

function Contenu() {
  const initial = useSearchParams().get('onglet') === 'signalements' ? 'signalements' : 'demandes';
  const [onglet, setOnglet] = useState<'demandes' | 'signalements'>(initial);
  return (
    <>
      <EnTetePage titre="Mon équipe" sousTitre="Émettez un avis sur les congés et prenez connaissance des signalements de votre équipe. La décision finale revient aux RH." />
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ valeur: 'demandes', libelle: 'Demandes de congé' }, { valeur: 'signalements', libelle: 'Absences et retards' }]} />
      <Carte>
        {onglet === 'demandes' ? <ListeDemandes vue="equipe" statutInitial="soumise" afficherCollaborateur /> : <ListeSignalements vue="equipe" afficherCollaborateur />}
      </Carte>
    </>
  );
}

export default function PageEquipe() {
  return <Suspense fallback={<Chargement />}><Contenu /></Suspense>;
}
