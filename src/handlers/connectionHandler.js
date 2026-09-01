import fs from 'node:fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { FacebookAdapter } from '../facebook/facebookBot.js';
import { handleIncomingEvent } from './messageHandler.js';

const log = logger.child({ class: 'connection' });

/*
 * IMPORTANT
 * ----------
 * fca-eryxenx est CommonJS.
 * On utilise require() via createRequire() au lieu de
 * dépendre de l'interopérabilité ESM.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let login;

try {
  const fca = require('fca-eryxenx');

  login =
    typeof fca === 'function'
      ? fca
      : fca?.login || fca?.default;

  if (typeof login !== 'function') {
    throw new Error(
      `Export login introuvable. Type reçu: ${typeof fca}`
    );
  }

  log.info('Module fca-eryxenx chargé correctement.');
} catch (err) {
  log.fatal(
    "Impossible de charger 'fca-eryxenx'.",
    err?.message || String(err)
  );

  throw err;
}

const SESSION_SAVE_INTERVAL_MS = 3 * 60 * 1000;

let apiInstance = null;
let botInstance = null;
let listenerHandle = null;
let saveTimer = null;
let connectionStarted = false;

/**
 * Options FCA.
 *
 * Elles sont volontairement simples.
 * Le dépôt MAMUN utilise également un objet optionsFca
 * transmis directement à login().
 */
const fcaOptions = {
  listenEvents: true,
  selfListen: false,
  updatePresence: false,
  forceLogin: true,
  autoMarkDelivery: false,
  autoMarkRead: false,
};

/**
 * Convertit les erreurs FCA en Error JS propre.
 */
function normalizeError(err) {
  if (err instanceof Error) {
    return err;
  }

  if (typeof err === 'string') {
    return new Error(err);
  }

  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
}

/**
 * Login FCA sous forme Promise.
 */
function loginAsync(appState) {
  return new Promise((resolve, reject) => {
    login(
      {
        appState,
      },
      fcaOptions,
      (err, api) => {
        if (err) {
          reject(normalizeError(err));
          return;
        }

        if (!api) {
          reject(
            new Error(
              'fca-eryxenx n’a retourné aucune API.'
            )
          );
          return;
        }

        resolve(api);
      }
    );
  });
}

/**
 * Charge l'AppState.
 */
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

  let state;

  try {
    state = JSON.parse(
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

  if (!Array.isArray(state) || state.length === 0) {
    throw new Error(
      'account.json est vide ou ne contient pas un AppState valide.'
    );
  }

  return state;
}

/**
 * Sauvegarde périodiquement l'AppState.
 */
function saveAppState() {
  try {
    if (
      !apiInstance ||
      typeof apiInstance.getAppState !== 'function'
    ) {
      return;
    }

    const state = apiInstance.getAppState();

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
      'Échec de sauvegarde de la session.',
      err.message
    );
  }
}

/**
 * Arrête proprement l'ancien listener MQTT.
 *
 * Le dépôt MAMUN utilise également stopListening()
 * avant de créer un nouveau listener.
 */
async function stopMqttListener() {
  if (!apiInstance) {
    listenerHandle = null;
    return;
  }

  try {
    if (
      typeof apiInstance.stopListening === 'function'
    ) {
      await new Promise((resolve) => {
        let finished = false;

        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        try {
          const result =
            apiInstance.stopListening(done);

          if (
            result &&
            typeof result.then === 'function'
          ) {
            result.then(done).catch(done);
          }
        } catch {
          done();
        }

        setTimeout(done, 5000);
      });
    }
  } catch (err) {
    log.warn(
      'Erreur lors de l’arrêt du listener MQTT.',
      err.message
    );
  }

  listenerHandle = null;
}

/**
 * Démarre le listener MQTT.
 */
async function startMqttListener() {
  if (!apiInstance || !botInstance) {
    throw new Error(
      'API Facebook indisponible pour démarrer MQTT.'
    );
  }

  await stopMqttListener();

  if (
    typeof apiInstance.listenMqtt !== 'function'
  ) {
    throw new Error(
      'fca-eryxenx ne fournit pas api.listenMqtt().'
    );
  }

  log.info(
    '👂 Démarrage du listener MQTT Facebook...'
  );

  const callback = (err, event) => {
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

    /*
     * Log volontairement court pour confirmer
     * que les événements arrivent réellement.
     */
    log.info(
      `📩 EVENT Facebook: type=${event.type || 'unknown'} ` +
      `thread=${event.threadID || 'unknown'} ` +
      `sender=${event.senderID || 'unknown'} ` +
      `body=${JSON.stringify(event.body || '')}`
    );

    handleIncomingEvent(
      botInstance,
      event
    ).catch((error) => {
      log.error(
        '❌ Erreur messageHandler:',
        error?.message || String(error),
        error?.stack || ''
      );
    });
  };

  /*
   * IMPORTANT :
   * fca-eryxenx retourne le handle du listener.
   * On le conserve afin de pouvoir le stopper/recréer.
   */
  listenerHandle =
    apiInstance.listenMqtt(callback);

  log.info(
    '✅ Listener MQTT Facebook activé.'
  );

  return listenerHandle;
}

/**
 * Connexion principale.
 */
export async function startConnection() {
  if (connectionStarted) {
    log.warn(
      'startConnection() appelé alors qu’une connexion existe déjà.'
    );

    return botInstance;
  }

  connectionStarted = true;

  try {
    const appState = loadAppState();

    log.info(
      '🔐 Connexion à Facebook avec AppState...'
    );

    apiInstance = await loginAsync(
      appState
    );

    log.info(
      '✅ Authentification Facebook réussie.'
    );

    botInstance =
      new FacebookAdapter(apiInstance);

    const userId = String(
      apiInstance.getCurrentUserID()
    );

    let userName =
      config.botName;

    try {
      const info =
        await new Promise(
          (resolve, reject) => {
            apiInstance.getUserInfo(
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
        'Impossible de récupérer le nom du compte.',
        err.message
      );
    }

    botInstance.user = {
      id: userId,
      name: userName,
    };

    log.info(
      `✅ ${config.botName} connecté à Facebook en tant que "${userName}" (id: ${userId}).`
    );

    /*
     * Démarrage du listener APRÈS l'authentification.
     */
    await startMqttListener();

    /*
     * Sauvegarde de session.
     */
    if (saveTimer) {
      clearInterval(saveTimer);
    }

    saveTimer = setInterval(
      saveAppState,
      SESSION_SAVE_INTERVAL_MS
    );

    saveTimer.unref?.();

    log.info(
      '🟢 H$Λ BOT est prêt à recevoir les messages Facebook.'
    );

    return botInstance;
  } catch (err) {
    connectionStarted = false;

    log.fatal(
      '❌ Échec du démarrage de la connexion Facebook:',
      err?.message || String(err),
      err?.stack || ''
    );

    throw err;
  }
}

/**
 * Reconnexion manuelle.
 */
export async function scheduleReconnect() {
  try {
    connectionStarted = false;

    await stopMqttListener();

    await startConnection();
  } catch (err) {
    log.error(
      '❌ Échec de la reconnexion Facebook:',
      err?.message || String(err)
    );
  }
}

/**
 * Permet de fermer proprement la connexion.
 */
export async function stopConnection() {
  log.info(
    '🛑 Arrêt de la connexion Facebook...'
  );

  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }

  await stopMqttListener();

  apiInstance = null;
  botInstance = null;
  connectionStarted = false;

  log.info(
    '✅ Connexion Facebook arrêtée.'
  );
}