# Ynov RH — Congés, absences et retards

Application web de gestion des congés, des absences et des retards du personnel de **Maroc Ynov Campus** (stage interne 2026 — ZERKDI Lahoucine, encadrant : Mounir BAALI).

| Composant | Technologie |
|---|---|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS, **export statique** (`out/`) |
| Hébergement | Firebase Hosting (`/api/**` → Cloud Functions) |
| Backend | Cloud Functions for Firebase (2ᵉ gén., `europe-west1`) — API Express en TypeScript |
| Authentification | Firebase Authentication (e-mail / mot de passe, sans inscription publique) |
| Données | Cloud Firestore (accès **uniquement** via l’API) |
| Justificatifs | Cloud Storage for Firebase (fichiers privés, téléchargement via l’API) |

Documentation complémentaire :

- [`docs/RAPPORT.md`](docs/RAPPORT.md) — rapport : besoin, architecture, modèle de données, réalisations, tests, limites, **estimation des coûts**.
- [`docs/API.md`](docs/API.md) — liste des routes de l’API et des droits associés.
- [`docs/RECETTE.md`](docs/RECETTE.md) — scénarios de recette (automatisés et manuels).
- [`docs/SECURITE.md`](docs/SECURITE.md) — mesures de sécurité et check-list de mise en production.

---

## 1. Installation

Prérequis : **Node.js 22**, **Java 21** (pour l’émulateur Firestore), **Firebase CLI** (`npm install -g firebase-tools`), Git.

```bash
git clone <url-du-depot> ynov-rh-app
cd ynov-rh-app
npm run installer:tout        # dépendances du frontend et de l’API (functions/)
```

## 2. Démarrage local (émulateurs, données fictives)

Tout fonctionne en local sans projet Firebase réel grâce au projet de démonstration `demo-ynov-rh`.

```bash
# 1) Fichiers de configuration locaux (.env.development.local pour les émulateurs,
#    .env.production.local à compléter pour le déploiement)
npm run configurer

# 2) Terminal 1 — émulateurs (Auth, Firestore, Storage, Functions, Hosting)
npm run emulateurs                      # interface : http://127.0.0.1:4000

# 3) Terminal 2 — données fictives (comptes de démonstration)
npm run seed

# 4) Terminal 3 — frontend avec rechargement à chaud
npm run dev                             # http://localhost:3000
```


Les données des émulateurs sont conservées dans `.donnees-emulateurs/` entre deux lancements (non versionné).

### Comptes de démonstration (fictifs)

Mot de passe commun : **`Demo-Ynov-2026!`**

| Compte | Rôle(s) | Intérêt pour la démonstration |
|---|---|---|
| `admin@demo.ynov.ma` | Administrateur | Comptes, rôles, rattachements ; **aucun** accès aux dossiers |
| `rh@demo.ynov.ma` | Gestionnaire RH (tous campus) | Décisions, justificatifs, droits annuels, export, paramètres |
| `direction@demo.ynov.ma` | Direction régionale (tous campus) | Signe l’accord des fiches F031 (congé de Salma en attente) ; ne voit ni signalements ni justificatifs |
| `responsable@demo.ynov.ma` | Responsable hiérarchique | Avis sur les congés de son équipe (Salma, Youssef, Imane) |
| `salma@demo.ynov.ma` | Collaboratrice | Solde 15 j — parcours « congé payé » |
| `youssef@demo.ynov.ma` | Collaborateur | **Solde 2 j** — scénario « solde insuffisant » (4 j → 2 payés + 2 non payés) |
| `imane@demo.ynov.ma` | Collaboratrice | **Solde 0 j** — scénario « solde nul » |
| `yassine@demo.ynov.ma` | Collaborateur (Admissions, sans responsable) | Hors de l’équipe du responsable ; sa demande passe directement en décision RH |

## 3. Configuration

| Fichier | Rôle |
|---|---|
| `.env.development.local` (non versionné) | Configuration utilisée par `npm run dev` (émulateurs), créée par `npm run configurer`. |
| `.env.production.local` (non versionné) | Configuration web du projet Firebase réel, utilisée par `npm run build` / `npm run deploy`. Modèle : `.env.example`. |
| `firebase.json` | Hosting (export statique, en-têtes de sécurité, réécriture `/api/**`), fonctions, règles, émulateurs. |
| `firestore.rules`, `storage.rules` | **Tout accès direct du navigateur est refusé** : seule l’API (SDK Admin) lit et écrit. |
| `firestore.indexes.json` | Index composites des listes filtrées (généré par `node scripts/generer-index-firestore.mjs`). |
| `functions/src/domain/parametres.ts` | Paramètres RH par défaut (18 jours/an, jours ouvrés lun.–ven., jours fériés marocains, motifs). Modifiables ensuite dans l’application (**RH › Paramètres**). |

Aucun secret n’est stocké dans le dépôt : les fonctions utilisent le compte de service par défaut de Google Cloud ; la configuration web Firebase est fournie par les fichiers `.env.*.local`.

## 4. Tests

```bash
npm test                    # tests unitaires : calendrier, soldes, répartition, autorisations, fichiers (49 tests)
npm run test:integration    # scénarios du cahier des charges de bout en bout sur les émulateurs (43 tests)
npm run verifier            # lint + types + tests unitaires + build
```

La CI GitHub Actions (`.github/workflows/qualite.yml`) exécute lint, typage, build, tests unitaires et d’intégration, ainsi qu’une analyse Semgrep.

## 5. Déploiement

Prérequis : projet Firebase **au forfait Blaze** (obligatoire pour Cloud Functions et pour le bucket Cloud Storage par défaut ; l’usage prévu reste dans les quotas gratuits — voir le rapport).

```bash
firebase login
firebase use ynov-rh-app
npm run configurer            # puis compléter .env.production.local (configuration web du projet)
npm run deploy                # build + règles + index + fonctions + hosting
```

Premier administrateur (pas d’inscription publique) — **depuis le site** :

1. Définir la clé d’installation (secret) et, pour l’envoi des invitations, le serveur SMTP :
   ```bash
   firebase functions:secrets:set CLE_INSTALLATION     # longue chaîne aléatoire, connue de vous seul
   firebase functions:secrets:set SMTP_MOT_DE_PASSE
   # functions/.env.ynov-rh-app (non versionné) :
   # SMTP_HOTE=smtp.office365.com  SMTP_PORT=587  SMTP_UTILISATEUR=rh@ynov.ma
   # SMTP_EXPEDITEUR="Ynov RH <rh@ynov.ma>"  URL_APPLICATION=https://rh.ynov.ma
   ```
2. Ouvrir `https://<domaine>/installation`, saisir la clé et créer le compte **super-administrateur**. La page se ferme définitivement dès qu’un administrateur existe.
3. Le super-administrateur crée ensuite les comptes (*Administration › Comptes*). Chaque employé reçoit **par e-mail un mot de passe provisoire** (aléatoire, valable 72 h) et le lien vers *Choisir mon mot de passe* ; tant qu’il n’a pas choisi son mot de passe personnel, l’application ne lui donne accès à rien d’autre. *Renvoyer l’invitation* régénère un mot de passe provisoire (invitation expirée, mot de passe perdu).

Sans SMTP configuré, l’e-mail n’est pas envoyé : l’administrateur voit alors une seule fois le mot de passe provisoire, à remettre en main propre. En local (émulateurs), la clé d’installation est `installation-locale` (les données de démonstration contiennent déjà un administrateur : la page indique « déjà installée »).

Alternative en ligne de commande :

```bash
cd functions
# clé de compte de service téléchargée depuis la console (NE PAS la versionner)
GOOGLE_APPLICATION_CREDENTIALS=../cle-service.json GCLOUD_PROJECT=ynov-rh-app \
  npm run creer-admin -- admin@ynov.ma Prénom Nom casablanca direction
```

Pour une démonstration en ligne avec les comptes fictifs : `GOOGLE_APPLICATION_CREDENTIALS=… GCLOUD_PROJECT=ynov-rh-app node lib/outils/seed.js --confirmer`.

Recommandations : activer une **alerte budgétaire** (ex. 10 €) dans Google Cloud, restreindre la clé d’API web aux domaines de l’application, activer la protection contre l’énumération des e-mails dans Firebase Authentication.

### Retour à une version précédente

Chaque livraison est identifiée par une étiquette Git (`v1.0.0`, …).

- **Frontend** : Console Firebase › Hosting › *Historique des versions* › « Restaurer » sur la version voulue (instantané), ou en ligne de commande `firebase hosting:clone ynov-rh-app@<VERSION_ID> ynov-rh-app:live`.
- **API, règles et index** : `git checkout v1.0.0` puis `firebase deploy --only functions,firestore,storage`.
- Les données ne sont jamais réécrites par un déploiement (historique et mouvements en ajout seul).

## 6. Parcours utilisateurs principaux

1. **Collaborateur** — *Mes congés* : droits de l’année, jours décomptés, ajustements, solde, demandes en attente, mouvements. *Nouvelle demande* : la durée en jours ouvrés et la répartition payée / non payée sont calculées par le serveur **avant l’envoi** ; si le solde est insuffisant, l’accord explicite est demandé. La demande se remplit **directement sur le formulaire F031/DI en ligne** ; la case « Je certifie… » vaut signature électronique de l’employé. Les visas de la RAF (à la décision RH) et de la direction régionale sont apposés depuis leurs propres comptes ; fiche en ligne et PDF avec code de vérification. *Absences et retards* : signalement immédiat, avec ou sans justificatif, compléments et corrections motivées.
2. **Responsable (N+1)** — *Mon équipe* : **refus** motivé et définitif d’une demande, ou transmission aux RH avec un avis favorable / défavorable ; prise de connaissance des signalements (motif médical masqué).
3. **Gestionnaire RH** — *Demandes de congé* : décision finale (solde revérifié côté serveur), annulations et régularisations ; *Signalements* : examen des justificatifs, qualification, clôture ; *Droits annuels* : dotation et ajustements motivés ; *États et export* : CSV ; *Paramètres*.
4. **Direction régionale** — *Fiches à signer* : accord (visa électronique) ou refus motivé des congés approuvés par les RH ; *Vérifier une fiche* : contrôle d’authenticité d’une fiche imprimée.
5. **Administrateur** — *Comptes* : création (invitation par e-mail avec mot de passe provisoire), renvoi d’invitation, rôles, campus / service / responsable, périmètre RH, désactivation ; *Campus et services*. Le premier administrateur est créé depuis la page *Installation*.
6. **Tout utilisateur** — *Changer mon mot de passe* (mot de passe actuel redemandé).

Toutes les dates sont affichées dans le fuseau **Africa/Casablanca**. L’application est entièrement en français et utilisable sur téléphone.

## 7. Structure du dépôt

```
app/                 pages Next.js (export statique ; détails via ?id=…)
components/          composants d’interface (charte Ynov)
lib/                 client API, session, formats, types
functions/
  src/domain/        règles métier pures et testées (calendrier, solde, autorisations, circuit)
  src/services/      services métier (transactions Firestore, historique, notifications)
  src/routes/        routes de l’API (validation des entrées avec zod)
  src/outils/        données fictives, création du premier administrateur
  test/unit/         tests unitaires
  test/integration/  scénarios de bout en bout sur émulateurs
docs/                rapport, API, recette
```
