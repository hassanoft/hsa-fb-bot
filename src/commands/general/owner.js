import { config } from '../../config.js';
import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'owner',
  aliases: [],
  category: 'general',
  description: 'Affiche le contact du propriétaire du bot.',
  async execute(ctx) {
    if (!config.ownerId) {
      await ctx.reply('❌ Aucun propriétaire configuré pour le moment.');
      return;
    }
    const { body, mentions } = buildMentionMessage([
      '👑 Propriétaire de H$Λ BOT : ',
      { id: config.ownerId, name: 'Contacter le propriétaire' },
      `\n🔗 m.me/${config.ownerId}`,
    ]);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
