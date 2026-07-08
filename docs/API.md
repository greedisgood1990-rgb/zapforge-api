# Documentação da API

Base URL local:

```txt
http://localhost:2785
```

Autenticação:

```http
x-api-key: SUA_API_KEY
```

ou:

```http
Authorization: Bearer SUA_API_KEY
```

## Health

### `GET /health`

Resposta:

```json
{
  "ok": true,
  "name": "ZapForge API",
  "version": "1.0.0",
  "uptime": 12.34
}
```

## Sessões

Uma sessão representa um número conectado.

### `POST /v1/sessions`

Cria ou inicia uma sessão.

Body:

```json
{
  "id": "default",
  "engine": "baileys"
}
```

Resposta:

```json
{
  "data": {
    "id": "default",
    "engine": "baileys",
    "state": "qr",
    "qr": "2@....",
    "createdAt": "2026-07-08T12:00:00.000Z",
    "updatedAt": "2026-07-08T12:00:01.000Z"
  }
}
```

Estados possíveis:

| Estado | Significado |
|---|---|
| `created` | sessão registrada |
| `connecting` | tentando conectar |
| `qr` | QR disponível para escanear |
| `connected` | conectada e pronta |
| `disconnected` | desconectada temporariamente |
| `logged_out` | celular saiu da sessão |
| `failed` | falha não recuperável |

### `GET /v1/sessions`

Lista todas as sessões.

### `GET /v1/sessions/:id`

Detalha uma sessão.

### `GET /v1/sessions/:id/qr`

Retorna QR raw e data URL.

Resposta:

```json
{
  "data": {
    "sessionId": "default",
    "qr": "2@....",
    "image": "data:image/png;base64,..."
  }
}
```

### `POST /v1/sessions/:id/stop`

Para a sessão em memória, mantendo os arquivos de autenticação.

### `POST /v1/sessions/:id/logout`

Faz logout do aparelho conectado.

### `DELETE /v1/sessions/:id`

Apaga sessão, metadados e arquivos de autenticação.

## Mensagens

### `POST /v1/messages/text`

Body:

```json
{
  "sessionId": "default",
  "to": "5599999999999",
  "body": "Olá!",
  "no_link_preview": true,
  "typing_time": 1200
}
```

Campos:

| Campo | Tipo | Obrigatório | Observação |
|---|---:|---:|---|
| `sessionId` | string | não | padrão: `default` |
| `to` | string | sim | número, JID ou grupo `@g.us` |
| `body` | string | sim | texto da mensagem |
| `no_link_preview` | boolean | não | desativa preview |
| `typing_time` | number | não | simula digitando por até 10s |

Resposta:

```json
{
  "data": {
    "id": "ABC123",
    "sessionId": "default",
    "to": "5599999999999@s.whatsapp.net",
    "status": "sent",
    "timestamp": "2026-07-08T12:00:00.000Z"
  }
}
```

### Alias compatível: `POST /messages/text`

Aceita o mesmo corpo. Útil para clientes inspirados no padrão Whapi, que usam `/messages/text` com `to` e `body`.

### `POST /v1/messages/media`

Body por URL:

```json
{
  "sessionId": "default",
  "to": "5599999999999",
  "type": "image",
  "url": "https://exemplo.com/image.jpg",
  "caption": "Imagem enviada pela ZapForge"
}
```

Body por base64:

```json
{
  "sessionId": "default",
  "to": "5599999999999",
  "type": "document",
  "base64": "JVBERi0xLjQKJ...",
  "filename": "contrato.pdf",
  "mimetype": "application/pdf"
}
```

Tipos suportados:

- `image`
- `video`
- `audio`
- `document`
- `sticker`

## Grupos

### `GET /v1/sessions/:sessionId/groups`

Lista grupos nos quais a sessão participa.

### `GET /v1/sessions/:sessionId/groups/:groupId`

Retorna metadados de um grupo.

## Webhooks

### `GET /v1/webhooks`

Lista webhooks.

### `POST /v1/webhooks`

Body:

```json
{
  "url": "https://seusite.com/webhook/zapforge",
  "events": ["message.received", "message.sent", "session.updated"],
  "secret": "opcional",
  "active": true
}
```

Se `secret` não for enviado, a API gera um segredo automaticamente.

### `PATCH /v1/webhooks/:id`

Atualiza URL, eventos, segredo ou status.

### `DELETE /v1/webhooks/:id`

Remove webhook.

## Erros

Formato padrão:

```json
{
  "error": "request_error",
  "message": "Session default is not connected."
}
```

Códigos comuns:

| HTTP | Causa |
|---:|---|
| 401 | API key inválida/ausente |
| 404 | sessão/QR/webhook não encontrado |
| 429 | limite global da API excedido |
| 500 | erro interno ou falha do engine |
