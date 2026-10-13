export const STATUTS_DEMANDE: Record<string, { libelle: string; ton: Ton }> = {
  brouillon: { libelle: 'Brouillon', ton: 'neutre' },
  soumise: { libelle: 'Soumise', ton: 'info' },
  en_decision_rh: { libelle: 'En décision RH', ton: 'attente' },
  approuvee: { libelle: 'Approuvée', ton: 'succes' },
  refusee: { libelle: 'Refusée', ton: 'danger' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
};

export const TYPES_CONGE: Record<string, string> = {
  conge_paye: 'Congé payé',
  conge_sans_solde: 'Congé sans solde',
};

export const STATUTS_TRAITEMENT: Record<string, { libelle: string; ton: Ton }> = {
  declare: { libelle: 'Déclaré', ton: 'info' },
  en_cours: { libelle: 'En cours', ton: 'attente' },
  cloture: { libelle: 'Clôturé', ton: 'neutre' },
};

export const QUALIFICATIONS: Record<string, { libelle: string; ton: Ton }> = {
  a_examiner: { libelle: 'À examiner', ton: 'attente' },
  justifie: { libelle: 'Justifié', ton: 'succes' },
  non_justifie: { libelle: 'Non justifié', ton: 'danger' },
};

export const STATUTS_JUSTIFICATIF: Record<string, { libelle: string; ton: Ton }> = {
  non_requis: { libelle: 'Non requis', ton: 'neutre' },
  a_fournir: { libelle: 'À fournir', ton: 'attente' },
  recu_a_examiner: { libelle: 'Reçu, à examiner', ton: 'info' },
  accepte: { libelle: 'Accepté', ton: 'succes' },
  refuse: { libelle: 'Refusé', ton: 'danger' },
};

export const ROLES: Record<string, string> = {
  collaborateur: 'Collaborateur',
  responsable: 'Responsable hiérarchique',
  rh: 'Gestionnaire RH',
  direction: 'Direction régionale',
  admin: 'Administrateur',
};

export const MOUVEMENTS: Record<string, string> = {
  DOTATION_INITIALE: 'Dotation initiale',
  MODIFICATION_DOTATION: 'Modification de dotation',
  AJUSTEMENT: 'Ajustement',
  DEBIT: 'Débit (congé approuvé)',
  RESTITUTION: 'Restitution (annulation)',
  IMPUTATION_ABSENCE: 'Absence imputée sur les congés',
};

export const STATUTS_FICHE: Record<string, { libelle: string; ton: Ton }> = {
  attente_direction: { libelle: 'Accord direction attendu', ton: 'attente' },
  signee: { libelle: 'Fiche signée', ton: 'succes' },
  refusee_direction: { libelle: 'Refusée par la direction', ton: 'danger' },
  annulee: { libelle: 'Fiche annulée', ton: 'neutre' },
};

export type Ton = 'neutre' | 'info' | 'attente' | 'succes' | 'danger';
