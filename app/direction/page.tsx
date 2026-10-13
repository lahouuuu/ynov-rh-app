'use client';
import { ListeDemandes } from '../../components/ListeDemandes';
import { Carte, EnTetePage, LienBouton } from '../../components/ui';

export default function PageDirection() {
  return (
    <>
      <EnTetePage
        titre="Fiches de congé à signer"
        sousTitre="Congés approuvés par les RH qui attendent l’accord de la direction régionale. Ouvrez la fiche pour la signer ou la refuser."
        actions={<LienBouton href="/planning?vue=direction" variante="secondaire">Planning</LienBouton>}
      />
      <Carte>
        <ListeDemandes vue="direction" filtreFiche="attente_direction" afficherCollaborateur lienFiche />
      </Carte>
    </>
  );
}
