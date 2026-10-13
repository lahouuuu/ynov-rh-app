import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Protection des données — Ynov RH' };

/**
 * Notice d'information (loi n° 09-08 relative à la protection des personnes
 * physiques à l'égard du traitement des données à caractère personnel).
 * Contenu à valider par l'établissement avant une mise en production réelle.
 */
export default function PageConfidentialite() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-ynov-noir">
      <Link href="/" className="text-sm font-semibold text-ynov-turquoise-fonce hover:underline">← Retour</Link>
      <h1 className="mt-4 text-2xl font-bold">Protection des données personnelles</h1>
      <p className="mt-2 text-gris-600">Notice d’information — à valider par Maroc Ynov Campus avant toute utilisation avec des données réelles.</p>

      <h2 className="mt-8 text-lg font-bold">Responsable du traitement et finalité</h2>
      <p className="mt-2">
        Maroc Ynov Campus traite ces données pour gérer les congés, absences et retards de son personnel : droits annuels, demandes et décisions,
        signalements, justificatifs, notifications et historique des décisions. Le traitement est réalisé conformément à la loi n° 09-08 et, le cas
        échéant, aux déclarations ou autorisations de la CNDP.
      </p>

      <h2 className="mt-6 text-lg font-bold">Données traitées</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Identité professionnelle : nom, prénom, adresse e-mail, fonction, campus, service, responsable.</li>
        <li>Congés : dates, durée, solde, répartition payée / non payée, avis et décisions, visas électroniques.</li>
        <li>Absences et retards : dates, heures, motif, commentaire et justificatifs éventuels.</li>
        <li>Journal technique : actions réalisées (auteur, date), consultations de justificatifs.</li>
      </ul>

      <h2 className="mt-6 text-lg font-bold">Destinataires et confidentialité</h2>
      <p className="mt-2">
        Chaque personne n’accède qu’aux dossiers de son périmètre : le collaborateur à ses propres dossiers, le responsable à ceux de son équipe,
        les gestionnaires RH et la direction régionale aux campus qui leur sont confiés. Les justificatifs, et en particulier les pièces médicales,
        ne sont accessibles qu’au déposant et aux gestionnaires RH habilités ; l’administrateur technique n’y a pas accès. Toute consultation d’un
        justificatif par un tiers est tracée.
      </p>

      <h2 className="mt-6 text-lg font-bold">Sécurité</h2>
      <p className="mt-2">
        Connexion par compte individuel, contrôle des droits sur le serveur à chaque requête, chiffrement des échanges (HTTPS), fichiers stockés de
        manière privée, déconnexion automatique après inactivité, visas électroniques horodatés et code de vérification des fiches.
      </p>

      <h2 className="mt-6 text-lg font-bold">Durée de conservation</h2>
      <p className="mt-2">
        Les dossiers sont conservés pendant la durée nécessaire à la gestion administrative du personnel et aux obligations légales applicables,
        selon la politique de conservation définie par l’établissement.
      </p>

      <h2 className="mt-6 text-lg font-bold">Vos droits</h2>
      <p className="mt-2">
        Vous disposez d’un droit d’accès, de rectification et d’opposition pour motifs légitimes. Pour l’exercer, adressez-vous au service des
        ressources humaines de votre campus.
      </p>
    </main>
  );
}
