// Non une commande : helpers partagés pour extraire les identifiants ciblés
// dans une commande de groupe.
//
// FCA expose deux mécanismes : `messageReply` (l'utilisateur a répondu au
// message de la personne visée) et `mentions` (objet {"@Nom": "userID"}
// quand quelqu'un a été @-mentionné dans le texte).
export function getTargetIds(ctx) {
  const replySenderId = ctx.msg.messageReply?.senderID;
  if (replySenderId) return [String(replySenderId)];

  const mentions = ctx.msg.mentions || {};
  const mentionIds = Object.values(mentions).map(String);
  if (mentionIds.length) return mentionIds;

  if (ctx.args[0]) {
    const digits = ctx.args[0].replace(/\D/g, '');
    if (digits) return [digits];
  }

  return [];
}
