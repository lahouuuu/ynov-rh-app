'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useListePaginee } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { instant } from '../../lib/format';
import { Alerte, Bouton, BoutonPlus, Carte, Chargement, cx, EnTetePage, Onglets, Vide } from '../../components/ui';

interface Notif { id: string; titre: string; message: string; lien: string; lu: boolean; createdAt: string }

export default function PageNotifications() {
  const { rafraichir } = useSession();
  const [filtre, setFiltre] = useState<'toutes' | 'nonLues'>('toutes');
  const liste = useListePaginee<Notif>(`/notifications?limite=20${filtre === 'nonLues' ? '&nonLues=true' : ''}`);

  const marquer = async (n: Notif) => {
    if (!n.lu) {
      await api.post(`/notifications/${n.id}/lue`);
      void rafraichir();
    }
  };

  return (
    <>
      <EnTetePage
        titre="Notifications"
        actions={<Bouton variante="secondaire" onClick={async () => { await api.post('/notifications/tout-lire'); await rafraichir(); liste.recharger(); }}>Tout marquer comme lu</Bouton>}
      />
      <Onglets valeur={filtre} onChange={setFiltre} options={[{ valeur: 'toutes', libelle: 'Toutes' }, { valeur: 'nonLues', libelle: 'Non lues' }]} />
      <Carte>
        {liste.erreur && <Alerte>{liste.erreur}</Alerte>}
        {liste.chargement && !liste.elements.length ? <Chargement /> : !liste.elements.length ? <Vide titre="Aucune notification" /> : (
          <ul className="divide-y divide-gris-100">
            {liste.elements.map((n) => (
              <li key={n.id}>
                <Link href={n.lien} onClick={() => marquer(n)} className={cx('flex gap-3 px-2 py-3 hover:bg-gris-50', !n.lu && 'bg-ynov-turquoise/5')}>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.lu ? 'bg-transparent' : 'bg-ynov-turquoise')} aria-label={n.lu ? 'Lue' : 'Non lue'} />
                  <span className="min-w-0">
                    <span className={cx('block text-sm', !n.lu && 'font-bold')}>{n.titre}</span>
                    <span className="block text-sm text-gris-600">{n.message}</span>
                    <span className="block text-xs text-gris-400">{instant(n.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <BoutonPlus visible={liste.aSuivant} chargement={liste.chargement} onClick={liste.plus} />
      </Carte>
    </>
  );
}
