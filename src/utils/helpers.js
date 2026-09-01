export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function truncate(str = '', max = 300) {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

/** Génère un identifiant lisible court (utilisé pour corréler des messages, etc.) */
export function shortId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Construit un message avec mentions au format attendu par l'API FCA
 * (un tableau `mentions` avec décalage de caractères dans `body`, très
 * différent du système WhatsApp/Telegram). `parts` est un mélange de
 * chaînes brutes et d'objets { id, name } à mentionner.
 */
export function buildMentionMessage(parts) {
  let body = '';
  const mentions = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      body += part;
      continue;
    }
    if (part && part.id) {
      const tag = String(part.name || part.id);
      mentions.push({ tag, id: String(part.id), fromIndex: body.length });
      body += tag;
    }
  }
  return { body, mentions };
}
