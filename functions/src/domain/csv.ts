/**
 * Génération CSV compatible Excel (séparateur « ; », BOM UTF-8) avec
 * neutralisation des formules (injection CSV : =, +, -, @).
 */
export function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  let s = String(valeur);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function versCsv(entetes: string[], lignes: unknown[][]): string {
  const corps = [entetes, ...lignes].map((l) => l.map(celluleCsv).join(';')).join('\r\n');
  return `﻿${corps}\r\n`;
}
