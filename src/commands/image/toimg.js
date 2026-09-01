import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import { downloadQuotedOrDirectMedia, resolveFfmpegPath, tempFilePath, cleanupFile, ffmpegRun } from '../../utils/media.js';
import { errorMessage } from '../../utils/formatter.js';

export default {
  name: 'toimg',
  aliases: [],
  category: 'image',
  description: 'Reconvertit un sticker Messenger en image classique.',
  async execute(ctx) {
    const media = await downloadQuotedOrDirectMedia(ctx.msg);
    if (!media || media.type !== 'sticker') {
      await ctx.reply(`❌ Répondez à un sticker avec ${ctx.prefix}toimg.`);
      return;
    }
    try {
      await resolveFfmpegPath();
      const inFile = tempFilePath('bin');
      const outFile = tempFilePath('png');
      fs.writeFileSync(inFile, media.buffer);
      try {
        const cmd = ffmpeg(inFile).outputOptions(['-frames:v', '1']);
        cmd.save(outFile);
        await ffmpegRun(cmd);
        const png = fs.readFileSync(outFile);
        await ctx.bot.sendMessage(ctx.chatId, { image: png }, { quoted: ctx.msg });
      } finally {
        cleanupFile(inFile);
        cleanupFile(outFile);
      }
    } catch {
      await ctx.reply(errorMessage('Échec de la conversion de ce sticker en image.'));
    }
  },
};
