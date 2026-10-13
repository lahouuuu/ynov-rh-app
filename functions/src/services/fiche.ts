/**
 * Fiche « Demande de congé » (formulaire F031/DI) : version en ligne et PDF.
 *
 * Les trois visas (employé, RAF, direction régionale) sont des signatures
 * électroniques apposées par le serveur au nom de l'utilisateur authentifié,
 * horodatées et tracées dans l'historique. Ils ne sont jamais saisis par le
 * client : un employé ne peut ni remplir ni modifier les cases de la RAF ou
 * de la direction. Chaque fiche porte un code de vérification qui permet de
 * détecter une fiche imprimée falsifiée.
 */
import PDFDocument from 'pdfkit';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { COL, db } from '../infra/firebase';
import { conflit, interdit, introuvable } from '../infra/erreurs';
import { aujourdhui, anneeDe, FUSEAU } from '../domain/calendrier';
import { calculerSolde } from '../domain/solde';
import { codeVerification, ContenuFiche, contenuFiche, dateCourte, EmpreinteFiche } from '../domain/fiche';
import { peutVoirDemande } from '../domain/authz';
import { ParametresFiche, Utilisateur } from '../domain/types';
import { LIBELLES_STATUT } from '../domain/workflow';
import { chargerDemande, Demande, versDemande } from './demandes';
import { lireParametres } from './parametres';
import { lireDotation } from './dotations';
import { journaliser } from './journal';
import { lireUtilisateur } from './utilisateurs';

export interface VisaAffiche {
  nom: string;
  fonction: string;
  date: string | null; // ISO
  dateCourte: string;
  heure: string;
}

export interface Fiche {
  id: string;
  numero: string;
  contenu: ContenuFiche;
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

const STATUT_FICHE: Record<string, string> = {
  attente_direction: 'En attente de l’accord de la direction',
  signee: 'Fiche signée par les trois parties',
  refusee_direction: 'Accord refusé par la direction',
  annulee: 'Congé annulé',
};

function iso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}

function enJourLocal(isoDate: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoDate));
}

function heureLocale(isoDate: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));
}

function afficherVisa(v: { nom?: string; fonction?: string; date?: unknown } | null | undefined): VisaAffiche | null {
  if (!v) return null;
  const d = iso(v.date);
  return {
    nom: v.nom ?? '',
    fonction: v.fonction ?? '',
    date: d,
    dateCourte: d ? dateCourte(enJourLocal(d)) : '',
    heure: d ? heureLocale(d) : '',
  };
}

/** Attribue (une seule fois) un numéro de fiche du type 2026-0007 et un sel de vérification. */
async function numeroDeFiche(demandeId: string, annee: number): Promise<{ numero: string; sel: string }> {
  return db().runTransaction(async (tx) => {
    const refDemande = db().collection(COL.demandes).doc(demandeId);
    const refCompteur = db().collection('compteurs').doc(`fiches_${annee}`);
    const [d, c] = [await tx.get(refDemande), await tx.get(refCompteur)];
    const existant = d.get('ficheNumero') as string | null;
    const sel = (d.get('ficheSel') as string | undefined) ?? randomBytes(16).toString('hex');
    if (existant) {
      if (!d.get('ficheSel')) tx.update(refDemande, { ficheSel: sel });
      return { numero: existant, sel };
    }
    const suivant = Number(c.get('valeur') ?? 0) + 1;
    const numero = `${annee}-${String(suivant).padStart(4, '0')}`;
    tx.set(refCompteur, { valeur: suivant, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(refDemande, { ficheNumero: numero, ficheSel: sel });
    return { numero, sel };
  });
}

function empreinte(d: Demande, numero: string): EmpreinteFiche {
  const s = d.signatures;
  const v = (role: string, x: { uid?: string; date?: unknown } | null | undefined) =>
    x?.uid ? { role, uid: x.uid, date: iso(x.date) ?? '' } : null;
  return {
    numero,
    userId: d.userId,
    dateDebut: d.dateDebut,
    dateFin: d.dateFin,
    dureeTotale: d.dureeTotale,
    joursPayes: d.joursPayes,
    joursNonPayes: d.joursNonPayes,
    statut: d.statut,
    ficheStatut: d.ficheStatut ?? null,
    visas: [v('employe', s?.employe), v('raf', s?.raf), v('direction', s?.direction)],
  };
}

/** Construit la fiche (en ligne ou PDF) d'une demande visible par l'acteur. */
export async function construireFiche(acteur: Utilisateur, id: string): Promise<Fiche> {
  const d0 = await chargerDemande(acteur, id); // contrôle d'accès
  if (d0.statut === 'brouillon') {
    throw conflit('FICHE_INDISPONIBLE', 'La fiche est disponible une fois la demande signée et soumise.');
  }
  const { numero, sel } = await numeroDeFiche(d0.id, anneeDe(aujourdhui()));
  const d = versDemande(await db().collection(COL.demandes).doc(id).get());
  const [p, cible] = await Promise.all([lireParametres(), lireUtilisateur(d.userId)]);
  const jour = aujourdhui();
  const dot = await lireDotation(d.userId, d.annee, p.dotationParDefaut);

  const s = d.signatures;
  // Compatibilité avec les demandes antérieures aux visas électroniques
  const visaEmploye = afficherVisa(s?.employe ?? (d.statut !== 'brouillon' ? { nom: d.userNom, date: (d as unknown as { soumiseLe?: unknown }).soumiseLe } : null));
  const visaRaf = afficherVisa(
    s?.raf ?? (d.decision && d.decision.statut === 'approuvee' ? { nom: d.decision.auteurNom, date: d.decision.date } : null),
  );
  const visaDirection = afficherVisa(s?.direction);

  const contenu = contenuFiche({
    numero,
    nom: cible?.nom ?? d.userNom,
    prenom: cible?.prenom ?? '',
    fonction: cible?.fonction ?? '',
    annee: d.annee,
    dateDebut: d.dateDebut,
    dateFin: d.dateFin,
    demiJourneeDebut: d.demiJourneeDebut,
    demiJourneeFin: d.demiJourneeFin,
    dureeTotale: d.dureeTotale,
    joursNonPayes: d.joursNonPayes,
    solde: calculerSolde(dot),
    dateSolde: jour,
    interim: d.interim ?? '',
    dateDemande: visaEmploye?.date ? enJourLocal(visaEmploye.date) : null,
    calendrier: p,
  });

  const definitive = d.statut === 'approuvee' && d.ficheStatut === 'signee';
  const etat =
    d.statut === 'approuvee'
      ? (STATUT_FICHE[d.ficheStatut ?? ''] ?? 'Approuvée par les RH')
      : d.ficheStatut
        ? STATUT_FICHE[d.ficheStatut]
        : `Demande ${LIBELLES_STATUT[d.statut].toLowerCase()}`;

  return {
    id: d.id,
    numero,
    contenu,
    visas: { employe: visaEmploye, raf: visaRaf, direction: visaDirection },
    accordDirection: s?.direction ? { du: s.direction.accordDu, au: s.direction.accordAu } : null,
    statut: d.statut,
    statutLibelle: LIBELLES_STATUT[d.statut],
    ficheStatut: d.ficheStatut ?? null,
    etat,
    definitive,
    code: codeVerification(sel, empreinte(d, numero)),
    parametres: p.fiche,
  };
}

export async function genererFiche(acteur: Utilisateur, id: string): Promise<{ pdf: Buffer; nomFichier: string }> {
  const fiche = await construireFiche(acteur, id);
  const pdf = await dessinerFiche(fiche, aujourdhui());
  const batch = db().batch();
  journaliser(batch, acteur, {
    entite: 'demande',
    entiteId: id,
    action: 'edition_fiche',
    resume: `Fiche de congé n° ${fiche.numero} éditée en PDF (${fiche.etat.toLowerCase()}).`,
  });
  await batch.commit();
  const nomFichier = `fiche-conge-${fiche.numero}-${fiche.contenu.nom.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  return { pdf, nomFichier };
}

/**
 * Vérifie une fiche imprimée : le numéro et le code doivent correspondre à
 * l'état actuel de la demande en base. Réservé aux personnes qui peuvent voir
 * la demande (RH, direction du périmètre, responsable, intéressé).
 */
export async function verifierFiche(acteur: Utilisateur, numero: string, code: string) {
  const snap = await db().collection(COL.demandes).where('ficheNumero', '==', numero).limit(1).get();
  if (snap.empty) throw introuvable('Aucune fiche ne porte ce numéro.');
  const d = versDemande(snap.docs[0]);
  if (!peutVoirDemande(acteur, d)) throw interdit('Cette fiche ne relève pas de votre périmètre.');
  const fiche = await construireFiche(acteur, d.id);
  const valide = fiche.code === code.trim().toUpperCase();
  const batch = db().batch();
  journaliser(batch, acteur, {
    entite: 'demande',
    entiteId: d.id,
    action: 'verification_fiche',
    resume: `Vérification de la fiche n° ${numero} : ${valide ? 'authentique et à jour' : 'CODE INVALIDE'}.`,
  });
  await batch.commit();
  return { valide, fiche: valide ? fiche : { numero, etat: fiche.etat, contenu: { nom: fiche.contenu.nom, prenom: fiche.contenu.prenom } } };
}

// ---------------------------------------------------------------------------
// Rendu PDF (A4) fidèle au formulaire papier F031/DI
// ---------------------------------------------------------------------------

const NOIR = '#000000';
const GRIS = '#d9d9d9';
const BLEU = '#1a5c96';

export function dessinerFiche(fiche: Fiche, dateEdition: string): Promise<Buffer> {
  const c = fiche.contenu;
  const f = fiche.parametres;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 20, left: 55, right: 55 },
      info: { Title: `Demande de congé n° ${c.numero}`, Author: 'Ynov RH', Subject: `${f.code} — ${c.prenom} ${c.nom}` },
    });
    const morceaux: Buffer[] = [];
    doc.on('data', (b: Buffer) => morceaux.push(b));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);

    const x0 = 55;
    const largeur = doc.page.width - 110;

    // Filigrane tant que la fiche n'est pas signée par les trois parties
    if (!fiche.definitive) {
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('Helvetica-Bold').fontSize(54).fillColor('#e6e6e6')
        .text('NON DÉFINITIVE', 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center' });
      doc.restore();
      doc.fillColor(NOIR);
    }

    // --- En-tête : entité | FORMULAIRE / DEMANDE DE CONGE | références ---
    const yH = 40;
    const hH = 72;
    const c1 = largeur * 0.24;
    const c2 = largeur * 0.46;
    const c3 = largeur - c1 - c2;
    doc.lineWidth(2).rect(x0 - 3, yH - 3, largeur + 6, hH + 6).stroke(NOIR);
    doc.lineWidth(0.8).rect(x0, yH, largeur, hH).stroke(NOIR);
    doc.moveTo(x0 + c1, yH).lineTo(x0 + c1, yH + hH).stroke();
    doc.moveTo(x0 + c1 + c2, yH).lineTo(x0 + c1 + c2, yH + hH).stroke();
    doc.moveTo(x0 + c1, yH + hH / 2).lineTo(x0 + c1 + c2, yH + hH / 2).stroke();
    doc.moveTo(x0 + c1 + c2, yH + hH / 3).lineTo(x0 + largeur, yH + hH / 3).stroke();
    doc.moveTo(x0 + c1 + c2, yH + (2 * hH) / 3).lineTo(x0 + largeur, yH + (2 * hH) / 3).stroke();

    doc.font('Times-Roman').fontSize(20).fillColor(NOIR).text(f.entite, x0, yH + hH / 2 - 10, { width: c1, align: 'center' });
    doc.font('Courier-Bold').fontSize(11);
    doc.text('FORMULAIRE', x0 + c1, yH + hH / 4 - 5, { width: c2, align: 'center' });
    doc.text(f.titre, x0 + c1, yH + (3 * hH) / 4 - 5, { width: c2, align: 'center' });
    doc.font('Helvetica').fontSize(8.5);
    [`Date d'application : ${f.dateApplication}`, `Version : ${f.version}`, `Code : ${f.code}`].forEach((t, i) =>
      doc.text(t, x0 + c1 + c2 + 5, yH + (i * hH) / 3 + hH / 6 - 4, { width: c3 - 8 }),
    );

    doc.font('Helvetica-Bold').fontSize(10.5).text(`Fiche N° : ${c.numero}`, x0, yH + hH + 28);

    // --- Champs ---
    const champs: Array<[string, string]> = [
      ['NOM', c.nom],
      ['Prénom', c.prenom],
      ['Fonction', c.fonction],
      ["Congé au titre de l'année", c.annee],
      ['Nombre de jours ouvrables', c.nombreJours],
      ['Période choisie', c.periode],
      ['Date de reprise', c.reprise],
      ['Reste Acquis', c.resteAcquis],
      ['Intérim', c.interim],
    ];
    let y = yH + hH + 70;
    doc.fontSize(10.5);
    for (const [libelle, valeur] of champs) {
      doc.font('Helvetica').fillColor(NOIR).text(libelle, x0, y, { width: 175 });
      doc.text(':', x0 + 178, y);
      doc.text(valeur || '', x0 + 190, y, { width: largeur - 190 });
      y += 26;
    }
    doc.font('Helvetica').text('Accord de la direction pour la période du :', x0, y);
    if (fiche.accordDirection) {
      doc.font('Helvetica-Bold').text(
        `${dateCourte(fiche.accordDirection.du)}  au  ${dateCourte(fiche.accordDirection.au)}`,
        x0 + 230,
        y,
      );
    } else {
      doc.fillColor('#666666').text('............................  au  ............................', x0 + 230, y);
    }
    doc.fillColor(NOIR);

    // --- Tableau des signatures ---
    const yT = y + 40;
    const cl = 70;
    const cs = (largeur - cl) / 3;
    const hEnTete = 38;
    const lignes: Array<[string, number]> = [['Nom', 52], ['Visa', 66], ['Date', 40]];
    const hTotal = hEnTete + lignes.reduce((a, [, h]) => a + h, 0);

    doc.rect(x0 + cl, yT, cs * 3, hEnTete).fill(GRIS);
    let yy = yT + hEnTete;
    for (const [, h] of lignes) {
      doc.rect(x0, yy, cl, h).fill(GRIS);
      yy += h;
    }
    doc.fillColor(NOIR).lineWidth(0.8);
    doc.rect(x0 + cl, yT, cs * 3, hEnTete).stroke();
    doc.rect(x0, yT + hEnTete, largeur, hTotal - hEnTete).stroke();
    for (let i = 0; i <= 3; i++) doc.moveTo(x0 + cl + i * cs, yT).lineTo(x0 + cl + i * cs, yT + hTotal).stroke();
    yy = yT + hEnTete;
    for (const [, h] of lignes) {
      doc.moveTo(x0, yy).lineTo(x0 + largeur, yy).stroke();
      yy += h;
    }

    doc.font('Helvetica-Bold').fontSize(9.5);
    ["SIGNATURE DE\nL'EMPLOYE", `SIGNATURE DE LA\n${f.libelleRaf}`, `SIGNATURE DE LA\n${f.libelleDirection}`].forEach((t, i) =>
      doc.text(t, x0 + cl + i * cs + 4, yT + 8, { width: cs - 8, align: 'center' }),
    );

    const visas = [fiche.visas.employe, fiche.visas.raf, fiche.visas.direction];
    const nomsAttendus = [c.signataireEmploye, f.signataireRaf, f.signataireDirection];
    yy = yT + hEnTete;
    lignes.forEach(([libelle, h], r) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NOIR).text(libelle, x0 + 8, yy + h / 2 - 5, { width: cl - 12 });
      visas.forEach((v, i) => {
        const xc = x0 + cl + i * cs + 4;
        if (r === 0) {
          doc.font('Times-Bold').fontSize(9.5).fillColor(NOIR).text(v?.nom || nomsAttendus[i] || '', xc, yy + 10, { width: cs - 8, align: 'center' });
          if (v?.fonction) doc.font('Helvetica').fontSize(7.5).fillColor('#555555').text(v.fonction, xc, yy + 26, { width: cs - 8, align: 'center' });
        } else if (r === 1) {
          if (v?.date) {
            doc.lineWidth(1).roundedRect(xc + 6, yy + 8, cs - 20, h - 16, 4).stroke(BLEU);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLEU)
              .text('SIGNÉ ÉLECTRONIQUEMENT', xc + 6, yy + 16, { width: cs - 20, align: 'center' })
              .font('Helvetica').text(`${v.nom}\nle ${v.dateCourte} à ${v.heure}`, xc + 6, yy + 28, { width: cs - 20, align: 'center' });
            doc.lineWidth(0.8).strokeColor(NOIR);
          } else {
            doc.font('Helvetica-Oblique').fontSize(8).fillColor('#999999').text('En attente', xc, yy + h / 2 - 4, { width: cs - 8, align: 'center' });
          }
        } else if (v?.date) {
          doc.font('Times-Bold').fontSize(9.5).fillColor(NOIR).text(v.dateCourte, xc, yy + 14, { width: cs - 8, align: 'center' });
        }
      });
      yy += h;
    });
    doc.fillColor(NOIR);

    // --- Bloc de vérification ---
    const yV = yT + hTotal + 22;
    doc.lineWidth(0.6).rect(x0, yV, largeur, 46).stroke('#999999');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NOIR).text(`État : ${fiche.etat}`, x0 + 8, yV + 7, { width: largeur - 16 });
    doc.font('Helvetica').fontSize(8).fillColor('#333333').text(
      `Code de vérification : ${fiche.code} — à contrôler dans l’application Ynov RH (menu « Vérifier une fiche ») avec le n° ${c.numero}. ` +
        'Les visas sont des signatures électroniques horodatées, apposées par leurs titulaires authentifiés ; toute modification du document invalide ce code.',
      x0 + 8,
      yV + 20,
      { width: largeur - 16 },
    );

    doc.font('Helvetica').fontSize(7).fillColor('#888888').text(
      `Édité par l'application Ynov RH le ${dateCourte(dateEdition)}.`,
      x0,
      doc.page.height - 40,
      { width: largeur, align: 'center', lineBreak: false },
    );
    doc.end();
  });
}
