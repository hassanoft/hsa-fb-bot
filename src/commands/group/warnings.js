import { getTargetIds } from './_groupHelpers.js';
import { db } from '../../database/database.js';
import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'warnings',
  aliases: [],
  category: 'group',
  groupOnly: true,
  description: "Affiche les avertissements d'un membre.",
  async execute(ctx) {
    const targets = getTargetIds(ctx);
    const target = targets[0] || ctx.senderId;
    const list = db.getWarnings(ctx.chatId, target);
    if (!list.length) {
      await ctx.reply('✅ Aucun avertissement pour ce membre.');
      return;
    }
    const lines = list.map((w, i) => `${i + 1}. ${w.reason} — ${new Date(w.date).toLocaleDateString('fr-FR')}`);
    const { body, mentions } = buildMentionMessage(['⚠️ Avertissements de ', { id: target, name: target }, `:\n${lines.join('\n')}`]);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
