import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { PersistedStore, SessionSnapshot, WebhookRegistration } from '../core/types.js';
import { nowIso } from '../utils/time.js';

const emptyStore: PersistedStore = {
  sessions: {},
  webhooks: {},
  audit: []
};

export class JsonStore {
  private filePath: string;
  private data: PersistedStore = structuredClone(emptyStore);
  private ready = false;
  private flushQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.data = { ...structuredClone(emptyStore), ...JSON.parse(raw) };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      await this.flush();
    }
    this.ready = true;
  }

  allSessions(): SessionSnapshot[] {
    this.ensureReady();
    return Object.values(this.data.sessions);
  }

  getSession(id: string): SessionSnapshot | undefined {
    this.ensureReady();
    return this.data.sessions[id];
  }

  async saveSession(session: SessionSnapshot): Promise<SessionSnapshot> {
    this.ensureReady();
    this.data.sessions[session.id] = session;
    await this.flush();
    return session;
  }

  async removeSession(id: string): Promise<void> {
    this.ensureReady();
    delete this.data.sessions[id];
    await this.flush();
  }

  allWebhooks(): WebhookRegistration[] {
    this.ensureReady();
    return Object.values(this.data.webhooks);
  }

  getWebhook(id: string): WebhookRegistration | undefined {
    this.ensureReady();
    return this.data.webhooks[id];
  }

  async saveWebhook(webhook: WebhookRegistration): Promise<WebhookRegistration> {
    this.ensureReady();
    this.data.webhooks[webhook.id] = webhook;
    await this.flush();
    return webhook;
  }

  async removeWebhook(id: string): Promise<void> {
    this.ensureReady();
    delete this.data.webhooks[id];
    await this.flush();
  }

  async audit(actor: string, action: string, details?: Record<string, unknown>): Promise<void> {
    this.ensureReady();
    this.data.audit.unshift({ id: nanoid(), actor, action, at: nowIso(), details });
    this.data.audit = this.data.audit.slice(0, 1000);
    await this.flush();
  }

  private ensureReady(): void {
    if (!this.ready) throw new Error('JsonStore not initialized. Call init() first.');
  }

  private flush(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    const directory = path.dirname(this.filePath);
    const temporary = `${this.filePath}.tmp`;

    this.flushQueue = this.flushQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
      });

    return this.flushQueue;
  }
}
