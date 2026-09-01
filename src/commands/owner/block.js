import { getTargetIds } from '../group/_groupHelpers.js';
import { infoMessage } from '../../utils/formatter.js';

// LIMITATION FACEBOOK : bloquer un utilisateur n'est pas exposé par les libs
// FCA courantes. L'équivalent applicatif disponible est /ban, qui empêche
// déjà la personne d'utiliser les commandes de H$Λ BOT.
export default {
  name: 'block',
  aliases: [],
  category: 'owner',
  ownerOnly: true,
  description: "Non disponible sur Facebook — utilisez /ban (voir description).",
  async execute(ctx) {
    const targets = getTargetIds(ctx);
    if (!targets.length) {
      await ctx.reply(infoMessage('Mentionnez ou indiquez un identifiant.'));
      return;
    }
    await ctx.reply(
      infoMessage(
        "Le blocage n'est pas exposé par l'API utilisée par H$Λ BOT.\n" +
        `Utilisez ${ctx.prefix}ban à la place pour lui interdire l'usage du bot.`
      )
    );
  },
};
