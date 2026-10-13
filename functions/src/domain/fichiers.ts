/**
 * Contrôle des justificatifs déposés : type réel (signature binaire) et taille.
 * Le type annoncé par le navigateur n'est pas digne de confiance : on vérifie
 * les premiers octets du fichier.
 */

export const TYPES_AUTORISES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type TypeFichier = (typeof TYPES_AUTORISES)[number];

export const EXTENSIONS: Record<TypeFichier, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function detecterType(contenu: Buffer): TypeFichier | null {
  if (contenu.length >= 5 && contenu.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (contenu.length >= 3 && contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) return 'image/jpeg';
  if (
    contenu.length >= 8 &&
    contenu.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}

export interface ResultatControle {
  ok: boolean;
  type?: TypeFichier;
  erreur?: string;
}

export function controlerFichier(
  contenu: Buffer,
  typeAnnonce: string,
  tailleMaxOctets: number,
): ResultatControle {
  if (contenu.length === 0) return { ok: false, erreur: 'Le fichier est vide.' };
  if (contenu.length > tailleMaxOctets) {
    const mo = Math.round(tailleMaxOctets / (1024 * 1024));
    return { ok: false, erreur: `Le fichier dépasse la taille maximale autorisée (${mo} Mo).` };
  }
  const type = detecterType(contenu);
  if (!type) return { ok: false, erreur: 'Format non autorisé : seuls les fichiers PDF, JPEG et PNG sont acceptés.' };
  if (typeAnnonce && typeAnnonce !== type) {
    return { ok: false, erreur: "Le contenu du fichier ne correspond pas à son type annoncé." };
  }
  return { ok: true, type };
}

/** Nettoie un nom de fichier pour l'en-tête Content-Disposition. */
export function nomFichierSur(nom: string): string {
  const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'justificatif';
}
