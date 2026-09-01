import { buildMentionMessage } from '../../utils/helpers.js';

// Un compte personnel voit la liste COMPLÈTE des membres (contrairement à un
// bot Telegram, limité aux administrateurs) : /tagall fonctionne réellement.
export default {
  name: 'tagall',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: 'Mentionne tous les membres du groupe.',
  async execute(ctx) {
    const participants = ctx.groupMetadata?.participants || [];
    if (!participants.length) {
      await ctx.reply('❌ Impossible de récupérer la liste des membres.');
      return;
    }
    const parts = [`📢 ${ctx.text || 'Attention à tous !'}\n\n`];
    participants.forEach((p, i) => {
      parts.push({ id: p.id, name: p.name || p.id });
      parts.push(i < participants.length - 1 ? ' ' : '');
    });
    const { body, mentions } = buildMentionMessage(parts);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
