# H$Λ BOT (Facebook Messenger)

Bot Facebook Messenger multifonction, **100 % gratuit**, construit en automatisant un **compte Facebook personnel** via une bibliothèque FCA non officielle (Facebook Chat API — ex: `ws3-fca`), Node.js (ES Modules) et Express.

Aucune fonctionnalité payante : pas de premium, pas de crédits, pas d'abonnement.

> Cette version remplace la version WhatsApp/Baileys du même projet, à la demande explicite de l'utilisateur, en connaissance du risque exposé ci-dessous.

---

## ⚠️ Lire avant toute chose : nature de ce projet

Facebook (Meta) **n'a pas d'API publique officielle pour automatiser un compte personnel**. La seule solution officielle et pérenne est la [Messenger Platform](https://developers.facebook.com/docs/messenger-platform) (Page Facebook + jeton + webhook), qui ne permet pas les mêmes fonctionnalités de groupe que ce projet.

Ce bot utilise à la place une bibliothèque **non officielle** qui rejoue une session de navigateur (cookies) pour automatiser **votre propre compte personnel**, exactement comme le fait Baileys pour WhatsApp — mais avec un profil de risque plus élevé côté Facebook :

- **C'est une violation explicite des conditions d'utilisation de Facebook** (clause anti-automatisation).
- **Le risque de suspension ou de bannissement du compte est réel et plus élevé que sur WhatsApp** — Meta détecte et sanctionne ce type d'automatisation plus systématiquement.
- **Utilisez de préférence un compte dédié**, jamais votre compte Facebook personnel principal.

### 🔒 Sécurité de la dépendance `ws3-fca`

Une vérification (Socket.dev) sur le paquet `ws3-fca` remonte plusieurs signaux à prendre au sérieux **avant d'installer quoi que ce soit** :
- code obfusqué
- CVE de sévérité élevée
- comportement potentiellement indésirable / "protestware"
- gouvernance du paquet instable (changements de mainteneurs fréquents)

**Avant `npm install`, faites votre propre vérification** (`npm audit`, [socket.dev](https://socket.dev), lecture du code source, ou choix d'un autre fork FCA que vous avez audité vous-même). Ce projet est structuré pour qu'un autre fork puisse être branché en modifiant une seule ligne d'import dans `src/handlers/connectionHandler.js` — voir ce fichier.

Cette bibliothèque détient une session active de votre compte : un fork malveillant pourrait exfiltrer vos cookies de session. Ne faites confiance qu'à un code que vous avez vous-même relu.

---

## Sommaire

1. [Fonctionnalités](#1-fonctionnalités)
2. [Installation sur Termux](#2-installation-sur-termux)
3. [Installation sur Linux](#3-installation-sur-linux)
4. [Configuration (.env)](#4-configuration-env)
5. [Obtenir account.json (session)](#5-obtenir-accountjson-session)
6. [Propriétaire (OWNER)](#6-propriétaire-owner)
7. [APIs externes](#7-apis-externes)
8. [Base de données](#8-base-de-données)
9. [Déploiement sur Render](#9-déploiement-sur-render)
10. [Liste des commandes](#10-liste-des-commandes)
11. [Système /contact](#11-système-contact)
12. [Limitations et avantages propres à Facebook](#12-limitations-et-avantages-propres-à-facebook)
13. [Dépannage](#13-dépannage)
14. [Sécurité](#14-sécurité)

---

## 1. Fonctionnalités

- 🤖 IA (chat, traduction, résumé, vision, OCR local, TTS...)
- 🖼️ Traitement d'image 100 % local (Jimp/ffmpeg) : resize, crop, rotate, blur, mèmes...
- 🎬 Traitement vidéo/audio via ffmpeg : conversion, découpe, compression, extraction audio...
- 📥 Téléchargement (YouTube, TikTok, Instagram, Facebook, Twitter, MediaFire, Google Drive)
- 🛠️ Utilitaires (calculatrice sécurisée, QR code, météo, devises, mots de passe...)
- 👥 Gestion de groupe **réellement complète** (kick, add, promote, tagall — voir §12)
- 🛡️ Modération automatique (antilink, antispam, antibadword, antiflood, welcome/goodbye — sans suppression de message, voir §12)
- 🎮 Commandes fun (quiz, devinettes, 8ball, action ou vérité...)
- 👑 Panneau OWNER (broadcast, maintenance, eval, backup, logs...)
- 📩 Système `/contact` bidirectionnel et persistant entre utilisateurs et OWNER

## 2. Installation sur Termux

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git ffmpeg

git clone <url-de-votre-dépôt> hsa-fb-bot
cd hsa-fb-bot
npm install   # voir l'avertissement de sécurité ci-dessus avant cette étape

cp .env.example .env
nano .env             # renseignez au minimum OWNER_ID
nano account.json      # remplacez [] par votre session exportée (voir §5)

npm start
```

## 3. Installation sur Linux

```bash
sudo apt update && sudo apt install -y nodejs npm ffmpeg git

git clone <url-de-votre-dépôt> hsa-fb-bot
cd hsa-fb-bot
npm install

cp .env.example .env
nano .env
nano account.json

npm start        # production
npm run dev       # développement (redémarrage automatique)
```

## 4. Configuration (.env)

| Variable | Description |
|---|---|
| `BOT_NAME` | Nom affiché du bot (par défaut `H$Λ BOT`) |
| `PREFIX` | Préfixe des commandes (par défaut `/`) |
| `ACCOUNT_JSON_PATH` | Chemin du fichier de session (par défaut `./account.json`) |
| `ACCOUNT_JSON` | Alternative : JSON de session collé directement (utile sur Render, voir §9) |
| `OWNER_ID` | Identifiant numérique Facebook du propriétaire |
| `FB_STATUS_THREAD_ID` | (optionnel) fil pour `/videostatus`, voir §12 |
| `PORT` | Port du serveur HTTP |
| `DATA_DIR` | Emplacement des données persistantes |

Toutes les autres variables (IA, météo, téléchargement...) sont optionnelles : chaque fonctionnalité concernée reste désactivée avec un message clair tant que sa clé n'est pas renseignée.

## 5. Obtenir account.json (session)

1. Connectez-vous à [facebook.com](https://facebook.com) dans un navigateur, avec le compte que vous voulez automatiser (⚠️ un compte dédié, pas votre compte principal).
2. Utilisez une extension d'export de cookies compatible FCA (couramment citée dans la communauté : "C3C FbState", disponible pour Chrome/Firefox) pour exporter la session au format attendu par ces bibliothèques.
3. Remplacez le contenu de `account.json` (livré comme un tableau vide `[]`) par le JSON obtenu.
4. Démarrez le bot. Sans réseau ni session valide, il refusera de démarrer avec un message clair plutôt que d'échouer silencieusement.
5. H$Λ BOT réenregistre périodiquement `account.json` (toutes les 10 minutes) pour conserver les rafraîchissements de session — gardez ce fichier dans un stockage persistant.

⚠️ `account.json` donne un accès complet à votre compte tant qu'il est valide. Ne le partagez jamais, ne le committez jamais (déjà exclu par `.gitignore`).

## 6. Propriétaire (OWNER)

`OWNER_ID` définit qui a accès au panneau `👑 OWNER`. Comme pour Telegram, OWNER est toujours un compte **distinct** de celui automatisé par le bot. Vérification faite côté serveur à chaque commande.

Facebook ne bloque pas l'envoi d'un premier message à un inconnu (contrairement aux bots Telegram) : `/contact` et `/report` fonctionnent donc sans configuration préalable côté OWNER — le message peut simplement atterrir dans l'onglet "Demandes de message" s'il n'a jamais échangé avec ce compte.

## 7. APIs externes

Identique à toute variante de H$Λ BOT : chaque intégration (IA, météo, removebg...) est optionnelle et documentée dans `.env.example`, avec un message clair si la clé manque plutôt qu'une fausse réponse.

## 8. Base de données

Stockage JSON persistant sur disque (`DATA_DIR`), sans dépendance native. Collections : `users`, `groups`, `group_members`, `admins`, `group_settings`, `warnings`, `bot_settings`, `stats`, `contact_messages`.

## 9. Déploiement sur Render

1. Poussez le projet sur un dépôt Git — **jamais `account.json` rempli** (déjà exclu par `.gitignore`).
2. Créez un Web Service Render (ou utilisez `render.yaml`).
3. Renseignez `OWNER_ID` dans les variables d'environnement.
4. Pour la session : collez le contenu de votre `account.json` dans la variable `ACCOUNT_JSON` — il sera écrit sur disque au démarrage.

⚠️ Le plan gratuit Render a un disque éphémère : sans Persistent Disk, la session sera reperdue à chaque redéploiement (mais reconstituée depuis `ACCOUNT_JSON` si vous la maintenez à jour côté variables d'environnement).

## 10. Liste des commandes

Toujours disponible via `/help` (ou `/help <catégorie>`), reflète exactement les commandes chargées.

## 11. Système /contact

Identique en principe aux autres versions : `/contact <message>` ou `/contact` puis contenu différé ; OWNER répond via "Répondre" sur Messenger ; correspondance persistante (`contact_messages`) ; conversations isolées entre utilisateurs.

## 12. Limitations et avantages propres à Facebook

Un compte personnel automatisé a des capacités **réelles** différentes de celles d'un bot officiel WhatsApp/Telegram — parfois plus, parfois moins :

| Fonctionnalité | Statut | Détail |
|---|---|---|
| `/add`, `/kick`, `/promote`, `/demote` | ✅ Fonctionnent réellement | Un compte perso a les mêmes droits qu'un membre normal |
| `/tagall` | ✅ Fonctionne réellement | Contrairement à Telegram, la liste complète des membres est accessible |
| `/autoread` (lecture auto) | ✅ Fonctionne réellement | Contrairement à Telegram, un compte perso a accès aux accusés de lecture |
| Suppression de message en modération | ❌ Impossible | Messenger ne permet à personne, pas même un admin, de supprimer le message d'un tiers — H$Λ BOT avertit et exclut, mais ne supprime jamais |
| `/sticker` | ⚠️ Dégradé | Les stickers Messenger sont des ID fixes de packs Facebook, pas des images arbitraires — envoyé comme image classique à la place |
| `/linkgroup`, `/revoke` | ❌ Non disponible | Pas de lien d'invitation stable exposé — utilisez `/add` |
| `/setdesc` | ❌ Non disponible | Messenger n'a pas de description de groupe |
| `/open`, `/close` | ❌ Non disponible | Pas de réglage "qui peut écrire" côté Messenger |
| `/block`, `/unblock` | ❌ Non disponible | Non exposé par les libs FCA — utilisez `/ban` (blocage applicatif) |
| `/videostatus` | ⚠️ Repositionné | Pas d'équivalent Stories via ce mécanisme — publie dans un fil configuré (`FB_STATUS_THREAD_ID`) |

## 13. Dépannage

| Problème | Piste |
|---|---|
| Le bot refuse de démarrer, "gabarit vide" | Remplissez `account.json` avec une vraie session exportée (§5) |
| "Session invalide ou expirée" | Réexportez `account.json` depuis un navigateur connecté |
| Compte suspendu/verrouillé par Facebook | Risque inhérent à ce type d'automatisation (voir l'avertissement en tête de README) — utilisez un compte dédié |
| Commandes vidéo/audio/sticker en erreur | Installez `ffmpeg` ou définissez `FFMPEG_PATH` |
| Une commande IA répond "non configuré" | Renseignez `AI_API_KEY` dans `.env` |

## 14. Sécurité

- Vérification des permissions OWNER / ADMIN / USER faite côté serveur à chaque commande.
- `/eval` et `/exec` strictement réservées à OWNER.
- Aucun `eval()` pour la calculatrice (`/calc`) : évaluateur d'expressions dédié.
- Anti-spam interne configurable (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`).
- Les logs ne contiennent jamais de clés API ni de cookies de session.
- **`account.json` est le fichier le plus sensible de ce projet** : accès complet au compte tant qu'il est valide. Ne le partagez, ne le committez, ne le loggez jamais.
- Voir l'avertissement de sécurité sur `ws3-fca` en tête de ce document avant `npm install`.

---

**H$Λ BOT** — Multifunction Facebook Bot, 100% gratuit.
