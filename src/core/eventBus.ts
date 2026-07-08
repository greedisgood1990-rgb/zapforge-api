import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { GatewayEvent } from './types.js';
import { nowIso } from '../utils/time.js';

export class GatewayEventBus extends EventEmitter {
  emitGateway<T>(event: string, payload: T, sessionId?: string): GatewayEvent<T> {
    const envelope: GatewayEvent<T> = {
      id: nanoid(),
      event,
      sessionId,
      timestamp: nowIso(),
      payload
    };
    this.emit('gateway.event', envelope);
    this.emit(event, envelope);
    return envelope;
  }
}
