// Fichier partagé (pas une commande) : logique commune à /sticker et /s.
//
// LIMITATION FACEBOOK : Messenger n'a pas de notion de "sticker personnalisé"
// envoyable via l'API — les stickers Messenger sont des ID fixes issus de
// packs Facebook, pas des images arbitraires. /sticker convertit donc
// l'image en une image carrée classique, honnêtement présentée comme telle.
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import { resolveFfmpegPath, tempFilePath, cleanupFile, ffmpegRun } from '../../utils/media.js';
import { downloadQuotedOrDirectMedia } from '../../utils/media.js';
import { errorMessage } from '../../utils/formatter.js';

export async function convertToSquareImage(bufferIn) {
  await resolveFfmpegPath();
  const inFile = tempFilePath('bin');
  const outFile = tempFilePath('png');
  fs.writeFileSync(inFile, bufferIn);

  try {
    const cmd = ffmpeg(inFile).outputOptions([
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white',
      '-frames:v', '1',
    ]);
    cmd.save(outFile);
    await ffmpegRun(cmd);
    return fs.readFileSync(outFile);
  } finally {
    cleanupFile(inFile);
    cleanupFile(outFile);
  }
}

export async function handleStickerCommand(ctx) {
  const media = await downloadQuotedOrDirectMedia(ctx.msg);
  if (!media || media.type !== 'image') {
    await ctx.reply(`❌ Répondez à une image avec ${ctx.prefix}sticker.`);
    return;
  }
  try {
    const png = await convertToSquareImage(media.buffer);
    await ctx.bot.sendMessage(
      ctx.chatId,
      { image: png, caption: 'ℹ️ Messenger ne supporte pas les stickers personnalisés : image carrée envoyée à la place.' },
      { quoted: ctx.msg }
    );
  } catch {
    await ctx.reply(errorMessage('Échec de la conversion (ffmpeg manquant ou image invalide).'));
  }
}
