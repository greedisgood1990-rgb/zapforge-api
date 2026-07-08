# Webhooks

ZapForge envia webhooks para eventos internos importantes.

## Eventos

| Evento | Quando dispara |
|---|---|
| `session.updated` | estado da sessão mudou |
| `message.received` | uma mensagem chegou |
| `message.sent` | uma mensagem foi enviada pela API |

Use `events: ["*"]` para receber todos.

## Headers

```http
content-type: application/json
x-zapforge-event: message.received
x-zapforge-delivery: <event-id>
x-zapforge-signature: sha256=<assinatura>
```

## Validação da assinatura

Node.js:

```js
import crypto from 'node:crypto';

function isValid(secret, rawBody, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

## Payload base

```json
{
  "id": "delivery-id",
  "event": "message.received",
  "timestamp": "2026-07-08T12:00:00.000Z",
  "sessionId": "default",
  "payload": {}
}
```

## Exemplo: `message.received`

```json
{
  "id": "delivery-id",
  "event": "message.received",
  "timestamp": "2026-07-08T12:00:00.000Z",
  "sessionId": "default",
  "payload": {
    "id": "ABC123",
    "sessionId": "default",
    "from": "5599999999999@s.whatsapp.net",
    "fromMe": false,
    "pushName": "Cliente",
    "type": "conversation",
    "text": "Oi, quero atendimento",
    "timestamp": "2026-07-08T12:00:00.000Z"
  }
}
```

## Boas práticas

- Retorne HTTP 2xx rapidamente.
- Processe tarefas pesadas em fila.
- Valide `x-zapforge-signature`.
- Faça idempotência usando `x-zapforge-delivery`.
- Não confie em payload sem assinatura válida.
