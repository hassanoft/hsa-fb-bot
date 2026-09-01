import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { FacebookAdapter } from '../facebook/facebookBot.js';
import { handleIncomingEvent } from './messageHandler.js';

const log = logger.child({ class: 'connection' });

let login;

try {
  const fca = await import('ws3-fca');

  // ws3-fca est CommonJS.
  // Selon l'interopérabilité Node, login peut être exposé
  // comme export nommé ou dans default.
  login =
    fca.login ||
    fca.default?.login ||
    fca.default;

  if (typeof login !== 'function') {
    throw new Error(
      `Fonction login introuvable. Exports disponibles: ${Object.keys(fca).join(', ')}`
    );
  }

  log.info('Module ws3-fca chargé correctement.');
} catch (err) {
  log.fatal(
    "Impossible de charger 'ws3-fca'.",
    err?.message || String(err)
  );
  throw err;
}

const SESSION_SAVE_INTERVAL_MS = 10 * 60 * 1000;

let reconnectAttempts = 0;
let connectionStarted = false;
let mqttListenerStarted = false;

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
      },
      (err, api) => {
        if (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(
                  typeof err === 'string'
                    ? err
                    : JSON.stringify(err)
                )
          );
          return;
        }

        if (!api) {
          reject(
            new Error('ws3-fca n’a retourné aucune API.')
          );
          return;
        }

        resolve(api);
      }
    );
  });
}

function loadAppState() {
  if (config.accountJsonInline) {
    try {
      fs.writeFileSync(
        config.accountJsonPath,
        config.accountJsonInline,
        'utf8'
      );

      log.info(
        `ACCOUNT_JSON écrit dans ${config.accountJsonPath}.`
      );
    } catch (err) {
      log.error(
        'Impossible d’écrire ACCOUNT_JSON.',
        err.message
      );
    }
  }

  if (!fs.existsSync(config.accountJsonPath)) {
    throw new Error(
      `Fichier de session introuvable : ${config.accountJsonPath}`
    );
  }

  let appState;

  try {
    appState = JSON.parse(
      fs.readFileSync(
        config.accountJsonPath,
        'utf8'
      )
    );
  } catch (err) {
    throw new Error(
      `account.json invalide : ${err.message}`
    );
  }

  if (
    !Array.isArray(appState) ||
    appState.length === 0
  ) {
    throw new Error(
      'account.json contient un AppState vide ou invalide.'
    );
  }

  return appState;
}

function saveAppState(api) {
  try {
    if (
      !api ||
      typeof api.getAppState !== 'function'
    ) {
      return;
    }

    const state = api.getAppState();

    if (!Array.isArray(state) || state.length === 0) {
      log.warn(
        'AppState vide : sauvegarde ignorée.'
      );
      return;
    }

    fs.writeFileSync(
      config.accountJsonPath,
      JSON.stringify(state, null, 2),
      'utf8'
    );

    log.debug(
      'Session Facebook sauvegardée.'
    );
  } catch (err) {
    log.warn(
      'Échec sauvegarde AppState.',
      err.message
    );
  }
}

function startMqttListener(api, bot) {
  if (mqttListenerStarted) {
    log.warn(
      'Le listener MQTT est déjà actif.'
    );
    return;
  }

  if (typeof api.listenMqtt !== 'function') {
    throw new Error(
      'ws3-fca ne fournit pas api.listenMqtt().'
    );
  }

  mqttListenerStarted = true;

  log.info(
    '👂 Démarrage du listener MQTT...'
  );

  api.listenMqtt((err, event) => {
    if (err) {
      log.error(
        '❌ Erreur MQTT:',
        err?.message || String(err)
      );
      return;
    }

    if (!event) {
      return;
    }

    log.info(
      `📩 Facebook → type=${event.type || 'unknown'} thread=${event.threadID || 'unknown'} sender=${event.senderID || 'unknown'} body=${JSON.stringify(event.body || '')}`
    );

    handleIncomingEvent(bot, event).catch((error) => {
      log.error(
        '❌ Erreur messageHandler:',
        error?.message || String(error),
        error?.stack || ''
      );
    });
  });

  log.info(
    '✅ Listener MQTT activé.'
  );
}

export async function startConnection() {
  if (connectionStarted) {
    log.warn(
      'startConnection() appelé alors que la connexion existe déjà.'
    );
    return;
  }

  connectionStarted = true;

  const appState = loadAppState();

  let api;

  try {
    log.info(
      '🔐 Connexion à Facebook avec AppState...'
    );

    api = await loginAsync(appState);

    log.info(
      '✅ Authentification Facebook réussie.'
    );
  } catch (err) {
    connectionStarted = false;

    log.fatal(
      '❌ Échec de connexion à Facebook.',
      err?.message || String(err)
    );

    throw err;
  }

  const bot = new FacebookAdapter(api);

  let userId;

  try {
    userId = String(
      api.getCurrentUserID()
    );
  } catch (err) {
    connectionStarted = false;

    throw new Error(
      `Impossible de récupérer le Facebook ID : ${err.message}`
    );
  }

  let userName = config.botName;

  try {
    const info = await new Promise(
      (resolve, reject) => {
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
      }
    );

    userName =
      info?.[userId]?.name ||
      userName;
  } catch (err) {
    log.warn(
      'Impossible de récupérer le nom Facebook.',
      err.message
    );
  }

  bot.user = {
    id: userId,
    name: userName,
  };

  log.info(
    `👑 ${config.botName} connecté à Facebook en tant que "${userName}" (id: ${userId}).`
  );

  // IMPORTANT :
  // Un seul listener MQTT pour toute la durée de vie du bot.
  startMqttListener(api, bot);

  const saveTimer = setInterval(
    () => saveAppState(api),
    SESSION_SAVE_INTERVAL_MS
  );

  saveTimer.unref?.();

  reconnectAttempts = 0;

  log.info(
    '🟢 H$Λ BOT est maintenant prêt à recevoir les messages.'
  );

  return bot;
}

export function scheduleReconnect() {
  if (connectionStarted) {
    log.warn(
      'Reconnexion ignorée : une connexion est déjà active.'
    );
    return;
  }

  reconnectAttempts += 1;

  const delay = Math.min(
    60_000,
    5_000 * reconnectAttempts
  );

  log.warn(
    `🔄 Reconnexion prévue dans ${delay / 1000}s...`
  );

  setTimeout(() => {
    startConnection().catch((err) => {
      log.error(
        '❌ Échec de la reconnexion:',
        err?.message || String(err)
      );
    });
  }, delay);
}