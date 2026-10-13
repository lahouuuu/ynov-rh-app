'use client';
/**
 * Mise en page du formulaire papier « Demande de congé » (F031/DI), réutilisée
 * pour la saisie en ligne (formulaire vierge) et pour la consultation de la
 * fiche signée. Les cases réservées à la RAF et à la direction sont affichées
 * verrouillées : leurs visas ne peuvent être apposés que par leurs titulaires,
 * depuis leur propre compte (contrôle côté serveur).
 */
import type { ParametresFiche, VisaAffiche } from '../lib/types';
import { cx } from './ui';

export interface ColonneSignature {
  titre: string;
  nom: React.ReactNode;
  visa: React.ReactNode;
  date: React.ReactNode;
}

export function CaseVerrouillee({ texte }: { texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gris-500">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </svg>
      {texte}
    </span>
  );
}

/** Cachet de signature électronique (nom, date et heure du visa). */
export function Cachet({ visa }: { visa: VisaAffiche }) {
  return (
    <div className="mx-auto max-w-[13rem] rounded-md border-2 border-sky-700/70 px-2 py-1.5 text-center text-sky-800">
      <p className="text-[10px] font-bold uppercase tracking-wide">Signé électroniquement</p>
      <p className="text-xs font-semibold">{visa.nom}</p>
      <p className="text-[11px]">le {visa.dateCourte} à {visa.heure}</p>
    </div>
  );
}

export function FicheF031({
  parametres,
  numero,
  champs,
  accord,
  colonnes,
  filigrane,
  children,
}: {
  parametres: ParametresFiche;
  numero: React.ReactNode;
  champs: Array<[string, React.ReactNode]>;
  accord: React.ReactNode;
  colonnes: ColonneSignature[];
  filigrane?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto max-w-4xl overflow-hidden rounded-lg border border-gris-300 bg-white p-4 shadow-sm sm:p-8">
      {filigrane && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[30deg] text-5xl font-black uppercase tracking-widest text-gris-100 sm:text-7xl">{filigrane}</span>
        </div>
      )}
      <div className="relative">
        {/* En-tête */}
        <div className="grid grid-cols-[1fr_1.9fr_1.3fr] border-2 border-ynov-noir text-[11px] sm:text-sm">
          <div className="flex items-center justify-center border-r border-ynov-noir p-2 font-serif text-lg sm:text-2xl">{parametres.entite}</div>
          <div className="grid grid-rows-2 border-r border-ynov-noir font-mono font-bold">
            <div className="flex items-center justify-center border-b border-ynov-noir p-1 text-center">FORMULAIRE</div>
            <div className="flex items-center justify-center p-1 text-center">{parametres.titre}</div>
          </div>
          <div className="grid grid-rows-3 text-[10px] sm:text-xs">
            <div className="border-b border-ynov-noir px-1.5 py-1">Date d’application : {parametres.dateApplication}</div>
            <div className="border-b border-ynov-noir px-1.5 py-1">Version : {parametres.version}</div>
            <div className="px-1.5 py-1">Code : {parametres.code}</div>
          </div>
        </div>

        <p className="mt-6 text-sm font-bold">Fiche N° : {numero}</p>

        {/* Champs */}
        <dl className="mt-6 space-y-3 text-sm">
          {champs.map(([libelle, valeur]) => (
            <div key={libelle} className="grid grid-cols-1 gap-1 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-3">
              <dt className="text-gris-700">
                {libelle} <span className="hidden sm:inline">:</span>
              </dt>
              <dd className="min-h-6 font-medium text-ynov-noir">{valeur}</dd>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-1 pt-2 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-3">
            <dt className="text-gris-700">Accord de la direction pour la période du :</dt>
            <dd>{accord}</dd>
          </div>
        </dl>

        {/* Signatures */}
        <div className="mt-8 hidden sm:block">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-20 border-0" />
                {colonnes.map((c) => (
                  <th key={c.titre} className="border border-ynov-noir bg-gris-200 px-2 py-2 text-xs font-bold uppercase">
                    {c.titre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['nom', 'visa', 'date'] as const).map((ligne) => (
                <tr key={ligne}>
                  <th className="border border-ynov-noir bg-gris-200 px-2 text-left text-sm font-bold capitalize">{ligne}</th>
                  {colonnes.map((c) => (
                    <td key={c.titre} className={cx('border border-ynov-noir px-2 text-center align-middle', ligne === 'visa' ? 'h-24' : 'h-14')}>
                      {c[ligne]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Signatures (téléphone) */}
        <div className="mt-8 space-y-3 sm:hidden">
          {colonnes.map((c) => (
            <div key={c.titre} className="rounded-lg border border-ynov-noir">
              <p className="bg-gris-200 px-3 py-1.5 text-xs font-bold uppercase">{c.titre}</p>
              <div className="space-y-2 px-3 py-2 text-sm">
                <div><span className="text-xs font-semibold text-gris-500">Nom : </span>{c.nom}</div>
                <div>{c.visa}</div>
                <div><span className="text-xs font-semibold text-gris-500">Date : </span>{c.date}</div>
              </div>
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
