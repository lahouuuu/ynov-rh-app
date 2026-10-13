/** Formats d'affichage : toutes les dates sont présentées dans le fuseau Africa/Casablanca. */
export const FUSEAU = 'Africa/Casablanca';

/** Date métier « AAAA-MM-JJ » → « lun. 1 mars 2027 » (sans décalage de fuseau). */
export function date(s?: string | null, options: Intl.DateTimeFormatOptions = {}): string {
  if (!s) return '—';
  const d = new Date(`${s}T12:00:00Z`);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...options }).format(d);
}

export function dateCourte(s?: string | null): string {
  return date(s, { year: undefined });
}

/** Instant ISO → « 1 mars 2027 à 14:05 » à l'heure du Maroc. */
export function instant(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: FUSEAU,
  }).format(d);
}

export function jours(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${v} j`;
}

export function joursLong(n: number): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${v} jour${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Aujourd'hui au Maroc, au format AAAA-MM-JJ. */
export function aujourdhui(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function ajouterJours(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function periode(debut: string, fin: string | null, demiDebut?: boolean, demiFin?: boolean): string {
  const a = `${date(debut)}${demiDebut ? ' (après-midi)' : ''}`;
  if (!fin || fin === debut) return demiFin ? `${a} (matin)` : a;
  return `${a} → ${date(fin)}${demiFin ? ' (matin)' : ''}`;
}
