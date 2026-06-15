# URSSAF — Récupération des appels de cotisations

Application autonome dédiée à l'**URSSAF**, pour un cabinet **tiers déclarant / tiers mandaté** :
un seul compte cabinet donne accès à tous les clients, chacun identifié par son **SIRET**.

Le robot se connecte, recherche le client par SIRET, ouvre sa **messagerie**, et télécharge
**tous les documents** (PDF) — automatiquement, via Playwright.

## Prérequis

- **Node.js 22 ou supérieur** (requis par le module natif `node:sqlite`). À installer une
  seule fois depuis https://nodejs.org. Vérifier avec `node -v`.

## Lancement

1. Double-cliquer sur **`Démarrer.bat`**
2. **Au premier lancement uniquement**, les composants s'installent automatiquement
   (dépendances + navigateur Chromium) : cela prend quelques minutes. Les fois suivantes,
   le démarrage est immédiat.
3. Le navigateur s'ouvre sur http://localhost:3001 (sinon, ouvrir cette adresse).
4. **Plus de fenêtre noire à garder ouverte** : le serveur tourne en arrière-plan, sans fenêtre.
   La petite fenêtre de démarrage se ferme toute seule après le lancement.

### Suivre l'avancement / arrêter

- Le panneau **« Journal en direct »** en haut de la page affiche l'avancement des
  récupérations en temps réel (connexion, documents téléchargés, erreurs…).
- Pour **arrêter** l'application : bouton **« ⏻ Quitter »** en haut de la page, ou
  double-clic sur **`Quitter.bat`**.

## Mise à jour automatique

À chaque démarrage, l'application vérifie sur GitHub si une version plus récente existe et
**se met à jour toute seule** avant de démarrer (vos données, vos PDF et votre configuration
sont conservés). Aucune manipulation nécessaire.

> Remarque : cette bascule vers la mise à jour automatique nécessite **une dernière
> installation manuelle** (re-télécharger le projet une fois). Ensuite, tout est automatique.

## Première utilisation

1. **Compte cabinet URSSAF** : renseigner l'identifiant (e-mail) + mot de passe du compte
   tiers déclarant, **une seule fois** (panneau en haut).
2. **Synchroniser les clients** : bouton **« ↻ Synchroniser depuis l'URSSAF »** (panneau Clients).
   Le robot se connecte et **importe automatiquement toute la liste des clients** du portefeuille
   cabinet (nom + identifiant SIRET ou n° de compte). Plus besoin de les saisir un par un.
   *(Tu peux aussi ajouter/modifier un client manuellement si besoin.)*
3. Cliquer **« Récupérer »** (ou **« Tout récupérer »**) → les appels de cotisations PDF sont
   téléchargés dans `downloads/<client>/` (ou dans le dossier choisi).

> Certains clients (praticiens / professions libérales sans SIRET) ont un **n° de compte URSSAF**
> (ex. `GQ815739800M01`) au lieu d'un SIRET — c'est normal et géré automatiquement.
> Un client sans appel de cotisations disponible n'est pas une erreur (rien à récupérer).

## Réglages

- **Dossier d'enregistrement** : où ranger les PDF (un sous-dossier par client). Un client
  peut avoir son propre dossier (dans sa fiche).
- Fichier `.env` (copié depuis `.env.example`) pour le port, le mode visible/invisible, etc.

## Sécurité

- Le mot de passe du compte cabinet est **chiffré** (AES-256-GCM) ; la clé est générée
  automatiquement dans `data/secret.key` (ne pas la partager).
- Données et documents restent **en local** sur le poste.

## Technique

- Node.js + Express, base SQLite (module natif `node:sqlite`), Playwright (Chromium).
- Connecteur : `src/scraper-urssaf.js` (parcours se-connecter → tdbec → webti → messagerie dcl).

> ⚠️ L'URSSAF bloque un compte après plusieurs échecs de mot de passe. Le compte cabinet
> étant partagé, vérifie bien les identifiants avant de lancer « Tout récupérer ».
