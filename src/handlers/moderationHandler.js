// Modération automatique de groupe : antilink, antibadword, antiflood,
// antispam.
//
// LIMITATION FACEBOOK : contrairement à WhatsApp/Telegram, Messenger ne
// permet à PERSONNE — pas même un administrateur — de supprimer le message
// d'un tiers (ni via l'app, ni via l'API). Le message fautif reste donc
// visible ; H$Λ BOT se contente d'avertir puis, au-delà de la limite,
// d'exclure le membre (ce qui, lui, fonctionne réellement).

import { db } from '../database/database.js';
import { logger } from '../utils/logger.js';
import { buildMentionMessage } from '../utils/helpers.js';

const log = logger.child({ class: 'moderation' });

const LINK_REGEX = /(https?:\/\/|m\.me\/|fb\.me\/)[^\s]+/i;

const floodTracker = new Map();
const spamTracker = new Map();

const FLOOD_WINDOW_MS = 8000;
const FLOOD_MAX_MESSAGES = 6;
const SPAM_REPEAT_THRESHOLD = 4;

async function warnUser(bot, ctx, reason) {
  const { chatId, senderId, pushName } = ctx;

  const settings = db.getGroupSettings(chatId);
  const warnings = db.addWarning(chatId, senderId, reason);
  const limit = settings.warnLimit || 3;

  const { body, mentions } = buildMentionMessage([
    '⚠️ ',
    { id: senderId, name: pushName },
    ` : ${reason}\n⚠️ Avertissement : ${warnings.length}/${limit}`,
  ]);
  await bot.sendMessage(chatId, { text: body, mentions });

  if (warnings.length >= limit && ctx.isBotGroupAdmin) {
    try {
      await bot.groupParticipantsUpdate(chatId, [senderId], 'remove');
      db.clearWarnings(chatId, senderId);
      const exclu = buildMentionMessage(['🚫 ', { id: senderId, name: pushName }, " a été exclu (limite d'avertissements atteinte)."]);
      await bot.sendMessage(chatId, { text: exclu.body, mentions: exclu.mentions });
    } catch (err) {
      log.warn('Exclusion automatique impossible', err.message);
    }
  }
}

/** À appeler pour chaque message reçu dans un groupe. Retourne true si un avertissement a été émis. */
export async function runGroupModeration(bot, ctx) {
  const { isGroup, text, isSenderGroupAdmin, isOwner } = ctx;
  if (!isGroup) return false;
  if (isSenderGroupAdmin || isOwner) return false;
  if (!text) return false;

  const settings = db.getGroupSettings(ctx.chatId);

  if (settings.antilink && LINK_REGEX.test(text)) {
    const whitelisted = (settings.antilinkWhitelist || []).some((w) => text.includes(w));
    if (!whitelisted) {
      await warnUser(bot, ctx, 'Envoi de lien non autorisé (message non supprimable sur Messenger).');
      return true;
    }
  }

  if (settings.antibadword && (settings.antibadwordList || []).length) {
    const lower = text.toLowerCase();
    const hit = settings.antibadwordList.find((w) => lower.includes(w.toLowerCase()));
    if (hit) {
      await warnUser(bot, ctx, 'Langage inapproprié détecté.');
      return true;
    }
  }

  if (settings.antiflood) {
    const key = `${ctx.chatId}:${ctx.senderId}`;
    const now = Date.now();
    const list = (floodTracker.get(key) || []).filter((t) => now - t < FLOOD_WINDOW_MS);
    list.push(now);
    floodTracker.set(key, list);
    if (list.length > FLOOD_MAX_MESSAGES) {
      floodTracker.set(key, []);
      await warnUser(bot, ctx, 'Flood détecté (trop de messages).');
      return true;
    }
  }

  if (settings.antispam) {
    const key = `${ctx.chatId}:${ctx.senderId}`;
    const prev = spamTracker.get(key);
    if (prev && prev.lastText === text) {
      prev.count += 1;
    } else {
      spamTracker.set(key, { lastText: text, count: 1 });
    }
    const entry = spamTracker.get(key);
    if (entry.count >= SPAM_REPEAT_THRESHOLD) {
      spamTracker.set(key, { lastText: text, count: 0 });
      await warnUser(bot, ctx, 'Message répété (spam).');
      return true;
    }
  }

  return false;
}

/** @param {{id: string, name: string}} user */
export async function sendWelcome(bot, groupId, user) {
  const settings = db.getGroupSettings(groupId);
  if (!settings.welcome) return;
  const template = settings.welcomeMessage || 'Bienvenue @user dans le groupe ! 👋';
  const [before, after] = template.split('@user');
  const { body, mentions } = buildMentionMessage([before ?? '', { id: user.id, name: user.name }, after ?? '']);
  await bot.sendMessage(groupId, { text: body, mentions });
}

/** @param {{id: string, name: string}} user */
export async function sendGoodbye(bot, groupId, user) {
  const settings = db.getGroupSettings(groupId);
  if (!settings.goodbye) return;
  const template = settings.goodbyeMessage || 'Au revoir @user 👋';
  const [before, after] = template.split('@user');
  const { body, mentions } = buildMentionMessage([before ?? '', { id: user.id, name: user.name }, after ?? '']);
  await bot.sendMessage(groupId, { text: body, mentions });
}
