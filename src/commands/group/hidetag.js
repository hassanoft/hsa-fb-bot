import { buildMentionMessage } from '../../utils/helpers.js';

// LIMITATION FACEBOOK : contrairement à WhatsApp, FCA ne permet pas de
// notifier sans afficher un minimum de texte pour chaque mention. On réduit
// donc chaque mention à un caractère de largeur nulle (quasi invisible) pour
// se rapprocher au maximum de l'effet "hidetag".
export default {
  name: 'hidetag',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: 'Notifie tous les membres avec un minimum de texte affiché.',
  async execute(ctx) {
    const participants = ctx.groupMetadata?.participants || [];
    if (!participants.length) {
      await ctx.reply('❌ Impossible de récupérer la liste des membres.');
      return;
    }
    const parts = [`${ctx.text || '📢'}\n`];
    for (const p of participants) parts.push({ id: p.id, name: '\u200b' });
    const { body, mentions } = buildMentionMessage(parts);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
