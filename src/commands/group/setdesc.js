import { infoMessage } from '../../utils/formatter.js';

export default {
  name: 'setdesc',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: "Non disponible — Messenger n'a pas de description de groupe.",
  async execute(ctx) {
    await ctx.reply(infoMessage("Messenger n'a pas de champ description pour les groupes."));
  },
};
