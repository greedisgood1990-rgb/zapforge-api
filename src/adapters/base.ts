import type {
  IncomingMessageEvent,
  OutgoingMediaMessage,
  OutgoingTextMessage,
  SentMessageResult,
  SessionSnapshot
} from '../core/types.js';

type Handler<T> = (payload: T) => void | Promise<void>;

export interface MessagingEngine {
  start(): Promise<SessionSnapshot>;
  stop(): Promise<void>;
  logout(): Promise<void>;
  snapshot(): SessionSnapshot;
  sendText(input: OutgoingTextMessage): Promise<SentMessageResult>;
  sendMedia(input: OutgoingMediaMessage): Promise<SentMessageResult>;
  listGroups(): Promise<unknown[]>;
  getGroup(id: string): Promise<unknown>;
  addListener(event: 'session.updated', handler: Handler<SessionSnapshot>): void;
  addListener(event: 'message.received', handler: Handler<IncomingMessageEvent>): void;
  addListener(event: 'message.sent', handler: Handler<SentMessageResult>): void;
}
