// Test fonctionnel hors-ligne : simule un objet `api` FCA déjà authentifié
// et fait transiter de vrais événements à travers le pipeline complet
// (messageHandler -> commandHandler -> commandes) pour vérifier le
// comportement réel du bot, sans dépendre du réseau ni de ws3-fca.

import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.resolve('test/.tmp-functional');
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

process.env.BOT_NAME ??= 'H$Λ BOT';
process.env.PREFIX ??= '/';
process.env.OWNER_ID ??= '900000001';
process.env.DATA_DIR = path.join(TMP_DIR, 'data');
process.env.RATE_LIMIT_MAX ??= '1000';
process.env.RATE_LIMIT_WINDOW_MS ??= '10000';

const { loadCommands, getAllCommands } = await import('../src/handlers/commandHandler.js');
const { handleIncomingEvent } = await import('../src/handlers/messageHandler.js');
const { FacebookAdapter } = await import('../src/facebook/facebookBot.js');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed += 1; console.log(`✅ ${label}`); }
  else { failed += 1; console.log(`❌ ${label}`); }
}

const OWNER_ID = '900000001';
const USER_ID = '900000002';
const GROUP_ID = '700000001';
let msgIdCounter = 1000;

// --- Fausse API FCA déjà authentifiée ---
const threads = {
  [GROUP_ID]: {
    threadName: 'Groupe de test',
    participantIDs: ['999999', OWNER_ID, USER_ID],
    adminIDs: [{ id: '999999' }, { id: OWNER_ID }],
  },
};
const userNames = { 999999: 'H$Λ BOT Test', [OWNER_ID]: 'Owner', [USER_ID]: 'Testeur' };
const calls = [];

const fakeApi = {
  getCurrentUserID: () => '999999',
  sendMessage(message, threadID, cb, replyId) {
    const id = `M${msgIdCounter++}`;
    calls.push({ method: 'sendMessage', threadID: String(threadID), message, replyId, resultMessageID: id });
    cb(null, { messageID: id });
  },
  getThreadInfo(threadID, cb) {
    cb(null, threads[threadID] || { threadName: '', participantIDs: [], adminIDs: [] });
  },
  getUserInfo(userId, cb) {
    cb(null, { [userId]: { name: userNames[userId] || userId } });
  },
  markAsRead(threadID, cb) { calls.push({ method: 'markAsRead', threadID }); cb(null); },
  sendTypingIndicator(threadID, cb) { calls.push({ method: 'sendTypingIndicator', threadID }); cb(null); },
  changeAdminStatus(threadID, id, adminStatus, cb) { calls.push({ method: 'changeAdminStatus', threadID, id, adminStatus }); cb(null); },
  removeUserFromGroup(id, threadID, cb) { calls.push({ method: 'removeUserFromGroup', threadID, id }); cb(null); },
  addUserToGroup(id, threadID, cb) { calls.push({ method: 'addUserToGroup', threadID, id }); cb(null); },
  setTitle(title, threadID, cb) { calls.push({ method: 'setTitle', threadID, title }); cb(null); },
  unsendMessage(id, cb) { calls.push({ method: 'unsendMessage', id }); cb(null); },
};

const bot = new FacebookAdapter(fakeApi);
bot.user = { id: '999999', name: 'H$Λ BOT Test' };

function buildTextEvent({ from, threadId, text, isGroup = false, messageReply }) {
  return {
    type: 'message',
    threadID: threadId,
    senderID: from,
    body: text,
    messageID: `M${msgIdCounter++}`,
    isGroup,
    timestamp: Date.now(),
    messageReply,
  };
}

async function send(event) {
  calls.length = 0;
  await handleIncomingEvent(bot, event);
  return [...calls];
}

function textOf(entry) {
  return entry.message?.body || '';
}

async function main() {
  await loadCommands();
  assert(getAllCommands().length === 145, `145 commandes chargées (obtenu: ${getAllCommands().length})`);

  // --- /ping en privé ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/ping' }));
    assert(out.some((m) => textOf(m).includes('Pong') || textOf(m).includes('Calcul en cours')), '/ping répond');
  }

  // --- message sans préfixe : aucune réponse ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: 'Bonjour' }));
    assert(out.filter((c) => c.method === 'sendMessage').length === 0, 'Message sans préfixe = aucune réponse');
  }

  // --- commande inconnue ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/xyzabc' }));
    assert(out.some((m) => textOf(m).includes('Commande inconnue')), 'Commande inconnue -> message clair');
  }

  // --- /calc ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/calc 2+2*5' }));
    assert(out.some((m) => textOf(m).includes('= 12')), `/calc 2+2*5 = 12 (reçu: ${JSON.stringify(out.map(textOf))})`);
  }

  // --- /calc division par zéro ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/calc 5/0' }));
    assert(out.some((m) => textOf(m).includes('❌')), '/calc 5/0 -> erreur propre (pas de crash)');
  }

  // --- commande OWNER par un utilisateur normal : refusée ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/maintenance on' }));
    assert(out.some((m) => textOf(m).includes('réservée au propriétaire')), 'Commande OWNER refusée à un utilisateur normal');
  }

  // --- commande OWNER par le OWNER : acceptée ---
  {
    const out = await send(buildTextEvent({ from: OWNER_ID, threadId: OWNER_ID, text: '/maintenance' }));
    assert(out.some((m) => textOf(m).includes('Mode maintenance')), 'Commande OWNER acceptée pour OWNER_ID');
  }

  // --- /help : menu complet (photo puis texte, deux messages) ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/help' }));
    const text = out.map(textOf).join('');
    assert(text.includes('🏠 GENERAL') && text.includes('👑 OWNER') && text.trim().endsWith('H$Λ BOT'), '/help affiche le menu complet structuré');
    assert(text.includes('/ping'), "/help liste bien '/ping' avec le préfixe actuel");
  }

  // --- /help <catégorie> ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/help fun' }));
    const text = out.map(textOf).join('');
    assert(text.includes('🎮 FUN') && !text.includes('🏠 GENERAL'), '/help fun affiche uniquement la catégorie FUN');
  }

  // --- commande de groupe hors groupe : refusée ---
  {
    const out = await send(buildTextEvent({ from: OWNER_ID, threadId: OWNER_ID, text: '/kick' }));
    assert(out.some((m) => textOf(m).includes('uniquement dans un groupe')), 'Commande de groupe refusée en privé');
  }

  // --- commande de groupe, admin requis, utilisateur normal ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: GROUP_ID, isGroup: true, text: '/kick' }));
    assert(out.some((m) => textOf(m).includes('réservée aux administrateurs')), 'Commande admin de groupe refusée à un membre normal');
  }

  // --- /kick par OWNER (admin du groupe) via reply sur le message de la cible ---
  {
    const targetMsg = buildTextEvent({ from: USER_ID, threadId: GROUP_ID, isGroup: true, text: 'un message' });
    const out = await send(buildTextEvent({
      from: OWNER_ID, threadId: GROUP_ID, isGroup: true, text: '/kick',
      messageReply: { senderID: USER_ID, messageID: targetMsg.messageID },
    }));
    assert(out.some((c) => c.method === 'removeUserFromGroup' && c.id === USER_ID), '/kick exclut réellement la cible visée par la réponse');
  }

  // --- /add fonctionne réellement sur Facebook ---
  {
    const out = await send(buildTextEvent({ from: OWNER_ID, threadId: GROUP_ID, isGroup: true, text: '/add 123456' }));
    assert(out.some((c) => c.method === 'addUserToGroup' && c.id === '123456'), "/add ajoute réellement un membre (capacité réelle sur Facebook)");
  }

  // --- /groupinfo ---
  {
    const out = await send(buildTextEvent({ from: OWNER_ID, threadId: GROUP_ID, isGroup: true, text: '/groupinfo' }));
    const text = out.map(textOf).join('');
    assert(text.includes('Groupe de test') && text.includes('Membres : 3') && text.includes('Administrateurs : 2'), `/groupinfo affiche les bonnes infos (reçu: ${text})`);
  }

  // --- /tagall mentionne réellement TOUS les membres (contrairement à Telegram) ---
  {
    const out = await send(buildTextEvent({ from: OWNER_ID, threadId: GROUP_ID, isGroup: true, text: '/tagall' }));
    const msg = out.find((c) => c.method === 'sendMessage' && c.message.mentions);
    assert(!!msg && msg.message.mentions.length === 3, `/tagall mentionne bien les 3 membres (obtenu: ${msg?.message.mentions?.length})`);
  }

  // --- /uuid ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/uuid' }));
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert(out.some((m) => uuidRegex.test(textOf(m))), '/uuid génère un UUID valide');
  }

  // --- /base64 ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/base64 encode HelloHSA' }));
    assert(out.some((m) => textOf(m).includes(Buffer.from('HelloHSA').toString('base64'))), '/base64 encode fonctionne');
  }

  // --- /8ball ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/8ball Est-ce que ça marche ?' }));
    assert(out.some((m) => textOf(m).startsWith('🎱')), '/8ball répond');
  }

  // --- /contact mode 1 (texte direct) ---
  {
    const out = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: "/contact Bonjour, j'ai un souci." }));
    const confirmToUser = out.find((c) => c.method === 'sendMessage' && c.threadID === USER_ID);
    const forwardToOwner = out.find((c) => c.method === 'sendMessage' && c.threadID === OWNER_ID);
    assert(!!confirmToUser && textOf(confirmToUser).includes('transmis'), "/contact confirme la transmission à l'utilisateur");
    assert(!!forwardToOwner && textOf(forwardToOwner).includes('H$Λ BOT CONTACT'), '/contact transmet le message formaté à OWNER');
  }

  // --- /contact mode 2 (attente) puis réponse de OWNER ---
  {
    const out1 = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: '/contact' }));
    assert(out1.some((m) => textOf(m).includes('Envoyez maintenant')), '/contact sans texte déclenche le mode attente');

    const out2 = await send(buildTextEvent({ from: USER_ID, threadId: USER_ID, text: 'Voici mon message différé' }));
    const forwarded = out2.find((c) => c.method === 'sendMessage' && c.threadID === OWNER_ID);
    assert(!!forwarded && textOf(forwarded).includes('Voici mon message différé'), 'Le message différé est transmis à OWNER');

    // Simule OWNER répondant (fonction "Répondre") au message reçu, en
    // citant le VRAI messageID renvoyé par l'envoi précédent à OWNER.
    const replyEvent = buildTextEvent({
      from: OWNER_ID,
      threadId: OWNER_ID,
      text: 'Bonjour, je regarde ça tout de suite.',
      messageReply: { messageID: forwarded.resultMessageID, senderID: '999999' },
    });
    const out3 = await send(replyEvent);
    const toUser = out3.find((c) => c.method === 'sendMessage' && c.threadID === USER_ID);
    assert(!!toUser && textOf(toUser).includes("Réponse de l'administrateur"), 'La réponse de OWNER est bien retransmise à l\'utilisateur');
  }

  console.log(`\n${passed} test(s) réussis, ${failed} échec(s).`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERREUR FATALE DANS LE TEST:', err);
  process.exit(1);
});
