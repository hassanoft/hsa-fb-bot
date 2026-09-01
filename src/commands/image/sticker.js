import { handleStickerCommand } from './_stickerCore.js';

export default {
  name: 'sticker',
  aliases: [],
  category: 'image',
  description: 'Convertit une image en format carré (Messenger ne supporte pas les stickers personnalisés).',
  async execute(ctx) {
    await handleStickerCommand(ctx);
  },
};
