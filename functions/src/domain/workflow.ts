/**
 * Circuit de validation d'une demande de congé.
 *
 *   brouillon ──soumettre──▶ soumise ──avis responsable──▶ en_decision_rh
 *       │                       │  └──refus responsable──▶ refusee
 *       │                       │                 approuver ◀──┼──▶ refuser
 *       └──annuler──▶ annulee ◀─┴──annuler (collaborateur)─────┘
 *                         ▲
 *            approuvee ───┘ annulation après approbation : décision RH
 *
 * Sans responsable désigné, la demande soumise passe directement en décision RH.
 * Le responsable (N+1) peut refuser la demande (refus motivé et définitif) ou
 * la transmettre aux RH avec son avis ; seule la décision RH approuve.
 */
import { StatutDemande } from './types';

export type ActionDemande =
  | 'soumettre'
  | 'avis'
  | 'refuser_responsable'
  | 'approuver'
  | 'refuser'
  | 'annuler_collaborateur'
  | 'annuler_rh';

const TRANSITIONS: Record<ActionDemande, StatutDemande[]> = {
  soumettre: ['brouillon'],
  avis: ['soumise'],
  refuser_responsable: ['soumise'],
  approuver: ['en_decision_rh'],
  refuser: ['en_decision_rh'],
  annuler_collaborateur: ['brouillon', 'soumise', 'en_decision_rh'],
  annuler_rh: ['approuvee'],
};

export function transitionAutorisee(action: ActionDemande, statut: StatutDemande): boolean {
  return TRANSITIONS[action].includes(statut);
}

export function statutApresSoumission(aUnResponsable: boolean): StatutDemande {
  return aUnResponsable ? 'soumise' : 'en_decision_rh';
}

export const LIBELLES_STATUT: Record<StatutDemande, string> = {
  brouillon: 'Brouillon',
  soumise: 'Soumise',
  en_decision_rh: 'En décision RH',
  approuvee: 'Approuvée',
  refusee: 'Refusée',
  annulee: 'Annulée',
};
