import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { FacebookAdapter } from '../facebook/facebookBot.js';
import { handleIncomingEvent } from './messageHandler.js';

const log = logger.child({ class: 'connection' });

// ws3-fca@3.5.2 expose login comme export nommé.
// Avec Node.js + ESM, on récupère donc { login } depuis l'import CommonJS.
let login;

try {
  const fca = await import('ws3-fca');

  // Compatible avec ws3-fca CommonJS/ESM.
  login = fca.login || fca.default?.login || fca.default;

  if (typeof login !== 'function') {
    throw new Error(
      `Export "login" introuvable dans ws3-fca. Exports disponibles : ${Object.keys(fca).join(', ')}`
    );
  }

  log.info('Module ws3-fca chargé correctement.');
} catch (err) {
  log.fatal(
    "Impossible de charger 'ws3-fca'. Vérifiez qu'il est bien installé.",
    err.message
  );
  throw err;
}

const SESSION_SAVE_INTERVAL_MS = 10 * 60 * 1000;

let reconnectAttempts = 0;

/**
 * Connexion FCA avec AppState.
 *
 * ws3-fca utilise :
 * login(credentials, options, callback)
 */
function loginAsync(appState) {
  return new Promise((resolve, reject) => {
    login(
      {
        appState,
      },
      {
        online: true,
        listenEvents: true,
        selfListen: false,
        updatePresence: false,
        randomUserAgent: false,
      },
      (err, api) => {
        if (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(JSON.stringify(err))
          );
          return;
        }

        if (!api) {
          reject(new Error('ws3-fca a retourné une API vide.'));
          return;
        }

        resolve(api);
      }
    );
  });
}

/**
 * Charge account.json / ACCOUNT_JSON.
 */
function loadAppState() {
  // Render peut fournir la session via variable d'environnement.
  if (config.accountJsonInline) {
    try {
      fs.writeFileSync(
        config.accountJsonPath,
        config.accountJsonInline,
        'utf8'
      );

      log.info(
        `ACCOUNT_JSON fourni en variable d'environnement, écrit dans ${config.accountJsonPath}.`
      );
    } catch (err) {
      log.error(
        "Impossible d'écrire ACCOUNT_JSON sur disque.",
        err.message
      );
    }
  }

  if (!fs.existsSync(config.accountJsonPath)) {
    log.fatal(
      `Fichier de session introuvable : ${config.accountJsonPath}\n` +
      'Fournissez un AppState Facebook valide dans ACCOUNT_JSON.'
    );

    throw new Error('account.json manquant.');
  }

  let appState;

  try {
    const raw = fs.readFileSync(
      config.accountJsonPath,
      'utf8'
    );

    appState = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `account.json invalide (JSON illisible) : ${err.message}`
    );
  }

  if (!Array.isArray(appState) || appState.length === 0) {
    log.fatal(
      `${config.accountJsonPath} est vide ou invalide.`
    );

    throw new Error(
      'account.json vide ou AppState invalide.'
    );
  }

  return appState;
}

/**
 * Sauvegarde périodiquement l'AppState actualisé.
 */
function saveAppState(bot) {
  try {
    if (
      !bot?.api ||
      typeof bot.api.getAppState !== 'function'
    ) {
      return;
    }

    const state = bot.api.getAppState();

    if (!Array.isArray(state) || state.length === 0) {
      log.warn(
        "AppState retourné par Facebook invalide ou vide. Sauvegarde ignorée."
      );
      return;
    }

    fs.writeFileSync(
      config.accountJsonPath,
      JSON.stringify(state, null, 2),
      'utf8'
    );

    log.debug(
      'Session Facebook (account.json) rafraîchie sur disque.'
    );
  } catch (err) {
    log.warn(
      'Échec de la sauvegarde périodique de la session.',
      err.message
    );
  }
}

/**
 * Démarre la connexion Facebook.
 */
export async function startConnection() {
  if (typeof login !== 'function') {
    throw new Error(
      "La fonction login de ws3-fca n'est pas disponible."
    );
  }

  const appState = loadAppState();

  let api;

  try {
    log.info('Connexion à Facebook avec AppState...');

    api = await loginAsync(appState);

    log.info('Authentification Facebook réussie.');
  } catch (err) {
    log.fatal(
      'Échec de connexion à Facebook. Vérifiez que account.json contient un AppState Facebook valide et non expiré.',
      err.message
    );

    throw err;
  }

  // Création de l'adaptateur H$Λ BOT.
  const bot = new FacebookAdapter(api);

  // Récupération de l'identifiant du compte connecté.
  let userId;

  try {
    userId = String(api.getCurrentUserID());
  } catch (err) {
    log.fatal(
      "Impossible de récupérer l'identifiant du compte Facebook connecté.",
      err.message
    );

    throw err;
  }

  let userName = config.botName;

  // Récupération du nom Facebook.
  try {
    const info = await new Promise((resolve, reject) => {
      api.getUserInfo(
        userId,
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        }
      );
    });

    userName =
      info?.[userId]?.name ||
      userName;
  } catch (err) {
    log.warn(
      'Impossible de récupérer le nom du compte connecté (non bloquant).',
      err.message
    );
  }

  bot.user = {
    id: userId,
    name: userName,
  };

  log.info(
    `✅ ${config.botName} connecté à Facebook en tant que "${userName}" (id: ${userId}).`
  );

  /**
   * Écoute des messages Messenger.
   *
   * ws3-fca expose listenMqtt(callback).
   */
 api.listenMqtt((err, event) => {
  if (err) {
    log.error(
      `❌ listenMqtt error: ${err?.message || String(err)}`
    );
    return;
  }

  log.info(
    `📩 EVENT FACEBOOK: ${JSON.stringify(event)}`
  );

  if (!event) return;

  handleIncomingEvent(bot, event).catch((error) => {
    log.error(
      `❌ messageHandler: ${error?.message || String(error)}`,
      error?.stack
    );
  });
});

log.info('👂 Listener MQTT H$Λ BOT activé — attente des messages...');

  /**
   * Sauvegarde périodique de l'AppState.
   */
  const saveTimer = setInterval(
    () => saveAppState(bot),
    SESSION_SAVE_INTERVAL_MS
  );

  saveTimer.unref?.();

  reconnectAttempts = 0;

  return bot;
}

/**
 * Reconnexion après une erreur critique.
 */
export function scheduleReconnect() {
  reconnectAttempts += 1;

  const delay = Math.min(
    60_000,
    5_000 * reconnectAttempts
  );

  log.warn(
    `Reconnexion prévue dans ${delay / 1000}s...`
  );

  setTimeout(() => {
    startConnection().catch((err) => {
      log.error(
        'Échec de la reconnexion',
        err.message
      );
    });
  }, delay);
}