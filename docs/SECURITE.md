# Sécurité — mesures en place et check-list de mise en production

Ce document décrit les protections de l’application et ce qu’il reste à configurer dans la console Firebase / Google Cloud avant une mise en ligne sur un domaine officiel de Maroc Ynov Campus.

## 1. Principes

| Principe | Mise en œuvre |
|---|---|
| **Aucune confiance dans le navigateur** | Les règles Firestore et Storage refusent tout accès direct (`allow read, write: if false`). Toutes les données passent par l’API, qui contrôle l’identité, le compte actif, le rôle et le périmètre **à chaque requête**. |
| **Moindre privilège** | Collaborateur → ses dossiers ; responsable → son équipe ; RH et direction → les campus de leur périmètre ; administrateur → comptes uniquement (aucun dossier, aucun justificatif). La direction ne voit ni signalements ni justificatifs. |
| **Séparation des pouvoirs** | Personne ne valide, ne signe ou ne modifie les droits de son propre dossier, même en cumulant les rôles. Un administrateur ne peut pas modifier ses propres rôles ni son périmètre (il ne peut donc pas s’attribuer le rôle RH). |
| **Traçabilité** | Historique et mouvements de solde en ajout seul, écrits dans la même transaction que l’action ; consultations de justificatifs, éditions et vérifications de fiches tracées ; refus d’accès journalisés (`Accès refusé` dans Cloud Logging). |

## 2. Fiche F031 : signatures non falsifiables

- Les trois visas (employé, RAF, direction régionale) sont **apposés par le serveur** au nom de l’utilisateur authentifié, avec l’horodatage serveur. Le client n’envoie jamais de signature : un champ `signatures` ou `statut` ajouté à une requête est ignoré (test automatisé).
- Visa de l’employé : case « Je certifie… » obligatoire à la soumission (sinon 400). Visa de la RAF : apposé par le gestionnaire RH qui approuve. Accord de la direction : uniquement par un compte `direction` du périmètre, jamais pour soi-même ; un seul accord possible (409 ensuite).
- Chaque fiche porte un **code de vérification** (SHA-256 salé par un secret aléatoire propre à la demande, jamais transmis au client) calculé sur le contenu et les visas. Une fiche imprimée modifiée ou périmée est détectée dans « Vérifier une fiche ». Un filigrane « NON DÉFINITIVE » est apposé tant que les trois visas ne sont pas réunis.

## 3. Protections de l’API

| Menace | Protection |
|---|---|
| Jeton volé / compte désactivé | `verifyIdToken(…, checkRevoked = true)` + relecture du profil à chaque requête ; la désactivation révoque les sessions. |
| Accès hors périmètre (IDOR) | Contrôle `peutVoir…` sur chaque ressource ; listes filtrées par le serveur selon l’utilisateur, jamais selon un paramètre client. |
| Injection / données invalides | Validation zod de toutes les entrées ; requêtes Firestore paramétrées ; CSV protégé contre l’injection de formules. |
| Fichiers malveillants | Type réel vérifié par signature binaire (PDF/JPEG/PNG), 10 Mo, 3 pièces ; stockage privé ; téléchargement en `attachment`, `nosniff`, `no-store`. |
| Déni de service / abus | Corps limités (100 Ko, 15 Mo pour les seuls dépôts) ; limites par utilisateur (300 req/min, 30 dépôts/10 min, 20 exports/10 min) ; `maxInstances` borné. |
| Appels hors application | Firebase App Check (reCAPTCHA Enterprise) prêt à activer : `NEXT_PUBLIC_APPCHECK_CLE_SITE` côté site, `APPCHECK_OBLIGATOIRE=true` côté fonction. |
| CORS | Aucune origine tierce en production (même origine via Hosting) ; `localhost` autorisé uniquement en local. |
| Fuite d’informations | Messages d’erreur génériques, pas de pile d’appel ; en-têtes `X-Powered-By` retirés. |

## 4. Protections du site (Firebase Hosting)

En-têtes appliqués à toutes les pages (`firebase.json`) : `Content-Security-Policy` (sources limitées au site et aux services Firebase/reCAPTCHA, `frame-ancestors 'none'`, `object-src 'none'`), `Strict-Transport-Security` (2 ans, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.

Côté navigateur : session limitée au navigateur ouvert (`browserSessionPersistence`) et **déconnexion automatique après 30 min d’inactivité** (`NEXT_PUBLIC_INACTIVITE_MINUTES`). Les scripts Next.js en ligne imposent `'unsafe-inline'` pour les scripts ; l’absence de tout rendu de HTML fourni par l’utilisateur (React échappe les contenus) limite le risque XSS.

## 5. Check-list avant mise en production

1. **Authentification** (Console › Authentication › Paramètres)
   - activer la **protection contre l’énumération des adresses e-mail** ;
   - définir une **politique de mot de passe** (12 caractères, majuscule, minuscule, chiffre) ;
   - personnaliser le modèle d’e-mail de réinitialisation et le domaine d’envoi ;
   - ajouter le domaine officiel aux **domaines autorisés** ;
   - pour les comptes administrateurs et RH : envisager l’authentification multifacteur (offre Identity Platform).
2. **App Check** : créer une clé reCAPTCHA Enterprise pour le domaine, renseigner `NEXT_PUBLIC_APPCHECK_CLE_SITE`, puis passer `APPCHECK_OBLIGATOIRE=true` (variable de la fonction) une fois les appels vérifiés dans la console.
3. **Clé d’API web** : restreindre la clé aux référents HTTP du domaine officiel (Google Cloud › Identifiants).
4. **Domaine** : brancher le domaine officiel sur Firebase Hosting (certificat géré automatiquement) ; mettre à jour la CSP si d’autres domaines sont nécessaires.
5. **Comptes** : créer le premier administrateur avec `npm run creer-admin`, puis les comptes RH et direction ; ne jamais utiliser les comptes de démonstration ni `seed --confirmer` en production.
6. **Sauvegardes** : activer les sauvegardes planifiées ou la restauration à un instant donné (PITR) de Firestore.
7. **Surveillance** : alertes Cloud Logging sur `Accès refusé` et `Limite de débit atteinte` ; alerte budgétaire de facturation.
8. **Données personnelles** : faire valider la notice `/confidentialite` et les durées de conservation par l’établissement ; accomplir les formalités CNDP (loi n° 09-08) si nécessaire.
9. **Dépendances** : `npm audit` à zéro vulnérabilité de production au 13/10/2026 (frontend et API) ; relancer avant chaque livraison.
