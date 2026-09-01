export default {
  name: 'groupinfo',
  aliases: [],
  category: 'group',
  groupOnly: true,
  description: 'Affiche les informations du groupe.',
  async execute(ctx) {
    const g = ctx.groupMetadata;
    if (!g) {
      await ctx.reply('❌ Impossible de récupérer les informations du groupe.');
      return;
    }
    const admins = g.participants.filter((p) => p.admin).length;
    await ctx.reply(
      `👥 ${g.subject || '(sans nom)'}\n\n` +
      `🆔 ID : ${g.id}\n` +
      `👤 Membres : ${g.participants.length}\n` +
      `👮 Administrateurs : ${admins}\n\n` +
      `ℹ️ Messenger n'expose ni description de groupe ni date de création via l'API.`
    );
  },
};
