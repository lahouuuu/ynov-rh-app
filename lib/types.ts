export type Role = 'collaborateur' | 'responsable' | 'rh' | 'direction' | 'admin';

export interface Profil {
  uid: string;
  email: string;
  nom: string;
  prenom: string;
  nomComplet: string;
  roles: Role[];
  campusId: string;
  serviceId: string;
  fonction: string;
  managerId: string | null;
  actif: boolean;
  perimetreRh: { tous: boolean; campusIds: string[] };
  notificationsNonLues?: number;
  /** Invitation en attente : mot de passe provisoire à remplacer. */
  motDePasseProvisoire?: boolean;
  provisoireExpireLe?: string | null;
  invitationExpiree?: boolean;
}

export interface ResultatInvitation {
  envoyee: boolean;
  destinataire: string;
  expireLe: string;
  motDePasseProvisoire?: string;
}

export interface Plage { debut: string; fin: string; jours: number }

export interface Repartition {
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
  plagesPayees: Plage[];
  plagesNonPayees: Plage[];
}

export interface Demande extends Repartition {
  id: string;
  userId: string;
  userNom: string;
  managerId: string | null;
  campusId: string;
  serviceId: string;
  type: 'conge_paye' | 'conge_sans_solde';
  annee: number;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  commentaire: string;
  interim?: string;
  ficheNumero?: string | null;
  ficheStatut?: 'attente_direction' | 'signee' | 'refusee_direction' | 'annulee' | null;
  statut: string;
  accordNonPaye: boolean;
  reconfirmationRequise: boolean;
  groupeId: string | null;
  avis: null | { favorable: boolean; commentaire: string; auteurNom: string; date: string };
  decision: null | { statut: string; motif: string; auteurNom: string; date: string; par?: 'responsable' | 'rh' };
  annulation: null | { demandeeLe: string; motif: string };
  createdAt?: string;
  soumiseLe?: string | null;
}

export interface PeriodeSimulee {
  annee: number;
  dateDebut: string;
  dateFin: string;
  soldeAvant: number;
  enAttente: number;
  soldePrevisionnel: number;
  soldeApres: number;
  repartition: Repartition;
}

export interface Simulation {
  reprise?: string;
  periodes: PeriodeSimulee[];
  scindee: boolean;
  insuffisant: boolean;
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
}

export interface Signalement {
  id: string;
  userId: string;
  userNom: string;
  managerId: string | null;
  campusId: string;
  type: 'absence' | 'retard';
  categorie: string;
  categorieLibelle: string;
  medical: boolean;
  dateDebut: string;
  dateFin: string | null;
  dureeEstimee: string;
  commentaire: string;
  retard: null | { heurePrevue: string; heureArriveeEstimee: string | null; heureArriveeReelle: string | null; minutes: number | null };
  aPosteriori: boolean;
  statutTraitement: string;
  qualification: string;
  justificatifStatut: string;
  echeanceJustificatif: string | null;
  priseConnaissance: null | { parNom: string; date: string };
  imputation?: null | { jours: number; annee: number; parNom: string; date: string };
  decision: null | { qualification: string; motif: string; auteurNom: string; date: string };
  nbJustificatifs: number;
  declareLe: string;
}

export interface Justificatif {
  id: string;
  userId: string;
  dossierType: 'demande' | 'signalement';
  dossierId: string;
  nomFichier: string;
  contentType: string;
  taille: number;
  medical: boolean;
  statut: 'recu_a_examiner' | 'accepte' | 'refuse';
  motifDecision: string | null;
  deposeLe: string;
}

export interface EntreeHistorique {
  id: string;
  action: string;
  resume: string;
  motif: string | null;
  details: Record<string, unknown>;
  auteurNom: string;
  date: string | null;
}

export interface Page<T> { elements: T[]; suivant: string | null }

export interface Dotation {
  annee: number;
  joursAttribues: number;
  ajustements: number;
  joursDebites: number;
  solde: number;
  enAttente: number;
  soldePrevisionnel: number;
  initialisee: boolean;
  mouvements: Array<{ id: string; type: string; jours: number; motif: string; auteurNom: string; date: string; soldeApres: number | null }>;
}

export interface Parametres {
  dotationParDefaut: number;
  joursOuvres: number[];
  joursFeries: string[];
  categories: Array<{ code: string; libelle: string; type: 'absence' | 'retard'; justificatif: string; delaiJustificatifJours: number; medical: boolean }>;
  justificatifs: { tailleMaxOctets: number; maxParDossier: number; typesAutorises: string[] };
  fiche: ParametresFiche;
}

export interface ParametresFiche {
  entite: string;
  titre: string;
  dateApplication: string;
  version: string;
  code: string;
  libelleRaf: string;
  signataireRaf: string;
  libelleDirection: string;
  signataireDirection: string;
}

export interface Referentiels {
  campus: Array<{ id: string; nom: string }>;
  services: Array<{ id: string; nom: string }>;
  responsables: Array<{ uid: string; nomComplet: string }>;
}

export interface VisaAffiche {
  nom: string;
  fonction: string;
  date: string | null;
  dateCourte: string;
  heure: string;
}

export interface Fiche {
  id: string;
  numero: string;
  contenu: {
    numero: string; nom: string; prenom: string; fonction: string; annee: string; nombreJours: string;
    periode: string; reprise: string; resteAcquis: string; interim: string; signataireEmploye: string; dateEmploye: string;
  };
  visas: { employe: VisaAffiche | null; raf: VisaAffiche | null; direction: VisaAffiche | null };
  accordDirection: { du: string; au: string } | null;
  statut: string;
  statutLibelle: string;
  ficheStatut: string | null;
  etat: string;
  definitive: boolean;
  code: string;
  parametres: ParametresFiche;
}
