import type { MessageInteraction } from '../core/types.js';

function unwrapContent(content: any): any {
  let current = content;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return current;
}

export function extractMessageText(message: any): string | null {
  const content = unwrapContent(message?.message);
  if (!content) return null;

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    content.interactiveResponseMessage?.body?.text ||
    null
  );
}

export function detectMessageType(message: any): string {
  const content = unwrapContent(message?.message);
  if (!content) return 'unknown';
  return Object.keys(content)[0] || 'unknown';
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function extractInteraction(message: any): MessageInteraction | null {
  const content = unwrapContent(message?.message);
  if (!content) return null;

  if (content.buttonsResponseMessage) {
    return {
      type: 'button_reply',
      id: content.buttonsResponseMessage.selectedButtonId || null,
      title: content.buttonsResponseMessage.selectedDisplayText || null,
      params: null
    };
  }

  if (content.listResponseMessage) {
    return {
      type: 'list_reply',
      id: content.listResponseMessage.singleSelectReply?.selectedRowId || null,
      title: content.listResponseMessage.title || null,
      params: null
    };
  }

  if (content.templateButtonReplyMessage) {
    return {
      type: 'template_button_reply',
      id: content.templateButtonReplyMessage.selectedId || null,
      title: content.templateButtonReplyMessage.selectedDisplayText || null,
      params: null
    };
  }

  const native = content.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (native) {
    const params = safeJson(native.paramsJson);
    return {
      type: 'native_flow',
      id: String(
        params?.id
        || params?.selected_id
        || params?.row_id
        || params?.button_id
        || params?.flow_token
        || native.name
        || ''
      ) || null,
      title: String(params?.title || params?.display_text || params?.label || '') || null,
      params
    };
  }

  return null;
}
