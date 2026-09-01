import { errorMessage, successMessage } from '../../utils/formatter.js';

// Contrairement à WhatsApp/Telegram, un compte Facebook personnel PEUT
// réellement ajouter un membre à un groupe (même droit que n'importe quel
// membre depuis l'application).
export default {
  name: 'add',
  aliases: [],
  category: 'group',
  groupOnly: true,
  adminOnly: true,
  requireBotGroupAdmin: true,
  description: "Ajoute un membre au groupe. Usage : /add <identifiant Facebook>",
  async execute(ctx) {
    const id = ctx.args[0]?.replace(/\D/g, '');
    if (!id) {
      await ctx.reply(`❌ Utilisation : ${ctx.prefix}add <identifiant numérique Facebook>`);
      return;
    }
    try {
      await ctx.bot.groupParticipantsUpdate(ctx.chatId, [id], 'add');
      await ctx.reply(successMessage('Membre ajouté au groupe.'));
    } catch {
      await ctx.reply(errorMessage("Échec de l'ajout (identifiant invalide, ou la personne ne peut pas être ajoutée)."));
    }
  },
};
