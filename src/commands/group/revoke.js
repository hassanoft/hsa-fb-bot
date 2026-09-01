import { infoMessage } from '../../utils/formatter.js';

export default {
  name: 'revoke',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: "Non disponible sur Facebook.",
  async execute(ctx) {
    await ctx.reply(infoMessage("Messenger ne fournit pas de lien d'invitation à révoquer via l'API."));
  },
};
