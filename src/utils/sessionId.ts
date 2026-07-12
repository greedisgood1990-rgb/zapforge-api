import path from 'node:path';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;

export function assertValidSessionId(id: string): string {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error('Invalid session id. Use 2-64 letters, numbers, underscore or hyphen.');
  }
  return id;
}

export function safeSessionPath(baseDir: string, id: string): string {
  const validId = assertValidSessionId(id);
  const base = path.resolve(baseDir);
  const target = path.resolve(base, validId);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error('Invalid session path.');
  }
  return target;
}
