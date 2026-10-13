/**
 * Paramètres RH par défaut. Ils sont copiés dans Firestore (parametres/general)
 * au premier démarrage puis modifiables par un gestionnaire RH habilité.
 * Les valeurs restent à confirmer avec l'encadrant au cadrage.
 */
import { Parametres } from './types';

export const PARAMETRES_PAR_DEFAUT: Parametres = {
  dotationParDefaut: 18,
  // Du lundi (1) au vendredi (5)
  joursOuvres: [1, 2, 3, 4, 5],
  // Jours fériés au Maroc. Les fêtes religieuses dépendent de l'observation
  // lunaire : dates prévisionnelles à confirmer chaque année par les RH.
  joursFeries: [
    // 2026
    '2026-01-01', '2026-01-11', '2026-01-14', '2026-03-20', '2026-05-01',
    '2026-05-27', '2026-05-28', '2026-06-16', '2026-07-30', '2026-08-14',
    '2026-08-20', '2026-08-21', '2026-08-25', '2026-08-26', '2026-10-31',
    '2026-11-06', '2026-11-18',
    // 2027
    '2027-01-01', '2027-01-11', '2027-01-14', '2027-03-10', '2027-05-01',
    '2027-05-17', '2027-05-18', '2027-06-06', '2027-07-30', '2027-08-14',
    '2027-08-15', '2027-08-16', '2027-08-20', '2027-08-21', '2027-10-31',
    '2027-11-06', '2027-11-18',
  ],
  categories: [
    { code: 'maladie', libelle: 'Maladie', type: 'absence', justificatif: 'a_fournir', delaiJustificatifJours: 2, medical: true },
    { code: 'enfant_malade', libelle: 'Enfant malade', type: 'absence', justificatif: 'a_fournir', delaiJustificatifJours: 2, medical: true },
    { code: 'familial', libelle: 'Événement familial', type: 'absence', justificatif: 'a_fournir', delaiJustificatifJours: 5, medical: false },
    { code: 'administratif', libelle: 'Démarche administrative', type: 'absence', justificatif: 'a_fournir', delaiJustificatifJours: 5, medical: false },
    { code: 'force_majeure', libelle: 'Force majeure', type: 'absence', justificatif: 'non_requis', delaiJustificatifJours: 0, medical: false },
    { code: 'autre_absence', libelle: 'Autre motif', type: 'absence', justificatif: 'non_requis', delaiJustificatifJours: 0, medical: false },
    { code: 'transport', libelle: 'Transport / circulation', type: 'retard', justificatif: 'non_requis', delaiJustificatifJours: 0, medical: false },
    { code: 'rdv_medical', libelle: 'Rendez-vous médical', type: 'retard', justificatif: 'a_fournir', delaiJustificatifJours: 2, medical: true },
    { code: 'autre_retard', libelle: 'Autre motif', type: 'retard', justificatif: 'non_requis', delaiJustificatifJours: 0, medical: false },
  ],
  justificatifs: {
    tailleMaxOctets: 10 * 1024 * 1024,
    maxParDossier: 3,
    typesAutorises: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  // Modèle papier fourni par l'établissement (formulaire F031/DI, version A)
  fiche: {
    entite: 'IDG',
    titre: 'DEMANDE DE CONGE',
    dateApplication: '19/12/2025',
    version: 'A',
    code: 'F031/DI',
    libelleRaf: 'RAF',
    signataireRaf: 'Assia MJIDIILA',
    libelleDirection: 'DIRECTION REGIONALE',
    signataireDirection: 'M. ZNIBER',
  },
};
