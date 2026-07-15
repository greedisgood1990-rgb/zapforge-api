# Webhooks

O ZapForge envia eventos HTTP POST assinados com HMAC SHA-256.

## Eventos

- `session.updated`
- `message.received`
- `message.sent`
- `message.interaction`
- `group.updated`
- `group.participants.updated`

## Headers

```txt
x-zapforge-event: message.interaction
x-zapforge-delivery: delivery-id
x-zapforge-signature: sha256=<hmac>
```

## Assinatura

A assinatura é calculada sobre o corpo JSON bruto:

```txt
HMAC_SHA256(webhook_secret, raw_body)
```

## Cadastrar

```bash
curl -X POST http://localhost:9467/v1/webhooks \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "url":"https://example.com/webhooks/zapforge",
    "events":["message.interaction","group.participants.updated"]
  }'
```

## Interação

```json
{
  "event": "message.interaction",
  "sessionId": "default",
  "payload": {
    "from": "5511999999999@s.whatsapp.net",
    "interaction": {
      "type": "native_flow",
      "id": "confirm",
      "title": "Confirmar"
    }
  }
}
```

## Participantes

```json
{
  "event": "group.participants.updated",
  "sessionId": "default",
  "payload": {
    "id": "120363000000000000@g.us",
    "action": "promote",
    "participants": ["5511999999999@s.whatsapp.net"]
  }
}
```
