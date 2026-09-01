import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { FacebookAdapter } from '../facebook/facebookBot.js';
import { handleIncomingEvent } from './messageHandler.js';

const log = logger.child({ class: 'connection' });

// ws3-fca (comme la quasi-totalité des libs FCA) est distribué en CommonJS ;
// l'import ESM par défaut fonctionne grâce à l'interopérabilité Node.
let login;
try {
  ({ default: login } = await import('ws3-fca'));
} catch (err) {
  log.fatal(
    "Impossible de charger 'ws3-fca'. Vérifiez qu'il est bien installé (npm install) " +
      "et consultez le README (section Sécurité) avant de l'utiliser.",
    err.message
  );
}

const SESSION_SAVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let reconnectAttempts = 0;

function loginAsync(appState) {
  return new Promise((resolve, reject) => {
    login({ appState }, { listenEvents: true, selfListen: false, updatePresence: false }, (err, api) => {
      if (err) reject(err instanceof Error ? err : new Error(JSON.stringify(err)));
      else resolve(api);
    });
  });
}

function loadAppState() {
  if (config.accountJsonInline) {
    try {
      fs.writeFileSync(config.accountJsonPath, config.accountJsonInline, 'utf8');
      log.info(`ACCOUNT_JSON fourni en variable d'environnement, écrit dans ${config.accountJsonPath}.`);
    } catch (err) {
      log.error("Impossible d'écrire ACCOUNT_JSON sur disque.", err.message);
    }
  }

  if (!fs.existsSync(config.accountJsonPath)) {
    log.fatal(
      `Fichier de session introuvable : ${config.accountJsonPath}\n` +
        "Exportez les cookies d'un compte Facebook connecté (extension navigateur type " +
        '"C3C FbState" ou équivalent), collez le JSON obtenu dans ce fichier, puis relancez le bot.'
    );
    throw new Error('account.json manquant.');
  }

  let appState;
  try {
    appState = JSON.parse(fs.readFileSync(config.accountJsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`account.json invalide (JSON illisible) : ${err.message}`);
  }

  if (!Array.isArray(appState) || appState.length === 0) {
    log.fatal(
      `${config.accountJsonPath} est encore un gabarit vide ([]).\n` +
        "Exportez les cookies d'un compte Facebook connecté (extension navigateur type " +
        '"C3C FbState" ou équivalent), remplacez le contenu de ce fichier par le JSON obtenu, ' +
        'puis relancez le bot.'
    );
    throw new Error('account.json vide (gabarit non rempli).');
  }

  return appState;
}

function saveAppState(bot) {
  try {
    if (typeof bot.api.getAppState !== 'function') return;
    const state = bot.api.getAppState();
    fs.writeFileSync(config.accountJsonPath, JSON.stringify(state, null, 2), 'utf8');
    log.debug('Session (account.json) rafraîchie sur disque.');
  } catch (err) {
    log.warn('Échec de la sauvegarde périodique de la session.', err.message);
  }
}

export async function startConnection() {
  if (!login) throw new Error("ws3-fca n'a pas pu être chargé.");

  const appState = loadAppState();

  let api;
  try {
    api = await loginAsync(appState);
  } catch (err) {
    log.fatal(
      'Échec de connexion à Facebook. La session (account.json) est probablement invalide ou expirée : ' +
        'réexportez-la depuis un navigateur connecté.',
      err.message
    );
    throw err;
  }

  const bot = new FacebookAdapter(api);

  const userId = String(api.getCurrentUserID());
  let userName = config.botName;
  try {
    const info = await new Promise((resolve, reject) =>
      api.getUserInfo(userId, (err, res) => (err ? reject(err) : resolve(res)))
    );
    userName = info?.[userId]?.name || userName;
  } catch (err) {
    log.warn('Impossible de récupérer le nom du compte connecté (non bloquant).', err.message);
  }
  bot.user = { id: userId, name: userName };

  log.info(`✅ ${config.botName} connecté à Facebook en tant que "${userName}" (id: ${userId}).`);

  api.listenMqtt((err, event) => {
    if (err) {
      log.error('Erreur listenMqtt', err.message || err);
      return;
    }
    handleIncomingEvent(bot, event).catch((e) => {
      log.error('Erreur non gérée dans le traitement du message', e.message, e.stack);
    });
  });

  const saveTimer = setInterval(() => saveAppState(bot), SESSION_SAVE_INTERVAL_MS);
  saveTimer.unref?.();

  reconnectAttempts = 0;
  return bot;
}

/** À appeler par le processus principal en cas d'échec dur nécessitant une reconnexion. */
export function scheduleReconnect() {
  reconnectAttempts += 1;
  const delay = Math.min(60_000, 5000 * reconnectAttempts);
  log.warn(`Reconnexion prévue dans ${delay / 1000}s...`);
  setTimeout(() => {
    startConnection().catch((e) => log.error('Échec de la reconnexion', e.message));
  }, delay);
}
