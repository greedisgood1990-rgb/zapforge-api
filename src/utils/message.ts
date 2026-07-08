export function extractMessageText(message: any): string | null {
  const content = message?.message;
  if (!content) return null;

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    null
  );
}

export function detectMessageType(message: any): string {
  const content = message?.message;
  if (!content) return 'unknown';
  return Object.keys(content)[0] || 'unknown';
}
