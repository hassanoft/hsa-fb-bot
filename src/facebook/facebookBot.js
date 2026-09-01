// Adaptateur Facebook Messenger (via FCA — Facebook Chat API non officielle,
// ex: ws3-fca — automatisation d'un compte personnel par rejeu de session).
//
// Objectif : exposer une interface proche de celle utilisée par les ~145
// commandes H$Λ BOT (sendMessage, groupParticipantsUpdate, etc.), pour
// réutiliser la quasi-totalité du code métier existant. Contrairement à
// Telegram (API Bot officielle, très restreinte), un compte personnel
// automatisé a en réalité PLUS de capacités réelles sur certains points
// (lister tous les membres, en ajouter, marquer comme lu) mais AUCUNE sur
// d'autres qui n'existent tout simplement pas côté Messenger (supprimer le
// message d'un tiers, description de groupe, lien d'invitation stable,
// restreindre qui peut écrire). Chaque limite réelle est documentée ci-dessous
// — jamais simulée.

import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { tempFilePath, cleanupFile } from '../utils/media.js';

const log = logger.child({ class: 'facebookBot' });

function callbackToPromise(fn) {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(err instanceof Error ? err : new Error(JSON.stringify(err))) : resolve(result)));
  });
}

/** Convertit un Buffer (ou {url}) en flux lisible, tel qu'attendu par FCA pour les pièces jointes. */
async function toAttachmentStream(value) {
  let buffer = value;
  if (value && typeof value === 'object' && value.url) {
    const res = await fetch(value.url);
    if (!res.ok) throw new Error(`Téléchargement de la pièce jointe échoué (${res.status}).`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  if (!Buffer.isBuffer(buffer)) throw new Error('Pièce jointe invalide.');

  const file = tempFilePath('bin');
  fs.writeFileSync(file, buffer);
  const stream = fs.createReadStream(file);
  stream.once('close', () => cleanupFile(file));
  return stream;
}

export class FacebookAdapter {
  /** @param {object} api Instance FCA déjà authentifiée (retournée par login()). */
  constructor(api) {
    this.api = api;
    this.user = null; // renseigné après login, voir handlers/connectionHandler.js
    this._threadCache = new Map(); // threadID -> { data, expiresAt }
  }

  // ---------------------------------------------------------------------
  // Envoi de message — dispatch selon le "type" de contenu.
  // ---------------------------------------------------------------------
  async sendMessage(chatId, content, opts = {}) {
    const replyId = opts.quoted?.messageID;

    // --- Suppression : LIMITATION FACEBOOK ---
    // Messenger ne permet à personne — pas même un admin — de supprimer le
    // message d'un tiers. Seul l'auteur peut "retirer" (unsend) SON PROPRE
    // message, et seulement peu de temps après l'envoi.
    if (content.delete) {
      if (content.delete.fromMe) {
        await callbackToPromise((cb) => this.api.unsendMessage(content.delete.id, cb));
        return { key: { id: content.delete.id, remoteJid: String(chatId) } };
      }
      throw new Error('DELETE_NOT_SUPPORTED_BY_FACEBOOK');
    }

    // --- Édition : Messenger ne permet pas de modifier un message envoyé ---
    if (content.edit) {
      throw new Error('EDIT_NOT_SUPPORTED_BY_FACEBOOK');
    }

    // --- Contact (vCard) : repli sur un simple message texte ---
    if (content.contacts) {
      const c = content.contacts.contacts?.[0];
      const phoneMatch = c?.vcard?.match(/waid=(\d+)/);
      const text = phoneMatch ? `👑 Contact : ${phoneMatch[1]}` : content.contacts.displayName || 'Contact';
      return this._sendRaw(chatId, { body: text }, replyId);
    }

    // --- Sticker : LIMITATION FACEBOOK ---
    // Les stickers Messenger sont des ID fixes issus des packs Facebook — on
    // ne peut pas en envoyer un fabriqué à partir d'une image quelconque.
    // On envoie donc l'image convertie comme une pièce jointe classique.
    if (content.sticker !== undefined) {
      const stream = await toAttachmentStream(content.sticker);
      return this._sendRaw(chatId, { body: '', attachment: stream }, replyId);
    }

    if (content.image !== undefined) {
      const stream = await toAttachmentStream(content.image);
      return this._sendRaw(chatId, { body: content.caption || '', attachment: stream }, replyId);
    }

    if (content.video !== undefined) {
      const stream = await toAttachmentStream(content.video);
      return this._sendRaw(chatId, { body: content.caption || '', attachment: stream }, replyId);
    }

    if (content.audio !== undefined) {
      const stream = await toAttachmentStream(content.audio);
      return this._sendRaw(chatId, { body: '', attachment: stream }, replyId);
    }

    if (content.document !== undefined) {
      const stream = await toAttachmentStream(content.document);
      return this._sendRaw(chatId, { body: content.caption || '', attachment: stream }, replyId);
    }

    if (content.text !== undefined) {
      const message = { body: content.text };
      if (Array.isArray(content.mentions)) message.mentions = content.mentions;
      return this._sendRaw(chatId, message, replyId);
    }

    throw new Error('Contenu de message non pris en charge par FacebookAdapter.');
  }

  async _sendRaw(chatId, message, replyId) {
    const result = await callbackToPromise((cb) =>
      replyId ? this.api.sendMessage(message, chatId, cb, replyId) : this.api.sendMessage(message, chatId, cb)
    );
    const messageID = result?.messageID || result?.messageId;
    return { key: { id: messageID, remoteJid: String(chatId), messageID } };
  }

  // ---------------------------------------------------------------------
  // Métadonnées de groupe (thread). Contrairement à Telegram, un compte
  // personnel voit la liste COMPLÈTE des membres (avantage réel ici).
  // `desc` reste toujours vide : Messenger n'a pas de description de groupe.
  // ---------------------------------------------------------------------
  async groupMetadata(chatId) {
    const info = await callbackToPromise((cb) => this.api.getThreadInfo(chatId, cb));
    const adminSet = new Set((info.adminIDs || []).map((a) => String(a.id ?? a)));

    const participants = (info.participantIDs || []).map((id) => ({
      id: String(id),
      admin: adminSet.has(String(id)) ? 'admin' : null,
    }));

    return {
      id: String(chatId),
      subject: info.threadName || info.name || '',
      desc: '', // non disponible côté Messenger
      memberCount: participants.length,
      participants,
    };
  }

  async getChatMemberStatus(chatId, userId) {
    try {
      const meta = await this.groupMetadata(chatId);
      const p = meta.participants.find((x) => x.id === String(userId));
      if (!p) return null;
      return p.admin ? 'administrator' : 'member';
    } catch {
      return null;
    }
  }

  /** LIMITATION FACEBOOK : les indicateurs de saisie sont génériques (pas de distinction texte/vocal). */
  async sendPresenceUpdate(_action, chatId) {
    try {
      await callbackToPromise((cb) => this.api.sendTypingIndicator(chatId, cb));
    } catch (err) {
      log.warn("Échec de l'indicateur de saisie", err.message);
    }
  }

  /** Fonctionne réellement (contrairement à Telegram) : un compte personnel a accès aux accusés de lecture. */
  async readMessages(threadId) {
    try {
      await callbackToPromise((cb) => this.api.markAsRead(threadId, cb));
    } catch (err) {
      log.warn('Échec du marquage "lu"', err.message);
    }
  }

  // ---------------------------------------------------------------------
  // Gestion des membres. Contrairement à Telegram, ajouter/exclure
  // fonctionne réellement ici (un compte perso a ces droits, comme
  // n'importe quel membre du groupe le ferait depuis l'app).
  // ---------------------------------------------------------------------
  async groupParticipantsUpdate(chatId, ids, action) {
    for (const id of ids) {
      if (action === 'remove') {
        await callbackToPromise((cb) => this.api.removeUserFromGroup(id, chatId, cb));
      } else if (action === 'add') {
        await callbackToPromise((cb) => this.api.addUserToGroup(id, chatId, cb));
      } else if (action === 'promote') {
        await callbackToPromise((cb) => this.api.changeAdminStatus(chatId, id, true, cb));
      } else if (action === 'demote') {
        await callbackToPromise((cb) => this.api.changeAdminStatus(chatId, id, false, cb));
      }
    }
  }

  /** LIMITATION FACEBOOK : bloquer un utilisateur n'est pas exposé par les libs FCA courantes. */
  async updateBlockStatus() {
    throw new Error('BLOCK_NOT_SUPPORTED_BY_FACEBOOK');
  }

  /** LIMITATION FACEBOOK : pas de lien d'invitation stable via FCA. Utilisez /add (fonctionne réellement). */
  async groupInviteCode() {
    throw new Error('INVITE_LINK_NOT_SUPPORTED_BY_FACEBOOK');
  }

  async groupRevokeInvite() {
    throw new Error('INVITE_LINK_NOT_SUPPORTED_BY_FACEBOOK');
  }

  async groupUpdateSubject(chatId, title) {
    return callbackToPromise((cb) => this.api.setTitle(title, chatId, cb));
  }

  /** LIMITATION FACEBOOK : Messenger n'a pas de champ "description" de groupe. */
  async groupUpdateDescription() {
    throw new Error('DESCRIPTION_NOT_SUPPORTED_BY_FACEBOOK');
  }

  async updateProfilePicture(chatId, buffer) {
    const stream = await toAttachmentStream(buffer);
    return callbackToPromise((cb) => this.api.changeGroupImage(stream, chatId, cb));
  }

  /** LIMITATION FACEBOOK : pas de réglage "seuls les admins peuvent écrire" côté Messenger. */
  async groupSettingUpdate() {
    throw new Error('SEND_PERMISSIONS_NOT_SUPPORTED_BY_FACEBOOK');
  }
}
