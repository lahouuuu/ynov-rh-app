import { z } from 'zod';
import { estDateValide } from '../domain/calendrier';

export const date = z.string().refine(estDateValide, 'date attendue au format AAAA-MM-JJ');
export const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'heure attendue au format HH:MM');
export const texte = (max = 1000) => z.string().trim().max(max);
export const cle = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/);

export const pagination = z.object({
  limite: z.coerce.number().int().min(1).max(100).optional(),
  curseur: z.string().max(200).optional(),
  du: date.optional(),
  au: date.optional(),
});

/** Paramètre de requête « a,b,c » → tableau. */
export const liste = <T extends [string, ...string[]]>(valeurs: T) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(valeurs)).max(10).optional());
