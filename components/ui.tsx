'use client';
/** Composants d'interface réutilisables (charte Ynov : noir, blanc, turquoise). */
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import type { Ton } from '../lib/libelles';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

type VarianteBouton = 'principal' | 'secondaire' | 'accent' | 'danger' | 'fantome';

const STYLES_BOUTON: Record<VarianteBouton, string> = {
  principal: 'bg-ynov-noir text-white hover:bg-black',
  accent: 'bg-ynov-turquoise text-white hover:bg-ynov-turquoise-fonce',
  secondaire: 'bg-white text-ynov-noir border border-gris-300 hover:bg-gris-50',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
  fantome: 'text-ynov-noir hover:bg-gris-100',
};

export function Bouton({
  variante = 'principal',
  enCours,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBouton; enCours?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || enCours}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ynov-turquoise',
        STYLES_BOUTON[variante],
        className,
      )}
    >
      {enCours && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function LienBouton({ href, variante = 'principal', className, children }: { href: string; variante?: VarianteBouton; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors', STYLES_BOUTON[variante], className)}>
      {children}
    </Link>
  );
}

export function Carte({ titre, action, children, className }: { titre?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-gris-200 bg-white p-4 shadow-sm sm:p-6', className)}>
      {(titre || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {titre && <h2 className="text-lg font-bold text-ynov-noir">{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EnTetePage({ titre, sousTitre, actions }: { titre: string; sousTitre?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ynov-noir sm:text-3xl">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-gris-600">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONS: Record<Ton, string> = {
  neutre: 'bg-gris-100 text-gris-700 ring-gris-300',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  attente: 'bg-amber-50 text-amber-800 ring-amber-200',
  succes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
};

export function Pastille({ ton = 'neutre', children }: { ton?: Ton; children: React.ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', TONS[ton])}>{children}</span>;
}

export function PastilleDe({ table, valeur }: { table: Record<string, { libelle: string; ton: Ton }>; valeur: string }) {
  const e = table[valeur] ?? { libelle: valeur, ton: 'neutre' as Ton };
  return <Pastille ton={e.ton}>{e.libelle}</Pastille>;
}

export function Alerte({ ton = 'danger', titre, children }: { ton?: 'danger' | 'succes' | 'info' | 'attente'; titre?: string; children: React.ReactNode }) {
  const styles = {
    danger: 'border-red-200 bg-red-50 text-red-800',
    succes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    attente: 'border-amber-200 bg-amber-50 text-amber-900',
  }[ton];
  return (
    <div role={ton === 'danger' ? 'alert' : 'status'} className={cx('rounded-lg border px-4 py-3 text-sm', styles)}>
      {titre && <p className="mb-1 font-bold">{titre}</p>}
      {children}
    </div>
  );
}

export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-gris-600" role="status">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-ynov-turquoise border-t-transparent" aria-hidden />
      {texte}
    </div>
  );
}

export function Vide({ titre, children }: { titre: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gris-300 bg-gris-50 px-6 py-10 text-center">
      <p className="font-semibold text-ynov-noir">{titre}</p>
      {children && <div className="mt-1 text-sm text-gris-600">{children}</div>}
    </div>
  );
}

export function Champ({ label, aide, erreur, children, obligatoire }: { label: string; aide?: React.ReactNode; erreur?: string | null; children: (id: string) => React.ReactNode; obligatoire?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ynov-noir">
        {label} {obligatoire && <span className="text-red-600" aria-hidden>*</span>}
      </label>
      {children(id)}
      {aide && <p className="mt-1 text-xs text-gris-600">{aide}</p>}
      {erreur && <p className="mt-1 text-xs font-medium text-red-700">{erreur}</p>}
    </div>
  );
}

export const classeSaisie =
  'block w-full rounded-lg border border-gris-300 bg-white px-3 py-2 text-sm text-ynov-noir placeholder:text-gris-400 focus:border-ynov-turquoise focus:outline-none focus:ring-2 focus:ring-ynov-turquoise/30 disabled:bg-gris-100';

export function Case({ coche, onChange, children, disabled }: { coche: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-ynov-noir">
      <input type="checkbox" checked={coche} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gris-300 accent-ynov-turquoise" />
      <span>{children}</span>
    </label>
  );
}

/** Boîte de dialogue modale accessible (Échap pour fermer). */
export function Dialogue({ ouvert, titre, onFermer, children }: { ouvert: boolean; titre: string; onFermer: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);
  return (
    <dialog
      ref={ref}
      onClose={onFermer}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-gris-200 p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-ynov-noir">{titre}</h2>
          <button onClick={onFermer} className="rounded p-1 text-gris-500 hover:bg-gris-100" aria-label="Fermer">
            ✕
          </button>
        </div>
        {ouvert && children}
      </div>
    </dialog>
  );
}

export function Tableau({ entetes, children }: { entetes: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gris-200 text-xs uppercase tracking-wide text-gris-500">
            {entetes.map((e, i) => (
              <th key={i} className="px-3 py-2 font-semibold">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gris-100">{children}</tbody>
      </table>
    </div>
  );
}

export function BoutonPlus({ visible, chargement, onClick }: { visible: boolean; chargement: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Bouton variante="secondaire" enCours={chargement} onClick={onClick}>
        Afficher plus
      </Bouton>
    </div>
  );
}

export function Statistique({ libelle, valeur, detail, href, accent }: { libelle: string; valeur: React.ReactNode; detail?: string; href?: string; accent?: boolean }) {
  const contenu = (
    <div className={cx('h-full rounded-xl border p-4 transition-colors', accent ? 'border-ynov-turquoise bg-ynov-turquoise/5' : 'border-gris-200 bg-white', href && 'hover:border-ynov-turquoise')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gris-500">{libelle}</p>
      <p className="mt-1 text-3xl font-bold text-ynov-noir">{valeur}</p>
      {detail && <p className="mt-1 text-xs text-gris-600">{detail}</p>}
    </div>
  );
  return href ? <Link href={href}>{contenu}</Link> : contenu;
}

export function Onglets<T extends string>({ valeur, options, onChange }: { valeur: T; options: Array<{ valeur: T; libelle: string }>; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-gris-100 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.valeur}
          role="tab"
          aria-selected={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={cx('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', valeur === o.valeur ? 'bg-white text-ynov-noir shadow-sm' : 'text-gris-600 hover:text-ynov-noir')}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}
