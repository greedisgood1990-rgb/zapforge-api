import type {
  EngineCapabilities,
  GroupParticipantAction,
  GroupUpdateInput,
  IncomingMessageEvent,
  OutgoingButtonsMessage,
  OutgoingGroupMentionMessage,
  OutgoingListMessage,
  OutgoingMediaMessage,
  OutgoingPollMessage,
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
  capabilities(): EngineCapabilities;

  sendText(input: OutgoingTextMessage): Promise<SentMessageResult>;
  sendMedia(input: OutgoingMediaMessage): Promise<SentMessageResult>;
  sendGroupMention(input: OutgoingGroupMentionMessage): Promise<SentMessageResult>;
  sendButtons(input: OutgoingButtonsMessage): Promise<SentMessageResult>;
  sendList(input: OutgoingListMessage): Promise<SentMessageResult>;
  sendPoll(input: OutgoingPollMessage): Promise<SentMessageResult>;

  listGroups(): Promise<unknown[]>;
  getGroup(id: string): Promise<unknown>;
  createGroup(subject: string, participants: string[]): Promise<unknown>;
  updateGroup(id: string, input: GroupUpdateInput): Promise<unknown>;
  updateGroupParticipants(id: string, participants: string[], action: GroupParticipantAction): Promise<unknown>;
  listGroupJoinRequests(id: string): Promise<unknown[]>;
  updateGroupJoinRequests(id: string, participants: string[], action: 'approve' | 'reject'): Promise<unknown>;
  getGroupInviteCode(id: string): Promise<string>;
  revokeGroupInviteCode(id: string): Promise<string>;
  acceptGroupInvite(code: string): Promise<string>;
  leaveGroup(id: string): Promise<void>;

  addListener(event: 'session.updated', handler: Handler<SessionSnapshot>): void;
  addListener(event: 'message.received', handler: Handler<IncomingMessageEvent>): void;
  addListener(event: 'message.sent', handler: Handler<SentMessageResult>): void;
  addListener(event: 'message.interaction', handler: Handler<IncomingMessageEvent>): void;
  addListener(event: 'group.updated', handler: Handler<unknown>): void;
  addListener(event: 'group.participants.updated', handler: Handler<unknown>): void;
}
