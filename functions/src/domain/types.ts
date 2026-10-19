/**
 * Types métier partagés par l'API.
 * Les dates « métier » (jours de congé, dates d'absence) sont des chaînes ISO
 * « AAAA-MM-JJ » sans fuseau : elles désignent un jour du calendrier marocain.
 * Les instants (dépôt, décision…) sont des Timestamp Firestore, affichés côté
 * client dans le fuseau Africa/Casablanca.
 */

export const ROLES = ['collaborateur', 'responsable', 'rh', 'direction', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Périmètre d'un gestionnaire RH ou d'un membre de la direction régionale. */
export interface PerimetreRh {
  /** true : couvre tous les campus. */
  tous: boolean;
  /** Campus confiés lorsque `tous` est faux. */
  campusIds: string[];
}

export interface Utilisateur {
  uid: string;
  email: string;
  nom: string;
  prenom: string;
  roles: Role[];
  campusId: string;
  serviceId: string;
  /** Intitulé du poste (affiché sur la fiche de congé). */
  fonction: string;
  /** Responsable hiérarchique (uid) ; null si aucun n'est désigné. */
  managerId: string | null;
  actif: boolean;
  perimetreRh: PerimetreRh;
  /** Mot de passe provisoire (invitation) : à changer avant toute autre action. */
  motDePasseProvisoire?: boolean;
  /** Échéance du mot de passe provisoire (ISO 8601). */
  provisoireExpireLe?: string | null;
}

/** Données de rattachement copiées sur chaque dossier pour filtrer les accès. */
export interface Rattachement {
  userId: string;
  managerId: string | null;
  campusId: string;
}

// ---------------------------------------------------------------------------
// Congés
// ---------------------------------------------------------------------------

export const TYPES_CONGE = ['conge_paye', 'conge_sans_solde'] as const;
export type TypeConge = (typeof TYPES_CONGE)[number];

export const STATUTS_DEMANDE = [
  'brouillon',
  'soumise',
  'en_decision_rh',
  'approuvee',
  'refusee',
  'annulee',
] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];

/** Statuts qui « réservent » une période (empêchent un chevauchement). */
export const STATUTS_ACTIFS: StatutDemande[] = ['soumise', 'en_decision_rh', 'approuvee'];
/** Statuts en attente de décision (affichés séparément du solde). */
export const STATUTS_EN_ATTENTE: StatutDemande[] = ['soumise', 'en_decision_rh'];

export interface JourOuvre {
  date: string;
  /** 1 = journée entière, 0.5 = demi-journée. */
  valeur: number;
}

export interface Plage {
  debut: string;
  fin: string;
  jours: number;
}

export interface Repartition {
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
  plagesPayees: Plage[];
  plagesNonPayees: Plage[];
}

// ---------------------------------------------------------------------------
// Signalements (absences / retards)
// ---------------------------------------------------------------------------

export type TypeSignalement = 'absence' | 'retard';
export type StatutTraitement = 'declare' | 'en_cours' | 'cloture';
export type Qualification = 'a_examiner' | 'justifie' | 'non_justifie';
export type StatutJustificatif = 'non_requis' | 'a_fournir' | 'recu_a_examiner' | 'accepte' | 'refuse';

export interface CategorieSignalement {
  code: string;
  libelle: string;
  type: TypeSignalement;
  /** Une pièce est-elle attendue pour cette catégorie ? */
  justificatif: 'non_requis' | 'a_fournir';
  /** Délai (jours calendaires) pour déposer la pièce. */
  delaiJustificatifJours: number;
  /** Catégorie à caractère médical : contenu masqué hors déposant et RH. */
  medical: boolean;
}

// ---------------------------------------------------------------------------
// Paramètres RH
// ---------------------------------------------------------------------------

export interface Parametres {
  dotationParDefaut: number;
  /** Jours ouvrés : 0 = dimanche … 6 = samedi. */
  joursOuvres: number[];
  /** Jours fériés (AAAA-MM-JJ). */
  joursFeries: string[];
  categories: CategorieSignalement[];
  justificatifs: {
    tailleMaxOctets: number;
    maxParDossier: number;
    typesAutorises: string[];
  };
  /** Modèle de la fiche papier « Demande de congé » (formulaire F031/DI). */
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

export type TypeMouvement =
  | 'DOTATION_INITIALE'
  | 'MODIFICATION_DOTATION'
  | 'AJUSTEMENT'
  | 'DEBIT'
  | 'RESTITUTION'
  | 'IMPUTATION_ABSENCE';
