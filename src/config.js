import 'dotenv/config';
import path from 'node:path';

function int(value, def) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : def;
}

const DATA_DIR = process.env.DATA_DIR || './data';

export const config = {
  botName: process.env.BOT_NAME || 'H$Λ BOT',
  prefix: process.env.PREFIX || '/',

  // Chemin du fichier de session (cookies du compte Facebook automatisé).
  accountJsonPath: path.resolve(process.env.ACCOUNT_JSON_PATH || './account.json'),
  // Alternative pratique pour Render/hébergeurs sans upload de fichier : coller
  // le JSON brut directement dans une variable d'env ; il sera écrit sur
  // disque au démarrage (voir handlers/connectionHandler.js).
  accountJsonInline: process.env.ACCOUNT_JSON || '',

  ownerId: (process.env.OWNER_ID || '').replace(/\D/g, ''),
  // Fil (thread) de secours pour /videostatus (Messenger n'a pas de "Statut").
  statusThreadId: process.env.FB_STATUS_THREAD_ID || '',

  port: int(process.env.PORT, 3000),

  dataDir: path.resolve(DATA_DIR),

  ai: {
    apiKey: process.env.AI_API_KEY || '',
    apiUrl: process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    imageApiUrl: process.env.AI_IMAGE_API_URL || 'https://api.openai.com/v1/images/generations',
    imageModel: process.env.AI_IMAGE_MODEL || 'dall-e-3',
    ttsApiUrl: process.env.TTS_API_URL || '',
    ttsApiKey: process.env.TTS_API_KEY || '',
  },

  image: {
    removeBgKey: process.env.REMOVEBG_API_KEY || '',
    removeBgUrl: process.env.REMOVEBG_API_URL || 'https://api.remove.bg/v1.0/removebg',
    upscaleUrl: process.env.IMAGE_UPSCALE_API_URL || '',
    upscaleKey: process.env.IMAGE_UPSCALE_API_KEY || '',
  },

  download: {
    apiUrl: process.env.DOWNLOAD_API_URL || '',
    apiKey: process.env.DOWNLOAD_API_KEY || '',
  },

  weather: {
    apiKey: process.env.WEATHER_API_KEY || '',
    apiUrl: process.env.WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5/weather',
  },

  currency: {
    apiUrl: process.env.CURRENCY_API_URL || 'https://api.exchangerate.host/latest',
  },

  nsfw: {
    apiUrl: process.env.NSFW_API_URL || '',
    apiKey: process.env.NSFW_API_KEY || '',
  },

  ffmpegPath: process.env.FFMPEG_PATH || '',

  rateLimit: {
    max: int(process.env.RATE_LIMIT_MAX, 8),
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 10000),
  },
};

/** OWNER est toujours un compte Facebook distinct du compte automatisé par le bot. */
export function isOwner(userId) {
  const digits = String(userId).replace(/\D/g, '');
  return !!config.ownerId && digits === config.ownerId;
}
