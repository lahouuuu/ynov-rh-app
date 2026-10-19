# Recette — scénarios de vérification

Les règles de **solde** et d’**autorisation** sont couvertes par des tests automatisés ; les parcours d’interface sont complétés par la recette manuelle ci-dessous (comptes fictifs du `README`, mot de passe `Demo-Ynov-2026!`).

## 1. Tests automatisés

| Commande | Contenu | Résultat attendu |
|---|---|---|
| `npm test` | `functions/test/unit` — calendrier (jours ouvrés, fériés, demi-journées, scission annuelle, fuseau), solde et répartition payée / non payée, autorisations (périmètres, séparation des droits, administrateur sans accès), circuit de validation, contrôle des fichiers, CSV | 49 tests verts |
| `npm run test:integration` | `functions/test/integration/scenarios.test.ts` — API réelle sur émulateurs Auth / Firestore / Storage | 42 tests verts |

Correspondance avec les scénarios minimum du cahier des charges (§6) :

| Scénario | Test(s) d’intégration |
|---|---|
| Droits annuels : 18 jours, modification RH motivée et historisée | `Droits annuels › …` (4 tests) |
| Congé payé : circuit prévu, débit seulement après approbation RH | `Congé payé › suit le circuit prévu…`, `un refus doit être motivé…` |
| Solde insuffisant : 2 restants, 4 demandés → 2 payés + 2 non payés, accord requis | `Solde insuffisant et solde nul › avec 2 jours restants…` |
| Solde nul : tout en non payé, sans débit | `… › avec un solde nul…` |
| Cohérence et annulation : pas de double débit, restitution des seuls jours payés | `Cohérence et annulation › …` (6 tests, dont revérification du solde à la décision) |
| Signalement et pièce : sans justificatif, dépôt ultérieur, traitement RH | `Signalement et pièce › …` (6 tests) |
| Accès et livraison : hors périmètre refusé, y compris au téléchargement | `Accès et séparation des droits › …` (6 tests) |
| Fiche F031 (demande de l’encadrant) : visas électroniques, accord de la direction, vérification, brouillon | `Fiche F031 : visas électroniques et accord de la direction › …` (4 tests) |
| Absence imputée sur les congés sous réserve de validation hiérarchique | `Imputation d’une absence…` (1 test) |
| Refus d’une demande par le responsable (N+1) | `Refus d’une demande par le responsable (N+1)` (2 tests) |
| Invitation par e-mail, mot de passe provisoire, choix du mot de passe personnel | `Invitation par e-mail et mot de passe provisoire` (3 tests) |
| Création du premier super-administrateur (une seule fois, clé d’installation) | `Installation : création du premier super-administrateur` (1 test) |
| Sécurité : pas d’auto-attribution de rôle par l’admin, mot de passe robuste, en-têtes, corps limités, signatures non injectables | `Durcissement de sécurité › …` (4 tests) |

## 2. Recette manuelle (interface)

Cocher chaque ligne lors de la démonstration. Les parcours M2 à M6c, M6d, M10, M11, M13, M16 et M20 ont été rejoués automatiquement dans un navigateur (Chromium) le 01/10/2026 sur l’environnement local, avec des résultats conformes ; les autres lignes sont à dérouler à la main avant la démonstration.

| # | Compte | Étapes | Résultat attendu | OK |
|---|---|---|---|---|
| M1 | — | Ouvrir l’application, cliquer « Mot de passe oublié ? » | Message neutre (n’indique pas si le compte existe) | ☐ |
| M1b | admin | Comptes → Nouveau compte | Invitation envoyée par e-mail (sans SMTP : mot de passe provisoire affiché une fois) ; état « Invitation envoyée » | ☐ |
| M1c | nouvel employé | Connexion avec le mot de passe provisoire | Redirection vers « Choisir mon mot de passe » ; aucune autre page accessible ; après choix, accès normal et ancien mot de passe refusé | ☐ |
| M1d | — | Ouvrir `/installation` | « Application déjà installée » (données de démonstration) ; sur une base vide : création du super-administrateur avec la clé `installation-locale` | ☐ |
| M2 | youssef | Mes congés | Année, attribués 18, décomptés 16, ajustements 0, solde **2 j**, mouvements | ☐ |
| M3 | youssef | Nouvelle demande, 4 jours ouvrés | Récapitulatif : 2 payés (dates) + 2 non payés (dates) ; « Soumettre » désactivé tant que l’accord n’est pas coché | ☐ |
| M4 | youssef | Cocher l’accord, soumettre | Demande « Soumise », solde toujours 2 j | ☐ |
| M5 | responsable | Mon équipe → demande de Youssef → « Transmettre aux RH avec mon avis » (favorable) | Statut « En décision RH » ; notification aux RH | ☐ |
| M5b | responsable | Mon équipe → une autre demande soumise → « Refuser la demande », motif obligatoire | Statut « Refusée » ; « Non transmise : refusée par le responsable » ; le collaborateur est notifié ; aucune action RH possible | ☐ |
| M6 | rh | Demandes de congé → approuver | Statut « Approuvée » ; solde de Youssef 0 j ; historique horodaté complet | ☐ |
| M6b | salma | Mes congés › Nouvelle demande : remplir le formulaire F031 en ligne | Identité non modifiable, durée / reprise / reste acquis calculés ; envoi impossible sans la case de certification ; cases RAF et direction verrouillées | ☐ |
| M6c | direction | Fiches à signer → ouvrir la fiche → « Signer l’accord » | Visa « Signé électroniquement » horodaté ; fiche complète, PDF sans filigrane ; aucun autre profil ne voit ce bouton | ☐ |
| M6d | rh | Vérifier une fiche (n° + code du PDF), puis un code modifié | « Fiche authentique et à jour », puis « Code invalide » | ☐ |
| M7 | rh | Re-cliquer « Approuver » dans un autre onglet resté ouvert | Refus « statut incompatible » ; aucun double débit | ☐ |
| M8 | imane | Nouvelle demande 3 jours | Tout en non payé ; après approbation, solde inchangé (0 j) | ☐ |
| M9 | salma | Demande approuvée → « Demander l’annulation » ; rh : accepter | Jours payés restitués une fois ; statut « Annulée » | ☐ |
| M10 | salma | Absences et retards → absence « Maladie » sans fichier | Enregistrée ; justificatif « À fournir » + échéance ; qualification « À examiner » | ☐ |
| M11 | responsable | Ouvrir l’absence de Salma | Motif « confidentiel », aucun fichier visible ; « J’ai pris connaissance » | ☐ |
| M12 | salma | Joindre un PDF ; tenter un `.exe` renommé en `.pdf` | PDF accepté ; faux PDF refusé | ☐ |
| M13 | rh | Refuser la pièce (motif), puis Salma dépose un complément, RH accepte, qualifie « Justifié », clôture | Décisions horodatées, notifications au collaborateur | ☐ |
| M14 | salma | Retard 09:00, arrivée réelle 09:47 puis correction à 09:40 | Durée 47 puis 40 min ; motif exigé pour la correction ; historique avant/après | ☐ |
| M15 | rh.rabat | Ouvrir l’URL d’une demande de Salma | « Vous n’avez pas accès à cette ressource » | ☐ |
| M16 | admin | Ouvrir l’URL d’une demande | Accès refusé (l’administrateur n’accède pas aux dossiers) | ☐ |
| M17 | admin | Créer un compte, le rattacher, puis le désactiver | Dotation 18 j créée ; le compte désactivé ne peut plus se connecter | ☐ |
| M18 | rh | États et export → exporter les congés | Fichier CSV ouvert dans Excel, accents corrects | ☐ |
| M19 | responsable | Exporter (URL `/rh/export`) | Refusé (RH uniquement) | ☐ |
| M20 | tous | Téléphone (≈ 390 px) | Menu repliable, listes en cartes, formulaires utilisables | ☐ |

## 3. Anomalies connues

Aucune anomalie bloquante (fuite de données ou calcul de solde incohérent) n’est connue à la date de livraison. Les limites fonctionnelles sont listées dans le rapport (§8).
