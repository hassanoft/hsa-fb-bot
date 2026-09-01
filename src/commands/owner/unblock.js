import { infoMessage } from '../../utils/formatter.js';

export default {
  name: 'unblock',
  aliases: [],
  category: 'owner',
  ownerOnly: true,
  description: "Non disponible sur Facebook — utilisez /unban (voir description).",
  async execute(ctx) {
    await ctx.reply(infoMessage(`Utilisez ${ctx.prefix}unban à la place.`));
  },
};
