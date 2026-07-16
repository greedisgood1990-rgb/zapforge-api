import { nanoid } from 'nanoid';
import type { AppConfig } from '../config.js';
import { JsonStore } from '../storage/jsonStore.js';
import { GatewayEventBus } from './eventBus.js';
import type { GatewayEvent, WebhookRegistration } from './types.js';
import { safeToken, signPayload } from '../utils/hmac.js';
import { nowIso } from '../utils/time.js';

export class WebhookService {
  constructor(
    private store: JsonStore,
    private bus: GatewayEventBus,
    private config: AppConfig
  ) {}

  async init(): Promise<void> {
    this.bus.on('gateway.event', (event: GatewayEvent) => {
      this.dispatch(event).catch((error) => {
        // The server logger also receives errors from routes. Webhook dispatch must never crash the API.
        console.error('[webhook.dispatch.failed]', error);
      });
    });
  }

  list(): WebhookRegistration[] {
    return this.store.allWebhooks();
  }

  async create(input: { url: string; events?: string[]; secret?: string; active?: boolean }): Promise<WebhookRegistration> {
    const now = nowIso();
    const webhook: WebhookRegistration = {
      id: nanoid(),
      url: input.url,
      secret: input.secret || safeToken(16),
      events: input.events?.length ? input.events : ['*'],
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now
    };
    await this.store.saveWebhook(webhook);
    await this.store.audit('api', 'webhook.create', { id: webhook.id, url: webhook.url, events: webhook.events });
    return webhook;
  }

  async remove(id: string): Promise<void> {
    await this.store.removeWebhook(id);
    await this.store.audit('api', 'webhook.remove', { id });
  }

  async update(id: string, input: Partial<Pick<WebhookRegistration, 'url' | 'events' | 'secret' | 'active'>>): Promise<WebhookRegistration> {
    const current = this.store.getWebhook(id);
    if (!current) throw new Error(`Webhook ${id} not found.`);
    const next: WebhookRegistration = { ...current, ...input, updatedAt: nowIso() };
    await this.store.saveWebhook(next);
    await this.store.audit('api', 'webhook.update', { id });
    return next;
  }

  private async dispatch(event: GatewayEvent): Promise<void> {
    const hooks = this.store
      .allWebhooks()
      .filter((hook) => hook.active && (hook.events.includes('*') || hook.events.includes(event.event)));

    await Promise.all(hooks.map((hook) => this.deliver(hook, event)));
  }

  private async deliver(hook: WebhookRegistration, event: GatewayEvent): Promise<void> {
    const body = JSON.stringify(event);
    const signature = signPayload(hook.secret, body);
    const attempts = Math.max(1, this.config.WEBHOOK_MAX_RETRIES + 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.WEBHOOK_TIMEOUT_MS);
      try {
        const response = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-zapinho-event': event.event,
            'x-zapinho-delivery': event.id,
            'x-zapinho-signature': `sha256=${signature}`,
            // legacy headers kept for backward compatibility with existing integrations
            'x-zapforge-event': event.event,
            'x-zapforge-delivery': event.id,
            'x-zapforge-signature': `sha256=${signature}`
          },
          body,
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) return;
      } catch {
        clearTimeout(timeout);
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 5000)));
    }
  }
}
