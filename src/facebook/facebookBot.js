import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import {
  tempFilePath,
  cleanupFile,
} from '../utils/media.js';

const log = logger.child({
  class: 'facebookBot',
});

function callbackToPromise(fn) {
  return new Promise((resolve, reject) => {
    try {
      fn((err, result) => {
        if (err) {
          reject(
            err instanceof Error
              ? err
              : new Error(
                  typeof err === 'string'
                    ? err
                    : JSON.stringify(err)
                )
          );
          return;
        }

        resolve(result);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function toAttachmentStream(value) {
  let buffer = value;

  if (
    value &&
    typeof value === 'object' &&
    value.url
  ) {
    const response = await fetch(
      value.url
    );

    if (!response.ok) {
      throw new Error(
        `Téléchargement de la pièce jointe échoué (${response.status}).`
      );
    }

    buffer = Buffer.from(
      await response.arrayBuffer()
    );
  }

  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      'Pièce jointe invalide.'
    );
  }

  const file =
    tempFilePath('bin');

  fs.writeFileSync(
    file,
    buffer
  );

  const stream =
    fs.createReadStream(file);

  const cleanup = () => {
    try {
      cleanupFile(file);
    } catch {
      // rien
    }
  };

  stream.once(
    'close',
    cleanup
  );

  stream.once(
    'error',
    cleanup
  );

  return stream;
}

export class FacebookAdapter {
  constructor(api) {
    if (!api) {
      throw new Error(
        'FacebookAdapter nécessite une API Facebook.'
      );
    }

    this.api = api;
    this.user = null;

    this._threadCache =
      new Map();
  }

  /**
   * Envoi d'un message.
   */
  async sendMessage(
    chatId,
    content,
    opts = {}
  ) {
    if (
      !content ||
      typeof content !== 'object'
    ) {
      throw new Error(
        'Contenu Facebook invalide.'
      );
    }

    const replyId =
      opts?.quoted?.messageID ||
      opts?.quoted?.messageId ||
      opts?.quoted?.mid ||
      null;

    if (content.delete) {
      if (
        !content.delete.fromMe
      ) {
        throw new Error(
          'DELETE_NOT_SUPPORTED_BY_FACEBOOK'
        );
      }

      if (
        typeof this.api.unsendMessage !==
        'function'
      ) {
        throw new Error(
          'unsendMessage non disponible.'
        );
      }

      await callbackToPromise(
        (cb) =>
          this.api.unsendMessage(
            content.delete.id,
            cb
          )
      );

      return {
        key: {
          id: content.delete.id,
          remoteJid: String(chatId),
        },
      };
    }

    if (content.edit) {
      throw new Error(
        'EDIT_NOT_SUPPORTED_BY_FACEBOOK'
      );
    }

    if (content.contacts) {
      const contact =
        content.contacts
          ?.contacts?.[0];

      const match =
        contact?.vcard?.match(
          /waid=(\d+)/
        );

      const text =
        match
          ? `👑 Contact : ${match[1]}`
          : content.contacts
              ?.displayName ||
            'Contact';

      return this._sendRaw(
        chatId,
        {
          body: text,
        },
        replyId
      );
    }

    if (
      content.sticker !==
      undefined
    ) {
      const stream =
        await toAttachmentStream(
          content.sticker
        );

      return this._sendRaw(
        chatId,
        {
          body: '',
          attachment: stream,
        },
        replyId
      );
    }

    if (
      content.image !==
      undefined
    ) {
      const stream =
        await toAttachmentStream(
          content.image
        );

      return this._sendRaw(
        chatId,
        {
          body:
            content.caption ||
            '',
          attachment: stream,
        },
        replyId
      );
    }

    if (
      content.video !==
      undefined
    ) {
      const stream =
        await toAttachmentStream(
          content.video
        );

      return this._sendRaw(
        chatId,
        {
          body:
            content.caption ||
            '',
          attachment: stream,
        },
        replyId
      );
    }

    if (
      content.audio !==
      undefined
    ) {
      const stream =
        await toAttachmentStream(
          content.audio
        );

      return this._sendRaw(
        chatId,
        {
          body: '',
          attachment: stream,
        },
        replyId
      );
    }

    if (
      content.document !==
      undefined
    ) {
      const stream =
        await toAttachmentStream(
          content.document
        );

      return this._sendRaw(
        chatId,
        {
          body:
            content.caption ||
            '',
          attachment: stream,
        },
        replyId
      );
    }

    if (
      content.text !==
      undefined
    ) {
      const message = {
        body: String(
          content.text
        ),
      };

      if (
        Array.isArray(
          content.mentions
        ) &&
        content.mentions.length
      ) {
        message.mentions =
          content.mentions;
      }

      return this._sendRaw(
        chatId,
        message,
        replyId
      );
    }

    throw new Error(
      'Contenu non pris en charge par FacebookAdapter.'
    );
  }

  /**
   * Envoi brut FCA.
   */
  async _sendRaw(
    chatId,
    message,
    replyId = null
  ) {
    if (
      typeof this.api.sendMessage !==
      'function'
    ) {
      throw new Error(
        'api.sendMessage() n’est pas disponible.'
      );
    }

    const result =
      await callbackToPromise(
        (cb) => {
          if (replyId) {
            this.api.sendMessage(
              message,
              chatId,
              cb,
              replyId
            );
          } else {
            this.api.sendMessage(
              message,
              chatId,
              cb
            );
          }
        }
      );

    const messageID =
      result?.messageID ||
      result?.messageId ||
      result?.mid ||
      null;

    return {
      key: {
        id: messageID,
        remoteJid: String(
          chatId
        ),
        messageID,
      },

      raw: result,
    };
  }

  async groupMetadata(
    chatId
  ) {
    if (
      typeof this.api.getThreadInfo !==
      'function'
    ) {
      throw new Error(
        'getThreadInfo() non disponible.'
      );
    }

    const info =
      await callbackToPromise(
        (cb) =>
          this.api.getThreadInfo(
            chatId,
            cb
          )
      );

    const adminSet =
      new Set(
        (info.adminIDs || [])
          .map((admin) =>
            String(
              admin?.id ??
              admin
            )
          )
      );

    const participants =
      (
        info.participantIDs ||
        []
      ).map((id) => ({
        id: String(id),
        admin:
          adminSet.has(
            String(id)
          )
            ? 'admin'
            : null,
      }));

    return {
      id: String(chatId),
      subject:
        info.threadName ||
        info.name ||
        '',
      desc: '',
      memberCount:
        participants.length,
      participants,
    };
  }

  async getChatMemberStatus(
    chatId,
    userId
  ) {
    try {
      const metadata =
        await this.groupMetadata(
          chatId
        );

      const participant =
        metadata.participants.find(
          (item) =>
            item.id ===
            String(userId)
        );

      if (!participant) {
        return null;
      }

      return participant.admin
        ? 'administrator'
        : 'member';
    } catch {
      return null;
    }
  }

  async sendPresenceUpdate(
    _action,
    chatId
  ) {
    if (
      typeof this.api
        .sendTypingIndicator !==
      'function'
    ) {
      return;
    }

    try {
      await callbackToPromise(
        (cb) =>
          this.api.sendTypingIndicator(
            chatId,
            cb
          )
      );
    } catch (err) {
      log.warn(
        'Échec typing indicator',
        err.message
      );
    }
  }

  async readMessages(
    threadId
  ) {
    if (
      typeof this.api.markAsRead !==
      'function'
    ) {
      return;
    }

    try {
      await callbackToPromise(
        (cb) =>
          this.api.markAsRead(
            threadId,
            cb
          )
      );
    } catch (err) {
      log.warn(
        'Échec marquage lu',
        err.message
      );
    }
  }

  async groupParticipantsUpdate(
    chatId,
    ids,
    action
  ) {
    for (const id of ids) {
      if (
        action === 'remove' &&
        typeof this.api
          .removeUserFromGroup ===
          'function'
      ) {
        await callbackToPromise(
          (cb) =>
            this.api.removeUserFromGroup(
              id,
              chatId,
              cb
            )
        );
      }

      else if (
        action === 'add' &&
        typeof this.api
          .addUserToGroup ===
          'function'
      ) {
        await callbackToPromise(
          (cb) =>
            this.api.addUserToGroup(
              id,
              chatId,
              cb
            )
        );
      }

      else if (
        action === 'promote' &&
        typeof this.api
          .changeAdminStatus ===
          'function'
      ) {
        await callbackToPromise(
          (cb) =>
            this.api.changeAdminStatus(
              chatId,
              id,
              true,
              cb
            )
        );
      }

      else if (
        action === 'demote' &&
        typeof this.api
          .changeAdminStatus ===
          'function'
      ) {
        await callbackToPromise(
          (cb) =>
            this.api.changeAdminStatus(
              chatId,
              id,
              false,
              cb
            )
        );
      }

      else {
        throw new Error(
          `Action Facebook non supportée: ${action}`
        );
      }
    }
  }

  async updateBlockStatus() {
    throw new Error(
      'BLOCK_NOT_SUPPORTED_BY_FACEBOOK'
    );
  }

  async groupInviteCode() {
    throw new Error(
      'INVITE_LINK_NOT_SUPPORTED_BY_FACEBOOK'
    );
  }

  async groupRevokeInvite() {
    throw new Error(
      'INVITE_LINK_NOT_SUPPORTED_BY_FACEBOOK'
    );
  }

  async groupUpdateSubject(
    chatId,
    title
  ) {
    if (
      typeof this.api.setTitle !==
      'function'
    ) {
      throw new Error(
        'setTitle() non disponible.'
      );
    }

    return callbackToPromise(
      (cb) =>
        this.api.setTitle(
          title,
          chatId,
          cb
        )
    );
  }

  async groupUpdateDescription() {
    throw new Error(
      'DESCRIPTION_NOT_SUPPORTED_BY_FACEBOOK'
    );
  }

  async updateProfilePicture(
    chatId,
    buffer
  ) {
    if (
      typeof this.api
        .changeGroupImage !==
      'function'
    ) {
      throw new Error(
        'changeGroupImage() non disponible.'
      );
    }

    const stream =
      await toAttachmentStream(
        buffer
      );

    return callbackToPromise(
      (cb) =>
        this.api.changeGroupImage(
          stream,
          chatId,
          cb
        )
    );
  }

  async groupSettingUpdate() {
    throw new Error(
      'SEND_PERMISSIONS_NOT_SUPPORTED_BY_FACEBOOK'
    );
  }
}