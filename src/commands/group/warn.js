import { getTargetIds } from './_groupHelpers.js';
import { db } from '../../database/database.js';
import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'warn',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: 'Ajoute un avertissement à un membre.',
  async execute(ctx) {
    const targets = getTargetIds(ctx);
    if (!targets.length) {
      await ctx.reply('❌ Mentionnez ou répondez au membre à avertir.');
      return;
    }
    const settings = db.getGroupSettings(ctx.chatId);
    const target = targets[0];
    const targetName = ctx.db.users.get(target)?.name || target;
    const warnings = db.addWarning(ctx.chatId, target, ctx.args.slice(1).join(' ') || 'Non spécifiée');
    const { body, mentions } = buildMentionMessage([
      '⚠️ Warning pour ',
      { id: target, name: targetName },
      ` : ${warnings.length}/${settings.warnLimit || 3}`,
    ]);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
