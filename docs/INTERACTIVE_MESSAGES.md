# Interactive messages

## Scope

The Baileys adapter sends buttons and lists through WhatsApp native-flow message envelopes. This protocol is not a stable public API and can change independently of ZapForge.

The implementation therefore separates message construction from delivery fallback and reports the selected mode in every response.

## Buttons endpoint

```http
POST /v1/messages/buttons
```

Supported button types:

| Type | Required fields | Native-flow name |
|---|---|---|
| `reply` | `id`, `text` | `quick_reply` |
| `url` | `url`, `text` | `cta_url` |
| `call` | `phone`, `text` | `cta_call` |
| `copy` | `value`, `text` | `cta_copy` |

The default limit is three buttons. Configure it with `INTERACTIVE_MAX_BUTTONS`, up to ten. Lower limits are recommended because client behavior is more consistent with compact button sets.

Reply IDs must be unique within the message.

## Native-flow envelope

ZapForge builds an `InteractiveMessage` with:

- body;
- optional header title;
- optional footer;
- `NativeFlowMessage.buttons`;
- an empty `messageParamsJson` object;
- linked-device context metadata;
- the current socket user JID during message generation.

The generated envelope is validated before `relayMessage` is called.

## Fallback behavior

When native generation or relay throws an error and `INTERACTIVE_MESSAGE_FALLBACK=true`, the adapter sends a plain text message containing the same choices.

Response examples:

```json
{
  "deliveryMode": "native_flow",
  "warnings": []
}
```

```json
{
  "deliveryMode": "text_fallback",
  "warnings": [
    "Native-flow relay failed; a text fallback was sent instead: ..."
  ]
}
```

Per request, fallback may be disabled:

```json
{
  "disableFallback": true
}
```

A custom fallback body may be provided:

```json
{
  "fallbackText": "Reply 1 to confirm or 2 to cancel."
}
```

Fallback occurs only when message generation or relay reports an error. A successful relay does not prove that every WhatsApp client version rendered the button. End-to-end testing with the target clients remains necessary.

## Interaction events

Responses are emitted as `message.interaction` when the incoming message contains one of:

- button reply;
- list reply;
- template button reply;
- native-flow response.

The normalized interaction contains `type`, `id`, `title` and parsed `params` when available.

## Testing procedure

1. Link a dedicated test session.
2. Send a two-button reply message to an individual contact.
3. Confirm `deliveryMode=native_flow`.
4. Test on Android, iOS and WhatsApp Web where relevant.
5. Select each button and confirm a `message.interaction` webhook.
6. Temporarily break native generation in a development environment and verify `text_fallback`.
7. Repeat after every Baileys upgrade.
