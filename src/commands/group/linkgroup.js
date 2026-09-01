import { infoMessage } from '../../utils/formatter.js';

// LIMITATION FACEBOOK : pas de lien d'invitation stable exposé par les libs
// FCA courantes. En revanche, /add fonctionne réellement — c'est la
// meilleure alternative disponible.
export default {
  name: 'linkgroup',
  aliases: ['grouplink'],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  description: "Non disponible sur Facebook — voir /add.",
  async execute(ctx) {
    await ctx.reply(
      infoMessage(`Messenger ne fournit pas de lien d'invitation stable via l'API. Utilisez ${ctx.prefix}add <identifiant> pour ajouter directement un membre.`)
    );
  },
};
