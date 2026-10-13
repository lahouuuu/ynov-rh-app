import { describe, expect, it } from 'vitest';
import { joursOuvresDeLaPeriode } from '../../src/domain/calendrier';
import { calculerSolde, repartir, repartitionCouverte, verifierSoldeNonNegatif } from '../../src/domain/solde';

const cal = { joursOuvres: [1, 2, 3, 4, 5], joursFeries: [] };
// Du lundi 1er au jeudi 4 mars 2027 : 4 jours ouvrés
const quatreJours = joursOuvresDeLaPeriode('2027-03-01', '2027-03-04', cal);

describe('Solde disponible', () => {
  it('dotation initiale de 18 jours', () => {
    expect(calculerSolde({ joursAttribues: 18, ajustements: 0, joursDebites: 0 })).toBe(18);
  });

  it('droits ± ajustements − jours payés approuvés', () => {
    expect(calculerSolde({ joursAttribues: 18, ajustements: 0, joursDebites: 16 })).toBe(2);
    expect(calculerSolde({ joursAttribues: 18, ajustements: 1.5, joursDebites: 3 })).toBe(16.5);
    expect(calculerSolde({ joursAttribues: 18, ajustements: -2, joursDebites: 0.5 })).toBe(15.5);
  });

  it('bloque une réduction qui rendrait le solde négatif', () => {
    expect(() => verifierSoldeNonNegatif({ joursAttribues: 10, ajustements: 0, joursDebites: 12 })).toThrow(/négatif/);
    expect(verifierSoldeNonNegatif({ joursAttribues: 12, ajustements: 0, joursDebites: 12 })).toBe(0);
  });
});

describe('Répartition payée / non payée', () => {
  it('solde suffisant : tout est payé', () => {
    const r = repartir(quatreJours, 18, 'conge_paye');
    expect(r).toMatchObject({ dureeTotale: 4, joursPayes: 4, joursNonPayes: 0, plagesNonPayees: [] });
  });

  it('exemple du cahier des charges : 18 attribués, 16 décomptés, demande de 4 jours → 2 payés + 2 non payés', () => {
    const solde = calculerSolde({ joursAttribues: 18, ajustements: 0, joursDebites: 16 });
    const r = repartir(quatreJours, solde, 'conge_paye');
    expect(r.joursPayes).toBe(2);
    expect(r.joursNonPayes).toBe(2);
    // Les dates de chaque partie sont identifiées
    expect(r.plagesPayees).toEqual([{ debut: '2027-03-01', fin: '2027-03-02', jours: 2 }]);
    expect(r.plagesNonPayees).toEqual([{ debut: '2027-03-03', fin: '2027-03-04', jours: 2 }]);
  });

  it('solde nul : toute la période est proposée en non payé', () => {
    const r = repartir(quatreJours, 0, 'conge_paye');
    expect(r).toMatchObject({ joursPayes: 0, joursNonPayes: 4 });
    expect(r.plagesNonPayees).toEqual([{ debut: '2027-03-01', fin: '2027-03-04', jours: 4 }]);
  });

  it('un solde négatif (anormal) est traité comme nul', () => {
    expect(repartir(quatreJours, -3, 'conge_paye').joursPayes).toBe(0);
  });

  it('scinde une journée quand le solde se termine sur une demi-journée', () => {
    const r = repartir(quatreJours, 1.5, 'conge_paye');
    expect(r.joursPayes).toBe(1.5);
    expect(r.joursNonPayes).toBe(2.5);
    expect(r.plagesPayees).toEqual([{ debut: '2027-03-01', fin: '2027-03-02', jours: 1.5 }]);
    expect(r.plagesNonPayees).toEqual([{ debut: '2027-03-02', fin: '2027-03-04', jours: 2.5 }]);
  });

  it('un congé sans solde n’est jamais imputé sur le solde', () => {
    const r = repartir(quatreJours, 18, 'conge_sans_solde');
    expect(r).toMatchObject({ joursPayes: 0, joursNonPayes: 4 });
  });

  it('pas d’erreur d’arrondi avec les demi-journées', () => {
    const jours = joursOuvresDeLaPeriode('2027-03-01', '2027-03-12', cal, { demiJourneeDebut: true, demiJourneeFin: true });
    const r = repartir(jours, 3.5, 'conge_paye');
    expect(r.dureeTotale).toBe(9);
    expect(r.joursPayes + r.joursNonPayes).toBe(9);
  });
});

describe('Revérification au moment de la décision', () => {
  it('la répartition acceptée doit rester couverte par le solde actuel', () => {
    expect(repartitionCouverte(2, 2)).toBe(true);
    expect(repartitionCouverte(2, 1.5)).toBe(false);
    expect(repartitionCouverte(0, 0)).toBe(true);
  });
});
