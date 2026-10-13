# API — routes et contrôles d’accès

Base : `/api` (Firebase Hosting → Cloud Function `api`, région `europe-west1`).
Toutes les routes, sauf `GET /api/sante`, exigent l’en-tête `Authorization: Bearer <jeton d’identité Firebase>`.

Pour **chaque** requête, le serveur :

1. vérifie le jeton (signature, expiration, **révocation**) ;
2. relit le profil dans Firestore et refuse un compte inconnu ou **désactivé** ;
3. applique le contrôle de rôle et de **périmètre** propre à la route (fonctions de `functions/src/domain/authz.ts`).

Les erreurs ont la forme `{ "erreur": { "code": "…", "message": "message clair en français", "details": … } }`.
Codes HTTP : 400 (données invalides / règle métier), 401 (non authentifié), 403 (accès refusé), 404, 409 (conflit d’état : chevauchement, statut incompatible, accord requis, solde modifié…), 413 (corps trop volumineux), 429 (trop de requêtes), 500.

Les listes sont **paginées** : paramètres `limite` (≤ 100) et `curseur` ; réponse `{ elements, suivant }`.

## Session et paramètres

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/moi` | tout compte actif | Profil, rôles, nombre de notifications non lues |
| GET | `/tableau-de-bord` | tout compte actif | Indicateurs selon les rôles |
| GET | `/referentiels` | tout compte actif | Campus, services (+ responsables pour RH/admin) |
| GET | `/parametres` | tout compte actif | Dotation par défaut, calendrier, motifs, limites des pièces |
| PUT | `/parametres` | RH au périmètre global | Modification motivée et historisée |

## Demandes de congé

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/demandes/simulation` | collaborateur | Durée en jours ouvrés, solde avant/après, répartition payée/non payée et dates de chaque partie (aucune écriture) |
| POST | `/demandes` | collaborateur | Création (brouillon ou soumise). `cleIdempotence` obligatoire ; soumission : `attestation: true` obligatoire (visa électronique de l’employé) ; `accordNonPaye` exigé si le solde ne couvre pas la période (409 `ACCORD_REQUIS` sinon). Scission automatique sur deux années. |
| GET | `/demandes?vue=moi\|equipe\|rh\|direction&statut=&type=&ficheStatut=&du=&au=` | selon la vue | `equipe` : responsable ; `rh` / `direction` : limité aux campus du périmètre |
| GET | `/demandes/:id` | demandeur, son responsable, RH du périmètre | Détail + actions possibles + justificatifs visibles + historique |
| PUT | `/demandes/:id` | demandeur | Modification d’un **brouillon** |
| GET | `/demandes/:id/fiche/donnees` | demandeur, responsable, RH et direction du périmètre | Fiche F031 en ligne : contenu, visas électroniques, état, code de vérification (dès la soumission) |
| GET | `/demandes/:id/fiche` | idem | Même fiche en PDF (filigrane « NON DÉFINITIVE » tant que les trois visas ne sont pas réunis) ; édition tracée |
| POST | `/demandes/:id/direction` | direction régionale du périmètre (≠ demandeur) | `{ accord: true }` : visa de la direction ; `{ accord: false, motif }` : refus motivé → congé annulé, jours payés restitués |
| GET | `/demandes/fiches/verifier?numero=&code=` | personnes pouvant voir la demande | Contrôle d’authenticité d’une fiche imprimée (tracé) |
| POST | `/demandes/:id/soumettre` | demandeur | Brouillon → soumise (ou décision RH sans responsable) ; revérifie chevauchement et solde |
| POST | `/demandes/:id/avis` | responsable du demandeur (≠ demandeur) | Avis favorable / défavorable (motivé) → en décision RH |
| POST | `/demandes/:id/decision` | RH du périmètre (≠ demandeur) | Approbation (solde revérifié, débit des seuls jours payés, une seule fois) ou refus motivé |
| POST | `/demandes/:id/reconfirmer` | demandeur | Nouvelle répartition après changement de solde |
| POST | `/demandes/:id/annuler` | demandeur | Annulation immédiate avant décision ; **demande** d’annulation après approbation |
| POST | `/demandes/:id/annulation/decision` | RH du périmètre (≠ demandeur) | Accepter (restitution unique des jours payés ; régularisation si le congé a commencé) ou refuser |

## Signalements (absences / retards)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/signalements` | collaborateur | Déclaration immédiate (avec ou sans justificatif, a posteriori possible) ; notifie responsable + RH |
| GET | `/signalements?vue=…&type=&statutTraitement=&qualification=&du=&au=` | selon la vue | Le contenu médical est masqué pour le responsable |
| GET | `/signalements/:id` | déclarant, responsable, RH du périmètre | Détail + actions + justificatifs visibles + historique |
| PATCH | `/signalements/:id` | déclarant ou RH | Compléter (date de fin, arrivée réelle…) ; une **correction** exige un motif et garde l’ancienne valeur |
| POST | `/signalements/:id/prise-connaissance` | responsable | Ne remplace pas la décision RH |
| POST | `/signalements/:id/traitement` | RH du périmètre (≠ déclarant) | Qualification (justifié / non justifié motivé), statut de traitement, demande de justificatif avec échéance, `imputerConges` (absence imputée sur le solde après prise de connaissance du responsable, motivée, une seule fois) |

## Justificatifs

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/justificatifs` | déposant du dossier | PDF/JPEG/PNG vérifiés par signature binaire, 10 Mo max, 3 par dossier ; stockage privé |
| GET | `/justificatifs/:id/contenu` | déposant ou RH du périmètre | Téléchargement après contrôle d’accès (`Cache-Control: no-store`) ; **refusé** au responsable et à l’administrateur |
| POST | `/justificatifs/:id/decision` | RH du périmètre (≠ déposant) | Accepté / refusé motivé (complément possible) |

## Droits annuels

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/dotations/moi?annee=` | tout compte | Attribués, ajustements, décomptés, solde, en attente, mouvements |
| GET | `/dotations?annee=` | RH | Collaborateurs du périmètre avec leur solde |
| GET | `/dotations/:uid/:annee` | intéressé, responsable, RH du périmètre | Détail et mouvements |
| PUT | `/dotations/:uid/:annee` | RH du périmètre (pas ses propres droits) | Nouvelle dotation ; motif obligatoire ; bloqué si le solde devient négatif |
| POST | `/dotations/:uid/:annee/ajustements` | idem | Ajustement ± motivé ; bloqué si le solde devient négatif |
| POST | `/dotations/attribution` | RH | Crée les dotations manquantes de l’année (valeur par défaut) |

## Planning, notifications, export

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/planning?vue=&du=&au=` | selon la vue | Congés approuvés : nom et dates seulement |
| GET | `/notifications?nonLues=` | destinataire | Paginé |
| POST | `/notifications/:id/lue`, `/notifications/tout-lire` | destinataire | État lu / non lu |
| GET | `/export/demandes.csv?du=&au=`, `/export/signalements.csv?du=&au=` | RH (périmètre) | CSV `;` UTF-8 ; export tracé ; formules neutralisées |

## Administration

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET/POST | `/admin/utilisateurs` | administrateur | Liste ; création (Auth + profil + dotation de l’année) et lien de définition du mot de passe |
| PATCH | `/admin/utilisateurs/:uid` | administrateur | Rôles, rattachements, périmètre RH (propagés aux dossiers) |
| POST | `/admin/utilisateurs/:uid/desactiver` \| `reactiver` | administrateur | Désactivation dans Auth + révocation des sessions |
| POST | `/admin/utilisateurs/:uid/lien-mot-de-passe` | administrateur | Nouveau lien de réinitialisation |
| POST | `/admin/campus`, `/admin/services` | administrateur | Référentiels |
