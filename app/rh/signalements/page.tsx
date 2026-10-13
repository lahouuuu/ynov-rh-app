'use client';
import { ListeSignalements } from '../../../components/ListeSignalements';
import { Carte, EnTetePage } from '../../../components/ui';

export default function PageRhSignalements() {
  return (
    <>
      <EnTetePage titre="Absences et retards" sousTitre="Examinez les justificatifs, qualifiez les signalements et clôturez-les." />
      <Carte><ListeSignalements vue="rh" afficherCollaborateur /></Carte>
    </>
  );
}
