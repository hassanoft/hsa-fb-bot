import { config } from '../../config.js';
import { downloadQuotedOrDirectMedia } from '../../utils/media.js';
import { errorMessage, successMessage, infoMessage } from '../../utils/formatter.js';

// Facebook n'a pas d'équivalent fiable au "Statut" WhatsApp exposé par les
// libs FCA (les Stories Facebook ne sont pas accessibles via ce mécanisme).
// Cette commande est repositionnée : elle publie la vidéo dans un fil
// (thread) Facebook configuré (FB_STATUS_THREAD_ID).
export default {
  name: 'videostatus',
  aliases: [],
  category: 'video',
  ownerOnly: true,
  description: "Publie une vidéo dans le fil configuré (FB_STATUS_THREAD_ID) — pas d'équivalent 'Statut' sur Facebook via ce mécanisme.",
  async execute(ctx) {
    if (!config.statusThreadId) {
      await ctx.reply(
        infoMessage(
          "Aucun équivalent fiable au Statut WhatsApp n'est exposé par ce mécanisme. Configurez " +
          'FB_STATUS_THREAD_ID (identifiant d\'un fil/groupe) dans .env pour utiliser cette commande.'
        )
      );
      return;
    }
    const media = await downloadQuotedOrDirectMedia(ctx.msg);
    if (!media || media.type !== 'video') {
      await ctx.reply(`❌ Répondez à une vidéo avec ${ctx.prefix}videostatus.`);
      return;
    }
    try {
      await ctx.bot.sendMessage(config.statusThreadId, { video: media.buffer, caption: ctx.text || '' });
      await ctx.reply(successMessage('Vidéo publiée dans le fil configuré.'));
    } catch {
      await ctx.reply(errorMessage('Échec de la publication.'));
    }
  },
};
