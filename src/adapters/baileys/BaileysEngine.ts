import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { MessagingEngine } from '../base.js';
import type {
  EngineCapabilities,
  GroupParticipantAction,
  GroupUpdateInput,
  IncomingMessageEvent,
  InteractiveButton,
  OutgoingButtonsMessage,
  OutgoingGroupMentionMessage,
  OutgoingListMessage,
  OutgoingMediaMessage,
  OutgoingPollMessage,
  OutgoingTextMessage,
  SentMessageResult,
  SessionSnapshot
} from '../../core/types.js';
import { nowIso } from '../../utils/time.js';
import { normalizeJid } from '../../utils/jid.js';
import { detectMessageType, extractInteraction, extractMessageText } from '../../utils/message.js';
import { safeSessionPath } from '../../utils/sessionId.js';

export interface BaileysEngineOptions {
  id: string;
  sessionDir: string;
  browserName: string;
  maxMentionParticipants: number;
  initial?: Partial<SessionSnapshot>;
}

type EngineEvent =
  | 'session.updated'
  | 'message.received'
  | 'message.sent'
  | 'message.interaction'
  | 'group.updated'
  | 'group.participants.updated';

export class BaileysEngine implements MessagingEngine {
  private emitter = new EventEmitter();
  private socket: any;
  private baileys: any;
  private session: SessionSnapshot;
  private options: BaileysEngineOptions;

  constructor(options: BaileysEngineOptions) {
    const now = nowIso();
    this.options = options;
    this.session = {
      id: options.id,
      engine: 'baileys',
      state: 'created',
      qr: null,
      phone: null,
      name: null,
      createdAt: options.initial?.createdAt || now,
      updatedAt: now,
      metadata: options.initial?.metadata || {}
    };
  }

  async start(): Promise<SessionSnapshot> {
    const baileys: any = await import('@whiskeysockets/baileys');
    this.baileys = baileys;
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState;
    const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    const Browsers = baileys.Browsers;

    this.update({ state: 'connecting' });

    const authPath = safeSessionPath(this.options.sessionDir, this.options.id);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers?.ubuntu ? Browsers.ubuntu(this.options.browserName) : undefined,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update: any) => {
      if (update.qr) this.update({ state: 'qr', qr: update.qr });

      if (update.connection === 'open') {
        const me = this.socket?.user || {};
        this.update({
          state: 'connected',
          qr: null,
          phone: me?.id || null,
          name: me?.name || me?.verifiedName || null,
          lastSeenAt: nowIso()
        });
      }

      if (update.connection === 'close') {
        const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
        const loggedOutCode = baileys.DisconnectReason?.loggedOut;
        const loggedOut = loggedOutCode && statusCode === loggedOutCode;
        this.update({ state: loggedOut ? 'logged_out' : 'disconnected', qr: loggedOut ? null : this.session.qr });
      }
    });

    this.socket.ev.on('messages.upsert', (upsert: any) => {
      for (const message of upsert.messages || []) {
        const interaction = extractInteraction(message);
        const event: IncomingMessageEvent = {
          id: message?.key?.id || nanoid(),
          sessionId: this.session.id,
          from: message?.key?.remoteJid || 'unknown',
          fromMe: Boolean(message?.key?.fromMe),
          pushName: message?.pushName,
          type: detectMessageType(message),
          text: extractMessageText(message),
          interaction,
          timestamp: new Date(Number(message?.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          raw: message
        };
        this.emitter.emit('message.received', event);
        if (interaction && !event.fromMe) this.emitter.emit('message.interaction', event);
      }
    });

    this.socket.ev.on('groups.update', (updates: any[]) => {
      for (const update of updates || []) {
        this.emitter.emit('group.updated', {
          sessionId: this.session.id,
          ...update,
          timestamp: nowIso()
        });
      }
    });

    this.socket.ev.on('group-participants.update', (update: any) => {
      this.emitter.emit('group.participants.updated', {
        sessionId: this.session.id,
        ...update,
        timestamp: nowIso()
      });
    });

    return this.snapshot();
  }

  async stop(): Promise<void> {
    if (this.socket?.end) this.socket.end(undefined);
    this.socket = undefined;
    this.update({ state: 'disconnected', qr: null });
  }

  async logout(): Promise<void> {
    if (this.socket?.logout) await this.socket.logout();
    this.socket = undefined;
    this.update({ state: 'logged_out', qr: null });
  }

  snapshot(): SessionSnapshot {
    return structuredClone(this.session);
  }

  capabilities(): EngineCapabilities {
    return {
      provider: 'baileys',
      capabilities: {
        'messages.text': true,
        'messages.media': true,
        'messages.groupMention': true,
        'messages.replyButtons': 'experimental',
        'messages.urlButtons': 'experimental',
        'messages.callButtons': 'experimental',
        'messages.copyButtons': 'experimental',
        'messages.lists': 'experimental',
        'messages.polls': true,
        'groups.read': true,
        'groups.create': true,
        'groups.update': true,
        'groups.participants': true,
        'groups.admins': true,
        'groups.invites': true,
        'groups.joinRequests': true,
        'groups.memberAddMode': true
      }
    };
  }

  async sendText(input: OutgoingTextMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);

    if (input.typingTimeMs && input.typingTimeMs > 0) {
      await this.socket.sendPresenceUpdate('composing', to);
      await new Promise((resolve) => setTimeout(resolve, Math.min(input.typingTimeMs || 0, 10_000)));
      await this.socket.sendPresenceUpdate('paused', to);
    }

    const raw = await this.socket.sendMessage(to, {
      text: input.body,
      linkPreview: !input.noLinkPreview
    });

    return this.sentResult(to, raw);
  }

  async sendMedia(input: OutgoingMediaMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);
    const media = await this.resolveMedia(input);
    const payload: Record<string, unknown> = {
      caption: input.caption,
      mimetype: input.mimetype,
      fileName: input.filename
    };

    if (input.type === 'image') payload.image = media;
    if (input.type === 'video') payload.video = media;
    if (input.type === 'audio') payload.audio = media;
    if (input.type === 'document') payload.document = media;
    if (input.type === 'sticker') payload.sticker = media;

    const raw = await this.socket.sendMessage(to, payload);
    return this.sentResult(to, raw);
  }

  async sendGroupMention(input: OutgoingGroupMentionMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const groupId = normalizeGroupJid(input.groupId);
    const metadata = await this.socket.groupMetadata(groupId);
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    const includeAdmins = input.includeAdmins !== false;
    type MentionMember = { sendJid: string; displayJid: string; aliases: string[] };
    const members: MentionMember[] = participants
      .filter((participant: any) => includeAdmins || !participant.admin)
      .map((participant: any) => ({
        sendJid: participant.id || participant.jid || participant.lid,
        displayJid: participant.jid || participant.id || participant.lid,
        aliases: [participant.id, participant.jid, participant.lid].filter(
          (jid: unknown): jid is string => typeof jid === 'string' && jid.length > 0
        )
      }))
      .filter((member: Partial<MentionMember>): member is MentionMember => Boolean(member.sendJid && member.displayJid));

    let selected: MentionMember[];
    if (input.mentionAll !== false) {
      selected = members;
    } else {
      selected = (input.mentions || []).flatMap((value) => {
        const normalized = normalizeJid(value);
        const member = members.find((candidate) => candidate.aliases.includes(normalized));
        return member ? [member] : [];
      });
    }
    selected = Array.from(new Map(selected.map((member) => [member.sendJid, member])).values());
    const mentions = selected.map((member) => member.sendJid);

    if (!mentions.length) throw new Error('No valid group participants were selected for mention.');
    if (mentions.length > this.options.maxMentionParticipants) {
      throw new Error(`Mention limit exceeded. Maximum: ${this.options.maxMentionParticipants}.`);
    }

    const mentionText = selected.map((member) => `@${member.displayJid.split('@')[0]}`).join(' ');
    const text = input.appendMentions === false ? input.body : `${input.body}\n\n${mentionText}`;
    if (text.length > 65536) throw new Error('Message is too long after appending mentions.');
    const raw = await this.socket.sendMessage(groupId, { text, mentions });
    const result = this.sentResult(groupId, raw);
    result.mentionedCount = mentions.length;
    return result;
  }

  async sendButtons(input: OutgoingButtonsMessage): Promise<SentMessageResult> {
    const buttons = input.buttons.map((button) => this.nativeButton(button));
    return this.sendNativeFlow(input.to, input.body, input.title, input.footer, buttons);
  }

  async sendList(input: OutgoingListMessage): Promise<SentMessageResult> {
    const sections = input.sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({
        id: row.id,
        header: row.title,
        title: row.title,
        description: row.description || ''
      }))
    }));
    return this.sendNativeFlow(input.to, input.body, input.title, input.footer, [{
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: input.buttonText, sections })
    }]);
  }

  async sendPoll(input: OutgoingPollMessage): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(input.to);
    const selectableCount = Math.max(1, Math.min(input.selectableCount || 1, input.options.length));
    const raw = await this.socket.sendMessage(to, {
      poll: {
        name: input.question,
        values: input.options,
        selectableCount
      }
    });
    return this.sentResult(to, raw);
  }

  async listGroups(): Promise<unknown[]> {
    this.assertConnected();
    const groups = await this.socket.groupFetchAllParticipating();
    return Object.values(groups || {});
  }

  async getGroup(id: string): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupMetadata(normalizeGroupJid(id));
  }

  async createGroup(subject: string, participants: string[]): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupCreate(subject, participants.map((participant) => normalizeJid(participant)));
  }

  async updateGroup(id: string, input: GroupUpdateInput): Promise<unknown> {
    this.assertConnected();
    const groupId = normalizeGroupJid(id);
    if (input.subject !== undefined) await this.socket.groupUpdateSubject(groupId, input.subject);
    if (input.description !== undefined) await this.socket.groupUpdateDescription(groupId, input.description);
    if (input.settings?.announce !== undefined) {
      await this.socket.groupSettingUpdate(groupId, input.settings.announce ? 'announcement' : 'not_announcement');
    }
    if (input.settings?.locked !== undefined) {
      await this.socket.groupSettingUpdate(groupId, input.settings.locked ? 'locked' : 'unlocked');
    }
    if (input.settings?.ephemeralDuration !== undefined) {
      if (typeof this.socket.groupToggleEphemeral !== 'function') {
        throw new Error('Ephemeral group messages are not supported by the installed Baileys version.');
      }
      await this.socket.groupToggleEphemeral(groupId, input.settings.ephemeralDuration);
    }
    if (input.settings?.memberAddMode !== undefined) {
      if (typeof this.socket.groupMemberAddMode !== 'function') {
        throw new Error('Group member add mode is not supported by the installed Baileys version.');
      }
      await this.socket.groupMemberAddMode(groupId, input.settings.memberAddMode);
    }
    if (input.settings?.joinApprovalMode !== undefined) {
      if (typeof this.socket.groupJoinApprovalMode !== 'function') {
        throw new Error('Group join approval mode is not supported by the installed Baileys version.');
      }
      await this.socket.groupJoinApprovalMode(groupId, input.settings.joinApprovalMode ? 'on' : 'off');
    }
    return this.socket.groupMetadata(groupId);
  }

  async updateGroupParticipants(id: string, participants: string[], action: GroupParticipantAction): Promise<unknown> {
    this.assertConnected();
    return this.socket.groupParticipantsUpdate(
      normalizeGroupJid(id),
      participants.map((participant) => normalizeJid(participant)),
      action
    );
  }

  async listGroupJoinRequests(id: string): Promise<unknown[]> {
    this.assertConnected();
    if (typeof this.socket.groupRequestParticipantsList !== 'function') {
      throw new Error('Group join requests are not supported by the installed Baileys version.');
    }
    return this.socket.groupRequestParticipantsList(normalizeGroupJid(id));
  }

  async updateGroupJoinRequests(id: string, participants: string[], action: 'approve' | 'reject'): Promise<unknown> {
    this.assertConnected();
    if (typeof this.socket.groupRequestParticipantsUpdate !== 'function') {
      throw new Error('Group join requests are not supported by the installed Baileys version.');
    }
    return this.socket.groupRequestParticipantsUpdate(
      normalizeGroupJid(id),
      participants.map((participant) => normalizeJid(participant)),
      action
    );
  }

  async getGroupInviteCode(id: string): Promise<string> {
    this.assertConnected();
    const code = await this.socket.groupInviteCode(normalizeGroupJid(id));
    if (!code) throw new Error('The provider did not return a group invite code.');
    return code;
  }

  async revokeGroupInviteCode(id: string): Promise<string> {
    this.assertConnected();
    const code = await this.socket.groupRevokeInvite(normalizeGroupJid(id));
    if (!code) throw new Error('The provider did not return a new group invite code.');
    return code;
  }

  async acceptGroupInvite(code: string): Promise<string> {
    this.assertConnected();
    const cleanCode = code.replace(/^https?:\/\/chat\.whatsapp\.com\//i, '').trim();
    const groupId = await this.socket.groupAcceptInvite(cleanCode);
    if (!groupId) throw new Error('The group invitation could not be accepted.');
    return groupId;
  }

  async leaveGroup(id: string): Promise<void> {
    this.assertConnected();
    await this.socket.groupLeave(normalizeGroupJid(id));
  }

  addListener(event: EngineEvent, handler: (payload: any) => void | Promise<void>): void {
    this.emitter.on(event, handler);
  }

  private nativeButton(button: InteractiveButton): { name: string; buttonParamsJson: string } {
    const type = button.type || 'reply';
    if (type === 'reply') {
      if (!button.id) throw new Error('Reply button requires id.');
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id })
      };
    }
    if (type === 'url') {
      if (!button.url) throw new Error('URL button requires url.');
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: button.text, url: button.url, merchant_url: button.url })
      };
    }
    if (type === 'call') {
      if (!button.phone) throw new Error('Call button requires phone.');
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({ display_text: button.text, phone_number: button.phone })
      };
    }
    if (!button.value) throw new Error('Copy button requires value.');
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: button.text, copy_code: button.value })
    };
  }

  private async sendNativeFlow(
    recipient: string,
    body: string,
    title: string | undefined,
    footer: string | undefined,
    buttons: Array<{ name: string; buttonParamsJson: string }>
  ): Promise<SentMessageResult> {
    this.assertConnected();
    const to = normalizeJid(recipient);
    const proto = this.baileys?.proto;
    const generateWAMessageFromContent = this.baileys?.generateWAMessageFromContent;
    if (!proto || !generateWAMessageFromContent || typeof this.socket.relayMessage !== 'function') {
      throw new Error('Interactive native-flow messages are not supported by the installed Baileys version.');
    }

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: footer ? proto.Message.InteractiveMessage.Footer.create({ text: footer }) : undefined,
      header: title
        ? proto.Message.InteractiveMessage.Header.create({ title, hasMediaAttachment: false })
        : undefined,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
    });

    const generated = generateWAMessageFromContent(to, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage
        }
      }
    }, {});

    await this.socket.relayMessage(to, generated.message, { messageId: generated.key.id });
    return this.sentResult(to, generated);
  }

  private sentResult(to: string, raw: any): SentMessageResult {
    const result: SentMessageResult = {
      id: raw?.key?.id || nanoid(),
      sessionId: this.session.id,
      to,
      status: 'sent',
      timestamp: nowIso(),
      raw
    };
    this.emitter.emit('message.sent', result);
    return result;
  }

  private async resolveMedia(input: OutgoingMediaMessage): Promise<Buffer | { url: string }> {
    if (input.url) return { url: input.url };
    if (input.base64) return Buffer.from(input.base64, 'base64');
    throw new Error('Media requires url or base64.');
  }

  private assertConnected(): void {
    if (!this.socket || this.session.state !== 'connected') {
      throw new Error(`Session ${this.session.id} is not connected.`);
    }
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.session = { ...this.session, ...patch, updatedAt: nowIso() };
    this.emitter.emit('session.updated', this.snapshot());
  }
}

function normalizeGroupJid(input: string): string {
  if (input.endsWith('@g.us')) return input;
  const clean = input.replace(/[^0-9-]/g, '');
  if (!clean) throw new Error('Invalid group id.');
  return `${clean}@g.us`;
}
