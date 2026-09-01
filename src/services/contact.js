import { config } from '../config.js';
import { db } from '../database/database.js';
import { logger } from '../utils/logger.js';
import {
  contactOwnerTemplate,
  contactMediaOwnerTemplate,
  contactUserReplyTemplate,
} from '../utils/formatter.js';

const log = logger.child({ class: 'contact' });

const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // marge raisonnable pour une pièce jointe Messenger

const pendingContacts = new Map(); // userId -> { expiresAt }
const PENDING_TTL_MS = 5 * 60 * 1000;

export function getOwnerChatId() {
  return config.ownerId || null;
}

export function markPending(userId) {
  pendingContacts.set(userId, { expiresAt: Date.now() + PENDING_TTL_MS });
}

export function consumePending(userId) {
  const entry = pendingContacts.get(userId);
  if (!entry) return false;
  pendingContacts.delete(userId);
  if (Date.now() > entry.expiresAt) return false;
  return true;
}

export function isPending(userId) {
  const entry = pendingContacts.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    pendingContacts.delete(userId);
    return false;
  }
  return true;
}

/** Envoie un message texte de contact à OWNER et enregistre la correspondance. */
export async function forwardTextToOwner(bot, { userId, userName, text }) {
  const ownerId = getOwnerChatId();
  if (!ownerId) {
    log.warn('OWNER_ID non configuré : impossible de transmettre le message /contact.');
    return { ok: false, reason: 'no-owner' };
  }

  const body = contactOwnerTemplate({ userName, userId, message: text });

  let sent;
  try {
    sent = await bot.sendMessage(ownerId, { text: body });
  } catch (err) {
    log.warn("Échec de l'envoi à OWNER", err.message);
    return { ok: false, reason: 'owner-unreachable' };
  }

  db.saveContactMessage({
    contactMessageId: sent.key.id,
    userId,
    ownerId,
    timestamp: Date.now(),
    status: 'pending',
  });

  return { ok: true };
}

/** Envoie un média de contact (image/audio/vidéo/document) à OWNER et enregistre la correspondance. */
export async function forwardMediaToOwner(bot, { userId, userName, mediaType, buffer, mimetype, caption }) {
  const ownerId = getOwnerChatId();
  if (!ownerId) return { ok: false, reason: 'no-owner' };
  if (buffer && buffer.length > MAX_MEDIA_BYTES) return { ok: false, reason: 'too-large' };

  const header = contactMediaOwnerTemplate({ userName, userId, mediaType });

  let sentHeader;
  try {
    sentHeader = await bot.sendMessage(ownerId, { text: header });

    const mediaPayload = buildMediaPayload(mediaType, buffer, mimetype, caption);
    if (mediaPayload) await bot.sendMessage(ownerId, mediaPayload);
  } catch (err) {
    log.warn("Échec de l'envoi à OWNER", err.message);
    return { ok: false, reason: 'owner-unreachable' };
  }

  db.saveContactMessage({
    contactMessageId: sentHeader.key.id,
    userId,
    ownerId,
    timestamp: Date.now(),
    status: 'pending',
  });

  return { ok: true };
}

function buildMediaPayload(type, buffer, mimetype, caption) {
  switch (type) {
    case 'image':
      return { image: buffer, caption };
    case 'video':
      return { video: buffer, caption };
    case 'audio':
      return { audio: buffer };
    case 'document':
      return { document: buffer, mimetype: mimetype || 'application/octet-stream', caption };
    default:
      return null;
  }
}

/**
 * Traite une éventuelle réponse de OWNER (fonction "Répondre" de Messenger) à un
 * message de contact, et la retransmet à l'utilisateur d'origine.
 */
export async function handleOwnerReply(bot, ctx) {
  const { msg, senderId, text } = ctx;
  if (senderId !== getOwnerChatId()) return false;

  const quotedId = msg.messageReply?.messageID;
  if (!quotedId) return false;

  const entry = db.getContactMessageById(quotedId);
  if (!entry) return false;
  if (!text) return false;

  try {
    await bot.sendMessage(entry.userId, { text: contactUserReplyTemplate(text) });
  } catch (err) {
    log.warn("Échec de la retransmission à l'utilisateur d'origine", err.message);
    return false;
  }
  db.updateContactMessageStatus(quotedId, 'answered');

  return true;
}
