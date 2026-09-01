import { getTargetIds } from '../group/_groupHelpers.js';
import { randomInt } from '../../utils/helpers.js';
import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'ship',
  aliases: [],
  category: 'fun',
  description: "Calcule le pourcentage de compatibilité entre deux membres (répondez au message de l'un d'eux).",
  async execute(ctx) {
    const a = ctx.senderId;
    const b = getTargetIds(ctx)[0];
    if (!b || b === a) {
      await ctx.reply(`❌ Répondez au message de la personne à "shipper" avec ${ctx.prefix}ship.`);
      return;
    }
    const percent = randomInt(0, 100);
    const nameA = ctx.pushName;
    const nameB = ctx.db.users.get(b)?.name || b;
    const { body, mentions } = buildMentionMessage([
      '💘 ',
      { id: a, name: nameA },
      ' + ',
      { id: b, name: nameB },
      ` = ${percent}% de compatibilité !`,
    ]);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
