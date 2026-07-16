# Zapinho API v1.2.0

Base local:

```txt
http://localhost:9467
```

Autenticação:

```http
x-api-key: SUA_API_KEY
```

ou:

```http
Authorization: Bearer SUA_API_KEY
```

## Sessões

### `POST /v1/sessions`

```json
{
  "id": "default",
  "engine": "baileys"
}
```

O ID aceita 2 a 64 caracteres: letras, números, `_` e `-`.

### `POST /v1/sessions/:id/pairing-code`

```json
{
  "phoneNumber": "5511999999999"
}
```

O endpoint inicia a sessão quando necessário e retorna `code`, `formattedCode`, `expiresAt`, `nextAllowedAt` e `reused`.

Solicitações repetidas para o mesmo número reutilizam o código ainda válido. Novas solicitações estão sujeitas a cooldown, limite por janela e lockout. Respostas limitadas usam HTTP 429 e o header `Retry-After`.

### `GET /v1/sessions/:id/capabilities`

Informa quais recursos estão disponíveis e quais são experimentais.

```json
{
  "data": {
    "provider": "baileys",
    "capabilities": {
      "messages.groupMention": true,
      "messages.replyButtons": "experimental",
      "messages.polls": true,
      "groups.participants": true
    }
  }
}
```

Outras rotas:

- `GET /v1/sessions`
- `GET /v1/sessions/:id`
- `GET /v1/sessions/:id/qr`
- `POST /v1/sessions/:id/start`
- `POST /v1/sessions/:id/stop`
- `POST /v1/sessions/:id/logout`
- `DELETE /v1/sessions/:id`

## Mensagens

### Texto — `POST /v1/messages/text`

```json
{
  "sessionId": "default",
  "to": "5511999999999",
  "body": "Olá!",
  "no_link_preview": true,
  "typing_time": 1200
}
```

### Mídia — `POST /v1/messages/media`

```json
{
  "sessionId": "default",
  "to": "5511999999999",
  "type": "image",
  "url": "https://example.com/image.jpg",
  "caption": "Imagem"
}
```

Tipos: `image`, `video`, `audio`, `document`, `sticker`.

### Mencionar todos — `POST /v1/messages/group-mention`

```json
{
  "sessionId": "default",
  "groupId": "120363000000000000@g.us",
  "body": "Atenção, grupo!",
  "mentionAll": true,
  "appendMentions": true,
  "includeAdmins": true
}
```

Mencionar apenas pessoas selecionadas:

```json
{
  "sessionId": "default",
  "groupId": "120363000000000000@g.us",
  "body": "Precisamos da confirmação de vocês.",
  "mentionAll": false,
  "mentions": ["5511999999999", "5511888888888"]
}
```

- `appendMentions=true` inclui visualmente `@numero` no texto.
- Números que não pertencem ao grupo são ignorados.
- O limite é configurado por `GROUP_MENTION_MAX_PARTICIPANTS`.

### Botões — `POST /v1/messages/buttons`

```json
{
  "sessionId": "default",
  "to": "5511999999999",
  "title": "Pedido #123",
  "body": "Como deseja continuar?",
  "footer": "Zapinho",
  "buttons": [
    {"type": "reply", "id": "confirm", "text": "Confirmar"},
    {"type": "url", "text": "Abrir pedido", "url": "https://example.com/orders/123"},
    {"type": "call", "text": "Ligar", "phone": "+5511999999999"},
    {"type": "copy", "text": "Copiar PIX", "value": "000201..."}
  ]
}
```

Tipos:

- `reply`: requer `id`.
- `url`: requer `url`.
- `call`: requer `phone`.
- `copy`: requer `value`.

Os botões native-flow são experimentais no provider Baileys. Por padrão, falhas de geração ou relay produzem uma mensagem textual equivalente. O retorno informa `deliveryMode` como `native_flow` ou `text_fallback`. Use `disableFallback=true` para desativar o fallback por requisição.

### Lista — `POST /v1/messages/list`

```json
{
  "sessionId": "default",
  "to": "5511999999999",
  "title": "Produtos",
  "body": "Escolha um produto:",
  "buttonText": "Ver produtos",
  "sections": [
    {
      "title": "Planos",
      "rows": [
        {"id": "basic", "title": "Básico", "description": "Até 1.000 mensagens"},
        {"id": "pro", "title": "Pro", "description": "Até 10.000 mensagens"}
      ]
    }
  ]
}
```

### Enquete — `POST /v1/messages/poll`

```json
{
  "sessionId": "default",
  "to": "120363000000000000@g.us",
  "question": "Qual horário é melhor?",
  "options": ["09:00", "14:00", "18:00"],
  "selectableCount": 1
}
```

## Grupos

### Listar — `GET /v1/sessions/:sessionId/groups`

### Consultar — `GET /v1/sessions/:sessionId/groups/:groupId`

Retorna metadados e participantes.

### Criar — `POST /v1/sessions/:sessionId/groups`

```json
{
  "subject": "Clientes VIP",
  "participants": ["5511999999999", "5511888888888"]
}
```

### Editar — `PATCH /v1/sessions/:sessionId/groups/:groupId`

```json
{
  "subject": "Novo nome",
  "description": "Descrição atualizada",
  "settings": {
    "announce": true,
    "locked": true,
    "ephemeralDuration": 86400,
    "memberAddMode": "admin_add",
    "joinApprovalMode": true
  }
}
```

- `announce=true`: somente administradores enviam mensagens.
- `locked=true`: somente administradores alteram dados do grupo.
- `ephemeralDuration`: duração das mensagens temporárias em segundos; `0` desativa.
- `memberAddMode=admin_add`: somente administradores adicionam membros.
- `memberAddMode=all_member_add`: qualquer participante pode adicionar membros.
- `joinApprovalMode=true`: novos participantes por link ficam pendentes para aprovação.

### Participantes — `POST /v1/sessions/:sessionId/groups/:groupId/participants`

```json
{
  "participants": ["5511999999999"],
  "action": "add"
}
```

Ações: `add`, `remove`.

### Administradores — `POST /v1/sessions/:sessionId/groups/:groupId/admins`

```json
{
  "participants": ["5511999999999"],
  "action": "promote"
}
```

Ações: `promote`, `demote`.

### Solicitações de entrada

Listar pendentes:

```http
GET /v1/sessions/:sessionId/groups/:groupId/join-requests
```

Aprovar ou rejeitar:

```http
POST /v1/sessions/:sessionId/groups/:groupId/join-requests
```

```json
{
  "participants": ["5511999999999"],
  "action": "approve"
}
```

Ações: `approve`, `reject`.

### Convite

- `GET /v1/sessions/:sessionId/groups/:groupId/invite`
- `POST /v1/sessions/:sessionId/groups/:groupId/invite/reset`
- `POST /v1/sessions/:sessionId/groups/invite/accept`

Entrar pelo convite:

```json
{
  "code": "https://chat.whatsapp.com/CODIGO"
}
```

### Sair — `POST /v1/sessions/:sessionId/groups/:groupId/leave`

## Webhooks

Eventos disponíveis:

```txt
session.updated
message.received
message.sent
message.interaction
group.updated
group.participants.updated
```

### Evento de interação

```json
{
  "id": "delivery-id",
  "event": "message.interaction",
  "timestamp": "2026-07-12T20:00:00.000Z",
  "sessionId": "default",
  "payload": {
    "id": "message-id",
    "from": "5511999999999@s.whatsapp.net",
    "interaction": {
      "type": "native_flow",
      "id": "confirm",
      "title": "Confirmar",
      "params": {"id": "confirm", "display_text": "Confirmar"}
    }
  }
}
```

### Evento de participantes

```json
{
  "event": "group.participants.updated",
  "sessionId": "default",
  "payload": {
    "id": "120363000000000000@g.us",
    "action": "add",
    "participants": ["5511999999999@s.whatsapp.net"]
  }
}
```

## Erros

```json
{
  "error": "request_error",
  "message": "Session default is not connected."
}
```

| HTTP | Causa |
|---:|---|
| 400 | payload inválido |
| 401 | API key inválida |
| 404 | sessão, grupo ou QR não encontrado |
| 429 | limite excedido |
| 500 | falha interna/provider |
