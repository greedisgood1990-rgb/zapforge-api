export function normalizeJid(input: string): string {
  const value = input.trim();

  if (value.includes('@')) return value;

  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) throw new Error('Invalid recipient. Use a phone number or a WhatsApp JID.');

  return `${digits}@s.whatsapp.net`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}
