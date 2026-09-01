import { infoMessage } from '../../utils/formatter.js';

export default {
  name: 'open',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: "Non disponible — Messenger n'a pas de réglage \"qui peut écrire\".",
  async execute(ctx) {
    await ctx.reply(infoMessage("Messenger ne propose pas de réglage pour restreindre qui peut écrire dans un groupe."));
  },
};
