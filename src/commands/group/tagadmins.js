import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'tagadmins',
  aliases: [],
  category: 'group',
  groupOnly: true,
  description: 'Mentionne uniquement les administrateurs du groupe.',
  async execute(ctx) {
    const admins = (ctx.groupMetadata?.participants || []).filter((p) => p.admin);
    if (!admins.length) {
      await ctx.reply('❌ Aucun administrateur trouvé.');
      return;
    }
    const parts = [`👮 ${ctx.text || 'Attention administrateurs :'}\n\n`];
    admins.forEach((a, i) => {
      parts.push({ id: a.id, name: a.name || a.id });
      parts.push(i < admins.length - 1 ? ' ' : '');
    });
    const { body, mentions } = buildMentionMessage(parts);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
