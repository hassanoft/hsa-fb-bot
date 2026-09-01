import path from 'node:path';
import fs from 'node:fs';

const TMP_DIR = path.resolve('test/.tmp-media');
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

process.env.BOT_NAME ??= 'H$Λ BOT';
process.env.PREFIX ??= '/';
process.env.OWNER_ID ??= '900000001';
process.env.DATA_DIR = path.join(TMP_DIR, 'data');
process.env.RATE_LIMIT_MAX ??= '1000';

const { loadCommands } = await import('../src/handlers/commandHandler.js');
const { handleIncomingEvent } = await import('../src/handlers/messageHandler.js');
const { FacebookAdapter } = await import('../src/facebook/facebookBot.js');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed += 1; console.log(`✅ ${label}`); }
  else { failed += 1; console.log(`❌ ${label}`); }
}

const USER_ID = '900000002';
let msgIdCounter = 2000;

const fakeApi = {
  getCurrentUserID: () => '999999',
  sendMessage(message, threadID, cb) {
    const id = `M${msgIdCounter++}`;
    calls.push({ method: 'sendMessage', threadID: String(threadID), message });
    cb(null, { messageID: id });
  },
  getThreadInfo(threadID, cb) { cb(null, { threadName: '', participantIDs: [], adminIDs: [] }); },
  getUserInfo(userId, cb) { cb(null, { [userId]: { name: userId } }); },
};

const calls = [];
const bot = new FacebookAdapter(fakeApi);
bot.user = { id: '999999', name: 'H$Λ BOT Test' };

// Intercepte fetch() pour simuler le téléchargement des pièces jointes
// (les URLs FCA sont normalement directement téléchargeables).
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (typeof url === 'string' && url.includes('fake-cdn.example/')) {
    return { ok: true, arrayBuffer: async () => Buffer.from('FAKE_DOWNLOADED_MEDIA').buffer };
  }
  if (typeof url === 'string' && url.includes('graph.facebook.com')) {
    return { ok: false }; // simule "pas de photo de profil" dans ce test
  }
  return realFetch(url);
};

function buildPhotoEvent(text) {
  return {
    type: 'message',
    threadID: USER_ID,
    senderID: USER_ID,
    body: text,
    messageID: `M${msgIdCounter++}`,
    isGroup: false,
    timestamp: Date.now(),
    attachments: [{ type: 'photo', url: 'https://fake-cdn.example/photo.jpg' }],
  };
}

function buildStickerEvent(text) {
  return {
    type: 'message',
    threadID: USER_ID,
    senderID: USER_ID,
    body: text,
    messageID: `M${msgIdCounter++}`,
    isGroup: false,
    timestamp: Date.now(),
    attachments: [{ type: 'sticker', url: 'https://fake-cdn.example/sticker.webp' }],
  };
}

function buildTextEvent(text) {
  return {
    type: 'message',
    threadID: USER_ID,
    senderID: USER_ID,
    body: text,
    messageID: `M${msgIdCounter++}`,
    isGroup: false,
    timestamp: Date.now(),
  };
}

async function send(event) {
  calls.length = 0;
  await handleIncomingEvent(bot, event);
  return [...calls];
}

function textOf(entry) { return entry.message?.body || entry.message?.caption || ''; }
function hasErrorReply(out) { return out.some((m) => textOf(m).includes('❌')); }
function hasImageReply(out) { return out.some((m) => !!m.message?.attachment); }

async function main() {
  await loadCommands();

  const imageCommands = ['blur', 'resize 100 100', 'rotate 90', 'mirror', 'caption Haut|Bas', 'wanted', 'avatar', 'wallpaper', 'enhance', 'upscale'];
  for (const cmdLine of imageCommands) {
    const out = await send(buildPhotoEvent(`/${cmdLine}`));
    const ok = hasImageReply(out) || hasErrorReply(out);
    assert(ok, `/${cmdLine.split(' ')[0]} répond sans planter (image ou erreur propre)`);
  }

  // --- /sticker (dégradé en image carrée, voir README) ---
  {
    const out = await send(buildPhotoEvent('/sticker'));
    const ok = hasImageReply(out) || hasErrorReply(out);
    assert(ok, '/sticker répond sans planter (image ou erreur propre)');
  }

  // --- /toimg sur un sticker ---
  {
    const out = await send(buildStickerEvent('/toimg'));
    const ok = hasImageReply(out) || hasErrorReply(out);
    assert(ok, '/toimg répond sans planter (image ou erreur propre)');
  }

  // --- /qr génère un QR ---
  {
    const out = await send(buildTextEvent('/qr https://example.com'));
    assert(hasImageReply(out), '/qr génère une image');
  }

  // --- /readqr ---
  {
    const out = await send(buildPhotoEvent('/readqr'));
    assert(out.some((m) => textOf(m).includes('Aucun QR')), '/readqr gère proprement "aucun QR détecté"');
  }

  // --- /ocr ---
  {
    const out = await send(buildPhotoEvent('/ocr'));
    assert(out.some((m) => textOf(m).includes('TEXTE_SIMULE')), '/ocr extrait le texte simulé sans planter');
  }

  // --- /vision sans clé IA ---
  {
    const out = await send(buildPhotoEvent('/vision'));
    assert(out.some((m) => textOf(m).includes("n'est pas configuré")), '/vision sans clé API -> message clair');
  }

  // --- Commandes réseau externes (pas d'accès réseau réel en sandbox) ---
  const networkCommands = ['/ip 8.8.8.8', '/short https://example.com', '/currency 10 USD EUR'];
  for (const line of networkCommands) {
    const out = await send(buildTextEvent(line));
    assert(out.length > 0 && !out.some((m) => textOf(m).includes("erreur est survenue lors de l'")), `${line} échoue proprement sans crash serveur`);
  }

  console.log(`\n${passed} test(s) réussis, ${failed} échec(s).`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ERREUR FATALE:', err);
  process.exit(1);
});
