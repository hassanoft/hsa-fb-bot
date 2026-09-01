import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';
import { logger } from './logger.js';
import { shortId } from './helpers.js';

const log = logger.child({ class: 'media' });

let resolvedFfmpegPath = null;

/** Résout le chemin du binaire ffmpeg : FFMPEG_PATH > ffmpeg-static > "ffmpeg" (PATH système). */
export async function resolveFfmpegPath() {
  if (resolvedFfmpegPath) return resolvedFfmpegPath;

  if (config.ffmpegPath) {
    resolvedFfmpegPath = config.ffmpegPath;
  } else {
    try {
      const mod = await import('ffmpeg-static');
      resolvedFfmpegPath = mod.default || mod;
    } catch {
      resolvedFfmpegPath = 'ffmpeg'; // suppose présent dans le PATH (Termux: pkg install ffmpeg)
    }
  }

  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
  return resolvedFfmpegPath;
}

export function getTempDir() {
  const dir = path.join(os.tmpdir(), 'hsa-bot');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tempFilePath(ext = '') {
  return path.join(getTempDir(), `${Date.now()}-${shortId()}${ext ? `.${ext}` : ''}`);
}

export function writeTempFile(buffer, ext = '') {
  const file = tempFilePath(ext);
  fs.writeFileSync(file, buffer);
  return file;
}

export function cleanupFile(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    log.warn(`Nettoyage du fichier temporaire échoué : ${file}`, err.message);
  }
}

const TYPE_MAP = {
  photo: 'image',
  animated_image: 'image',
  video: 'video',
  audio: 'audio',
  sticker: 'sticker',
  file: 'document',
};

function mimetypeFor(att) {
  if (att.type === 'photo') return 'image/jpeg';
  if (att.type === 'animated_image') return 'image/gif';
  if (att.type === 'video') return 'video/mp4';
  if (att.type === 'audio') return 'audio/mpeg';
  if (att.type === 'sticker') return 'image/webp';
  return att.mimeType || 'application/octet-stream';
}

/**
 * Localise la pièce jointe présente dans l'événement FCA lui-même OU dans le
 * message cité (messageReply, quand l'utilisateur a utilisé "Répondre").
 * Retourne { type, url, mimetype } ou null.
 */
export function getMediaMessage(event) {
  const candidates = [event, event.messageReply].filter(Boolean);

  for (const m of candidates) {
    const att = (m.attachments || [])[0];
    if (!att || !TYPE_MAP[att.type]) continue;
    const url = att.url || att.previewUrl;
    if (!url) continue;
    return { type: TYPE_MAP[att.type], url, mimetype: mimetypeFor(att) };
  }

  return null;
}

/** Télécharge le média (image/vidéo/audio/sticker/document) présent ou cité dans l'événement. */
export async function downloadQuotedOrDirectMedia(event) {
  const found = getMediaMessage(event);
  if (!found) return null;

  const res = await fetch(found.url);
  if (!res.ok) throw new Error(`Téléchargement de la pièce jointe Facebook échoué (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return { type: found.type, buffer, mimetype: found.mimetype };
}

export function ffmpegRun(builder) {
  return new Promise((resolve, reject) => {
    builder
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}
