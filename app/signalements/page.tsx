'use client';
import { ListeSignalements } from '../../components/ListeSignalements';
import { Carte, EnTetePage, LienBouton } from '../../components/ui';

export default function PageMesSignalements() {
  return (
    <>
      <EnTetePage
        titre="Absences et retards"
        sousTitre="Un signalement est enregistré immédiatement et transmis à votre responsable et aux RH. Il ne vaut ni congé ni absence justifiée."
        actions={<LienBouton href="/signalements/nouveau">Nouveau signalement</LienBouton>}
      />
      <Carte><ListeSignalements vue="moi" /></Carte>
    </>
  );
}
