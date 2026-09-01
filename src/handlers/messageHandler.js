import { db } from '../database/database.js';
import { logger } from '../utils/logger.js';
import { getPrefix } from '../utils/prefixStore.js';
import { checkOwner, checkBotAdmin } from '../utils/permissions.js';
import { dispatchCommand } from './commandHandler.js';
import { tryHandleContactFlow } from './contactHandler.js';
import { runGroupModeration, sendWelcome, sendGoodbye } from './moderationHandler.js';

const log = logger.child({ class: 'messageHandler' });

const threadMetaCache = new Map(); // threadID -> { data, expiresAt }
const THREAD_META_TTL_MS = 30_000;
const userNameCache = new Map(); // userID -> name

export async function getGroupMetadataCached(bot, chatId) {
  const cached = threadMetaCache.get(chatId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const data = await bot.groupMetadata(chatId);
    threadMetaCache.set(chatId, { data, expiresAt: Date.now() + THREAD_META_TTL_MS });
    return data;
  } catch (err) {
    log.warn(`Impossible de récupérer les métadonnées du fil ${chatId}`, err.message);
    return null;
  }
}

export function invalidateGroupMetadata(chatId) {
  threadMetaCache.delete(chatId);
}

async function resolveUserName(bot, userId) {
  if (userNameCache.has(userId)) return userNameCache.get(userId);
  try {
    const info = await new Promise((resolve, reject) =>
      bot.api.getUserInfo(userId, (err, res) => (err ? reject(err) : resolve(res)))
    );
    const name = info?.[userId]?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

async function isGroupThread(bot, threadId, event) {
  if (typeof event.isGroup === 'boolean') return event.isGroup;
  const meta = await getGroupMetadataCached(bot, threadId);
  return (meta?.participants?.length || 0) > 2 || !!meta?.subject;
}

export async function handleIncomingEvent(bot, event) {
  try {
    // --- Événements système (ajout/départ de membres, changement de titre...) ---
    if (event.type === 'event') {
      const threadId = String(event.threadID);
      if (event.logMessageType === 'log:subscribe') {
        invalidateGroupMetadata(threadId);
        const added = event.logMessageData?.addedParticipants || [];
        for (const p of added) {
          const id = String(p.userFbId ?? p.id ?? p);
          if (id === bot.user.id) continue; // le bot lui-même est ajouté au groupe
          const name = p.fullName || (await resolveUserName(bot, id));
          await sendWelcome(bot, threadId, { id, name }).catch(() => {});
        }
      } else if (event.logMessageType === 'log:unsubscribe') {
        invalidateGroupMetadata(threadId);
        const leftId = String(event.logMessageData?.leftParticipantFbId || '');
        if (leftId && leftId !== bot.user.id) {
          const name = await resolveUserName(bot, leftId);
          await sendGoodbye(bot, threadId, { id: leftId, name }).catch(() => {});
        }
      }
      return;
    }

    if (event.type !== 'message' && event.type !== 'message_reply') return;
    if (!event.senderID || String(event.senderID) === bot.user.id) return; // ignore les propres messages du bot

    await handleUserMessage(bot, event);
  } catch (err) {
    log.error('Erreur non gérée dans le traitement du message', err.message, err.stack);
  }
}

async function handleUserMessage(bot, event) {
  const chatId = String(event.threadID);
  const senderId = String(event.senderID);
  const text = (event.body || '').trim();

  const isGroup = await isGroupThread(bot, chatId, event);
  const pushName = await resolveUserName(bot, senderId);

  db.touchUser(senderId, { name: pushName });
  if (isGroup) db.trackGroupMember(chatId, senderId, pushName);

  const groupMetadata = isGroup ? await getGroupMetadataCached(bot, chatId) : null;
  if (isGroup) db.touchGroup(chatId, { name: groupMetadata?.subject });

  const isOwner = checkOwner(senderId);
  const isBotAdmin = checkBotAdmin(senderId);

  let isSenderGroupAdmin = false;
  let isBotGroupAdmin = false;
  if (isGroup && groupMetadata) {
    const senderP = groupMetadata.participants.find((p) => p.id === senderId);
    const botP = groupMetadata.participants.find((p) => p.id === bot.user.id);
    isSenderGroupAdmin = !!senderP?.admin;
    isBotGroupAdmin = !!botP?.admin;
  }

  const prefix = getPrefix();

  const reply = async (content) => {
    const payload = typeof content === 'string' ? { text: content } : content;
    return bot.sendMessage(chatId, payload, { quoted: event });
  };

  const ctx = {
    bot,
    msg: event,
    chatId,
    isGroup,
    groupMetadata,
    senderId,
    pushName,
    text,
    isOwner,
    isBotAdmin,
    isSenderGroupAdmin,
    isBotGroupAdmin,
    prefix,
    reply,
    db,
  };

  // --- Lecture automatique (fonctionne réellement sur Facebook, contrairement à Telegram) ---
  if (isGroup) {
    const settings = db.getGroupSettings(chatId);
    if (settings.autoread) bot.readMessages(chatId).catch(() => {});
  }

  // --- Système /contact (réponse OWNER ou contenu en attente) ---
  const handledByContact = await tryHandleContactFlow(bot, ctx);
  if (handledByContact) return;

  // --- Modération automatique de groupe ---
  if (isGroup) {
    const moderated = await runGroupModeration(bot, ctx);
    if (moderated) return;
  }

  // --- Commandes (préfixe obligatoire) ---
  if (!text || !text.startsWith(prefix)) return;

  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return;

  const [rawCommand, ...rest] = withoutPrefix.split(/\s+/);
  const commandName = rawCommand.toLowerCase();
  const args = rest;

  ctx.commandName = commandName;
  ctx.args = args;
  ctx.text = args.join(' ');

  if (isGroup) {
    const settings = db.getGroupSettings(chatId);
    if (settings.autotyping || settings.autorecording) bot.sendPresenceUpdate('composing', chatId).catch(() => {});
  }

  await dispatchCommand(ctx);
}
