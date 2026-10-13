'use client';
/**
 * Administration des comptes : création (pas d'inscription publique), rôles,
 * rattachements (campus, service, responsable), périmètre RH, désactivation.
 */
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useAction, useApi, useListePaginee } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import { ROLES } from '../../../lib/libelles';
import type { Profil, Referentiels, Role } from '../../../lib/types';
import { Alerte, Bouton, BoutonPlus, Carte, Case, Champ, Chargement, classeSaisie, Dialogue, EnTetePage, Pastille, Tableau, Vide } from '../../../components/ui';

interface Saisie {
  email: string; prenom: string; nom: string; roles: Role[]; campusId: string; serviceId: string; fonction: string; managerId: string;
  perimetreTous: boolean; perimetreCampus: string[]; motDePasseInitial: string;
}

const vierge: Saisie = { email: '', prenom: '', nom: '', roles: ['collaborateur'], campusId: '', serviceId: '', fonction: '', managerId: '', perimetreTous: false, perimetreCampus: [], motDePasseInitial: '' };

function Formulaire({ initial, creation, refs, onValider, enCours, erreur }: { initial: Saisie; creation: boolean; refs: Referentiels; onValider: (s: Saisie) => void; enCours: boolean; erreur: string | null }) {
  const [s, setS] = useState(initial);
  const maj = (p: Partial<Saisie>) => setS((x) => ({ ...x, ...p }));
  const basculerRole = (r: Role, v: boolean) => maj({ roles: v ? [...s.roles, r] : s.roles.filter((x) => x !== r) });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onValider(s); }}>
      {erreur && <Alerte>{erreur}</Alerte>}
      {creation && (
        <Champ label="Adresse e-mail" obligatoire>{(id) => <input id={id} type="email" required value={s.email} onChange={(e) => maj({ email: e.target.value })} className={classeSaisie} />}</Champ>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prénom" obligatoire>{(id) => <input id={id} required value={s.prenom} onChange={(e) => maj({ prenom: e.target.value })} className={classeSaisie} />}</Champ>
        <Champ label="Nom" obligatoire>{(id) => <input id={id} required value={s.nom} onChange={(e) => maj({ nom: e.target.value })} className={classeSaisie} />}</Champ>
      </div>
      <Champ label="Fonction" aide="Intitulé du poste, reporté sur la fiche de congé.">
        {(id) => <input id={id} maxLength={100} value={s.fonction} onChange={(e) => maj({ fonction: e.target.value })} className={classeSaisie} />}
      </Champ>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Rôles</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <Case key={r} coche={s.roles.includes(r)} disabled={r === 'collaborateur'} onChange={(v) => basculerRole(r, v)}>{ROLES[r]}</Case>
          ))}
        </div>
        <p className="mt-1 text-xs text-gris-500">Le rôle administrateur ne donne pas accès aux dossiers ni aux justificatifs.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Champ label="Campus" obligatoire>
          {(id) => <select id={id} required value={s.campusId} onChange={(e) => maj({ campusId: e.target.value })} className={classeSaisie}><option value="">—</option>{refs.campus.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>}
        </Champ>
        <Champ label="Service" obligatoire>
          {(id) => <select id={id} required value={s.serviceId} onChange={(e) => maj({ serviceId: e.target.value })} className={classeSaisie}><option value="">—</option>{refs.services.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>}
        </Champ>
        <Champ label="Responsable">
          {(id) => <select id={id} value={s.managerId} onChange={(e) => maj({ managerId: e.target.value })} className={classeSaisie}><option value="">Aucun</option>{refs.responsables.map((c) => <option key={c.uid} value={c.uid}>{c.nomComplet}</option>)}</select>}
        </Champ>
      </div>
      {(s.roles.includes('rh') || s.roles.includes('direction')) && (
        <fieldset className="rounded-lg border border-gris-200 p-3">
          <legend className="px-1 text-sm font-semibold">Périmètre (RH / direction régionale)</legend>
          <Case coche={s.perimetreTous} onChange={(v) => maj({ perimetreTous: v })}>Tous les campus</Case>
          {!s.perimetreTous && (
            <div className="mt-2 flex flex-wrap gap-3">
              {refs.campus.map((c) => (
                <Case key={c.id} coche={s.perimetreCampus.includes(c.id)} onChange={(v) => maj({ perimetreCampus: v ? [...s.perimetreCampus, c.id] : s.perimetreCampus.filter((x) => x !== c.id) })}>{c.nom}</Case>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {creation && (
        <Champ label="Mot de passe initial" aide="Facultatif. Sinon, transmettez le lien de définition du mot de passe affiché après la création.">
          {(id) => <input id={id} type="text" minLength={8} value={s.motDePasseInitial} onChange={(e) => maj({ motDePasseInitial: e.target.value })} className={classeSaisie} />}
        </Champ>
      )}
      <div className="flex justify-end"><Bouton type="submit" enCours={enCours}>{creation ? 'Créer le compte' : 'Enregistrer'}</Bouton></div>
    </form>
  );
}

function versCorps(s: Saisie, creation: boolean) {
  return {
    ...(creation ? { email: s.email.trim(), ...(s.motDePasseInitial ? { motDePasseInitial: s.motDePasseInitial } : {}) } : {}),
    prenom: s.prenom.trim(), nom: s.nom.trim(), roles: s.roles, campusId: s.campusId, serviceId: s.serviceId, fonction: s.fonction.trim(),
    managerId: s.managerId || null, perimetreRh: { tous: s.perimetreTous, campusIds: s.perimetreTous ? [] : s.perimetreCampus },
  };
}

export default function PageComptes() {
  const { profil: moi } = useSession();
  const liste = useListePaginee<Profil>('/admin/utilisateurs?limite=25');
  const { donnees: refs } = useApi<Referentiels>('/referentiels');
  const action = useAction();
  const [edition, setEdition] = useState<null | { creation: boolean; profil?: Profil }>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const valider = async (s: Saisie) => {
    const creation = !!edition?.creation;
    const r = await action.executer<unknown>(() =>
      creation ? api.post<{ uid: string; lienMotDePasse: string | null }>('/admin/utilisateurs', versCorps(s, true)) : api.patch(`/admin/utilisateurs/${edition!.profil!.uid}`, versCorps(s, false)),
    );
    if (r) {
      setEdition(null);
      setMessage(creation ? 'Compte créé. La dotation de l’année en cours a été attribuée.' : 'Compte mis à jour.');
      if (creation) setLien((r as { lienMotDePasse: string | null }).lienMotDePasse);
      liste.recharger();
    }
  };

  const activer = async (p: Profil, actif: boolean) => {
    if (await action.executer(() => api.post(`/admin/utilisateurs/${p.uid}/${actif ? 'reactiver' : 'desactiver'}`))) {
      setMessage(`Compte ${actif ? 'réactivé' : 'désactivé'}.`);
      liste.recharger();
    }
  };

  const lienReinit = async (p: Profil) => {
    const r = await action.executer(() => api.post<{ lienMotDePasse: string }>(`/admin/utilisateurs/${p.uid}/lien-mot-de-passe`));
    if (r) setLien(r.lienMotDePasse);
  };

  const nomRef = (liste: Array<{ id: string; nom: string }> | undefined, id: string) => liste?.find((x) => x.id === id)?.nom ?? id;

  return (
    <>
      <EnTetePage titre="Comptes" sousTitre="Création des comptes, rôles et rattachements. Aucune inscription publique." actions={<Bouton disabled={!refs} onClick={() => { action.setErreur(null); setEdition({ creation: true }); }}>Nouveau compte</Bouton>} />
      {message && <div className="mb-4"><Alerte ton="succes">{message}</Alerte></div>}
      {action.erreur && !edition && <div className="mb-4"><Alerte>{action.erreur}</Alerte></div>}
      {lien && (
        <div className="mb-4">
          <Alerte ton="info" titre="Lien de définition du mot de passe">
            <p className="break-all font-mono text-xs">{lien}</p>
            <div className="mt-2 flex gap-2">
              <Bouton variante="secondaire" className="px-3 py-1" onClick={() => navigator.clipboard.writeText(lien)}>Copier</Bouton>
              <Bouton variante="fantome" className="px-3 py-1" onClick={() => setLien(null)}>Masquer</Bouton>
            </div>
          </Alerte>
        </div>
      )}
      <Carte>
        {liste.erreur && <Alerte>{liste.erreur}</Alerte>}
        {liste.chargement && !liste.elements.length ? <Chargement /> : !liste.elements.length ? <Vide titre="Aucun compte" /> : (
          <Tableau entetes={['Nom', 'Rôles', 'Rattachement', 'État', '']}>
            {liste.elements.map((p) => (
              <tr key={p.uid} className="hover:bg-gris-50">
                <td className="px-3 py-3"><p className="font-semibold">{p.nomComplet}</p><p className="text-xs text-gris-500">{p.email}</p></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{p.roles.filter((r) => r !== 'collaborateur').map((r) => <Pastille key={r} ton="info">{ROLES[r]}</Pastille>)}{p.roles.length === 1 && <Pastille>{ROLES.collaborateur}</Pastille>}</div></td>
                <td className="px-3 py-3 text-xs">{nomRef(refs?.campus, p.campusId)} · {nomRef(refs?.services, p.serviceId)}<br /><span className="text-gris-500">Resp. : {refs?.responsables.find((r) => r.uid === p.managerId)?.nomComplet ?? '—'}</span></td>
                <td className="px-3 py-3">{p.actif ? <Pastille ton="succes">Actif</Pastille> : <Pastille ton="danger">Désactivé</Pastille>}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Bouton variante="fantome" className="px-2 py-1" disabled={!refs} onClick={() => { action.setErreur(null); setEdition({ creation: false, profil: p }); }}>Modifier</Bouton>
                    <Bouton variante="fantome" className="px-2 py-1" onClick={() => lienReinit(p)}>Lien mot de passe</Bouton>
                    {p.uid !== moi?.uid && (p.actif
                      ? <Bouton variante="danger" className="px-2 py-1" onClick={() => activer(p, false)}>Désactiver</Bouton>
                      : <Bouton variante="secondaire" className="px-2 py-1" onClick={() => activer(p, true)}>Réactiver</Bouton>)}
                  </div>
                </td>
              </tr>
            ))}
          </Tableau>
        )}
        <BoutonPlus visible={liste.aSuivant} chargement={liste.chargement} onClick={liste.plus} />
      </Carte>

      <Dialogue ouvert={!!edition} titre={edition?.creation ? 'Nouveau compte' : 'Modifier le compte'} onFermer={() => setEdition(null)}>
        {edition && refs && (
          <Formulaire
            refs={refs}
            creation={edition.creation}
            enCours={action.enCours}
            erreur={action.erreur}
            onValider={valider}
            initial={edition.profil ? {
              ...vierge, email: edition.profil.email, prenom: edition.profil.prenom, nom: edition.profil.nom, roles: edition.profil.roles,
              campusId: edition.profil.campusId, serviceId: edition.profil.serviceId, fonction: edition.profil.fonction ?? '', managerId: edition.profil.managerId ?? '',
              perimetreTous: edition.profil.perimetreRh.tous, perimetreCampus: edition.profil.perimetreRh.campusIds,
            } : vierge}
          />
        )}
      </Dialogue>
    </>
  );
}
