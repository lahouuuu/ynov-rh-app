'use client';
import { CarteSolde } from '../../components/CarteSolde';
import { ListeDemandes } from '../../components/ListeDemandes';
import { Carte, EnTetePage, LienBouton } from '../../components/ui';
import { aujourdhui } from '../../lib/format';

export default function PageMesConges() {
  const annee = Number(aujourdhui().slice(0, 4));
  return (
    <>
      <EnTetePage titre="Mes congés" sousTitre="Consultez vos droits et suivez vos demandes." actions={<LienBouton href="/conges/nouvelle">Nouvelle demande</LienBouton>} />
      <div className="space-y-6">
        <CarteSolde chemin={(a) => `/dotations/moi?annee=${a}`} anneeInitiale={annee} />
        <Carte titre="Mes demandes">
          <ListeDemandes vue="moi" />
        </Carte>
      </div>
    </>
  );
}
