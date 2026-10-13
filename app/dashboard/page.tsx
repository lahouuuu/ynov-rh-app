'use client';
/** Tableau de bord adapté aux rôles de l'utilisateur connecté. */
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { aLeRole } from '../../lib/roles';
import { jours } from '../../lib/format';
import { Alerte, Chargement, EnTetePage, LienBouton, Statistique } from '../../components/ui';

interface TableauDeBord {
  annee: number;
  collaborateur: { solde: number; joursAttribues: number; demandesEnAttente: number; signalementsOuverts: number; justificatifsAFournir: number };
  responsable?: { avisEnAttente: number; signalementsEquipe: number };
  rh?: { decisionsEnAttente: number; annulationsDemandees: number; signalementsATraiter: number; justificatifsAExaminer: number };
  direction?: { fichesASigner: number };
  admin?: { comptesActifs: number; comptesDesactives: number };
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gris-500">{titre}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

export default function PageTableauDeBord() {
  const { profil } = useSession();
  const { donnees: t, erreur, chargement } = useApi<TableauDeBord>('/tableau-de-bord');

  return (
    <>
      <EnTetePage
        titre={`Bonjour ${profil?.prenom ?? ''}`}
        sousTitre="Voici l’essentiel de votre activité."
        actions={
          <>
            <LienBouton href="/conges/nouvelle">Demander un congé</LienBouton>
            <LienBouton href="/signalements/nouveau" variante="secondaire">Signaler une absence ou un retard</LienBouton>
          </>
        }
      />
      {erreur && <Alerte>{erreur}</Alerte>}
      {chargement && !t && <Chargement />}
      {t && (
        <>
          <Section titre={`Mes congés ${t.annee}`}>
            <Statistique libelle="Solde disponible" valeur={jours(t.collaborateur.solde)} detail={`sur ${jours(t.collaborateur.joursAttribues)} attribués`} href="/conges" accent />
            <Statistique libelle="Demandes en attente" valeur={t.collaborateur.demandesEnAttente} href="/conges" />
            <Statistique libelle="Signalements ouverts" valeur={t.collaborateur.signalementsOuverts} href="/signalements" />
            <Statistique libelle="Justificatifs attendus" valeur={t.collaborateur.justificatifsAFournir} href="/signalements" />
          </Section>
          {t.responsable && aLeRole(profil, 'responsable') && (
            <Section titre="Mon équipe">
              <Statistique libelle="Avis à émettre" valeur={t.responsable.avisEnAttente} href="/equipe" accent={t.responsable.avisEnAttente > 0} />
              <Statistique libelle="Signalements en cours" valeur={t.responsable.signalementsEquipe} href="/equipe?onglet=signalements" />
            </Section>
          )}
          {t.rh && (
            <Section titre="Ressources humaines">
              <Statistique libelle="Congés à décider" valeur={t.rh.decisionsEnAttente} href="/rh" accent={t.rh.decisionsEnAttente > 0} />
              <Statistique libelle="Annulations demandées" valeur={t.rh.annulationsDemandees} href="/rh?statut=approuvee" />
              <Statistique libelle="Signalements à traiter" valeur={t.rh.signalementsATraiter} href="/rh/signalements" />
              <Statistique libelle="Justificatifs à examiner" valeur={t.rh.justificatifsAExaminer} href="/rh/signalements" />
            </Section>
          )}
          {t.direction && (
            <Section titre="Direction régionale">
              <Statistique libelle="Fiches à signer" valeur={t.direction.fichesASigner} href="/direction" accent={t.direction.fichesASigner > 0} />
              <Statistique libelle="Vérifier une fiche" valeur="✓" detail="Contrôle d’authenticité" href="/verifier-fiche" />
            </Section>
          )}
          {t.admin && (
            <Section titre="Administration">
              <Statistique libelle="Comptes actifs" valeur={t.admin.comptesActifs} href="/admin/comptes" />
              <Statistique libelle="Comptes désactivés" valeur={t.admin.comptesDesactives} href="/admin/comptes" />
            </Section>
          )}
        </>
      )}
    </>
  );
}
