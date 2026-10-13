import { describe, expect, it } from 'vitest';
import { statutApresSoumission, transitionAutorisee } from '../../src/domain/workflow';
import { controlerFichier, detecterType, nomFichierSur } from '../../src/domain/fichiers';
import { celluleCsv, versCsv } from '../../src/domain/csv';

describe('Circuit de validation', () => {
  it('brouillon → soumise (avec responsable) ou décision RH directe', () => {
    expect(transitionAutorisee('soumettre', 'brouillon')).toBe(true);
    expect(statutApresSoumission(true)).toBe('soumise');
    expect(statutApresSoumission(false)).toBe('en_decision_rh');
  });

  it('l’avis ne vaut pas approbation : seule la décision RH approuve', () => {
    expect(transitionAutorisee('approuver', 'soumise')).toBe(false);
    expect(transitionAutorisee('approuver', 'en_decision_rh')).toBe(true);
  });

  it('une décision ne peut pas être rejouée', () => {
    expect(transitionAutorisee('approuver', 'approuvee')).toBe(false);
    expect(transitionAutorisee('refuser', 'refusee')).toBe(false);
  });

  it('annulation après approbation : décision RH uniquement', () => {
    expect(transitionAutorisee('annuler_collaborateur', 'approuvee')).toBe(false);
    expect(transitionAutorisee('annuler_rh', 'approuvee')).toBe(true);
    expect(transitionAutorisee('annuler_rh', 'annulee')).toBe(false);
  });
});

describe('Contrôle des justificatifs', () => {
  const pdf = Buffer.from('%PDF-1.4 contenu');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const exe = Buffer.from('MZ\x90\x00 programme');

  it('détecte le type réel par signature', () => {
    expect(detecterType(pdf)).toBe('application/pdf');
    expect(detecterType(png)).toBe('image/png');
    expect(detecterType(jpg)).toBe('image/jpeg');
    expect(detecterType(exe)).toBeNull();
  });

  it('refuse les formats non autorisés, les fichiers trop gros et les types maquillés', () => {
    expect(controlerFichier(exe, 'application/pdf', 1000).ok).toBe(false);
    expect(controlerFichier(pdf, 'application/pdf', 5).ok).toBe(false);
    expect(controlerFichier(png, 'application/pdf', 1000).ok).toBe(false);
    expect(controlerFichier(pdf, 'application/pdf', 1000)).toEqual({ ok: true, type: 'application/pdf' });
  });

  it('nettoie les noms de fichiers', () => {
    expect(nomFichierSur('Certificat médical "final".pdf')).toBe('Certificat_medical_final_.pdf');
  });
});

describe('Export CSV', () => {
  it('neutralise les formules et échappe les séparateurs', () => {
    expect(celluleCsv('=SOMME(A1)')).toBe("'=SOMME(A1)");
    expect(celluleCsv('a;b')).toBe('"a;b"');
    expect(versCsv(['A'], [['x']]).startsWith('﻿A\r\nx')).toBe(true);
  });
});
