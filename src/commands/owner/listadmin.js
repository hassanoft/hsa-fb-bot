import { db } from '../../database/database.js';
import { buildMentionMessage } from '../../utils/helpers.js';

export default {
  name: 'listadmin',
  aliases: [],
  category: 'owner',
  ownerOnly: true,
  description: 'Liste les administrateurs applicatifs de H$Λ BOT.',
  async execute(ctx) {
    const admins = db.listBotAdmins();
    if (!admins.length) {
      await ctx.reply('ℹ️ Aucun administrateur applicatif défini (en dehors du propriétaire).');
      return;
    }
    const parts = ['👮 Administrateurs H$Λ BOT :\n'];
    admins.forEach((a, i) => {
      const known = db.users.get(a);
      parts.push({ id: a, name: known?.name || a });
      parts.push(i < admins.length - 1 ? '\n' : '');
    });
    const { body, mentions } = buildMentionMessage(parts);
    await ctx.bot.sendMessage(ctx.chatId, { text: body, mentions });
  },
};
