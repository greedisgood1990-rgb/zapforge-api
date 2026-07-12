export type EngineName = 'baileys';

export type SessionState =
  | 'created'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'disconnected'
  | 'logged_out'
  | 'failed';

export interface SessionSnapshot {
  id: string;
  engine: EngineName;
  state: SessionState;
  qr?: string | null;
  phone?: string | null;
  name?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface OutgoingTextMessage {
  sessionId: string;
  to: string;
  body: string;
  quotedMessageId?: string;
  noLinkPreview?: boolean;
  typingTimeMs?: number;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface OutgoingMediaMessage {
  sessionId: string;
  to: string;
  type: MediaKind;
  url?: string;
  base64?: string;
  filename?: string;
  caption?: string;
  mimetype?: string;
}

export interface OutgoingGroupMentionMessage {
  sessionId: string;
  groupId: string;
  body: string;
  mentionAll?: boolean;
  mentions?: string[];
  appendMentions?: boolean;
  includeAdmins?: boolean;
}

export type InteractiveButtonType = 'reply' | 'url' | 'call' | 'copy';

export interface InteractiveButton {
  type?: InteractiveButtonType;
  id?: string;
  text: string;
  url?: string;
  phone?: string;
  value?: string;
}

export interface OutgoingButtonsMessage {
  sessionId: string;
  to: string;
  body: string;
  title?: string;
  footer?: string;
  buttons: InteractiveButton[];
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

export interface OutgoingListMessage {
  sessionId: string;
  to: string;
  body: string;
  title?: string;
  footer?: string;
  buttonText: string;
  sections: InteractiveListSection[];
}

export interface OutgoingPollMessage {
  sessionId: string;
  to: string;
  question: string;
  options: string[];
  selectableCount?: number;
}

export interface SentMessageResult {
  id: string;
  sessionId: string;
  to: string;
  status: 'queued' | 'sent';
  timestamp: string;
  mentionedCount?: number;
  raw?: unknown;
}

export interface MessageInteraction {
  type: 'button_reply' | 'list_reply' | 'native_flow' | 'template_button_reply';
  id?: string | null;
  title?: string | null;
  params?: Record<string, unknown> | null;
}

export interface IncomingMessageEvent {
  id: string;
  sessionId: string;
  from: string;
  fromMe: boolean;
  pushName?: string;
  type: string;
  text?: string | null;
  interaction?: MessageInteraction | null;
  timestamp: string;
  raw?: unknown;
}

export type GroupParticipantAction = 'add' | 'remove' | 'promote' | 'demote';

export interface GroupSettingsInput {
  announce?: boolean;
  locked?: boolean;
  ephemeralDuration?: number;
  memberAddMode?: 'admin_add' | 'all_member_add';
  joinApprovalMode?: boolean;
}

export interface GroupUpdateInput {
  subject?: string;
  description?: string;
  settings?: GroupSettingsInput;
}

export interface EngineCapabilities {
  provider: EngineName;
  capabilities: Record<string, boolean | 'experimental'>;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedStore {
  sessions: Record<string, SessionSnapshot>;
  webhooks: Record<string, WebhookRegistration>;
  audit: Array<{
    id: string;
    actor: string;
    action: string;
    at: string;
    details?: Record<string, unknown>;
  }>;
}

export interface GatewayEvent<T = unknown> {
  id: string;
  event: string;
  timestamp: string;
  sessionId?: string;
  payload: T;
}
