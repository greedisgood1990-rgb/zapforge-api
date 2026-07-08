import crypto from 'node:crypto';

export function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function safeToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}
