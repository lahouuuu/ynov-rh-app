import { COL, db } from '../infra/firebase';
import { PARAMETRES_PAR_DEFAUT } from '../domain/parametres';
import { CategorieSignalement, Parametres } from '../domain/types';

const REF = () => db().collection(COL.parametres).doc('general');

/** Lit les paramètres RH ; les crée avec les valeurs par défaut s'ils n'existent pas. */
export async function lireParametres(): Promise<Parametres> {
  const snap = await REF().get();
  if (!snap.exists) {
    await REF().set(PARAMETRES_PAR_DEFAUT, { merge: true });
    return PARAMETRES_PAR_DEFAUT;
  }
  const lu = snap.data() as Partial<Parametres>;
  return { ...PARAMETRES_PAR_DEFAUT, ...lu, fiche: { ...PARAMETRES_PAR_DEFAUT.fiche, ...(lu.fiche ?? {}) } };
}

export async function ecrireParametres(p: Partial<Parametres>): Promise<void> {
  await REF().set(p, { merge: true });
}

export function trouverCategorie(p: Parametres, code: string, type: 'absence' | 'retard'): CategorieSignalement | undefined {
  return p.categories.find((c) => c.code === code && c.type === type);
}
