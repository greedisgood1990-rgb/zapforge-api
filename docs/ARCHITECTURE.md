# Arquitetura

Zapinho API foi desenhada como um gateway com núcleo independente do motor de mensagens.

```txt
Cliente HTTP
   ↓
Fastify REST API
   ↓
SessionManager ───────────────┐
   ↓                           │
MessagingEngine Adapter        │
   ↓                           │
Baileys                        │
                               │
GatewayEventBus ── WebhookService ── Webhooks externos
                               │
JsonStore ── data/store.json ──┘
```

## Camadas

### 1. Rotas REST

Arquivos em `src/routes`.

Responsáveis por validação inicial, autenticação e tradução de payloads HTTP para comandos do núcleo.

### 2. SessionManager

Arquivo: `src/core/sessionManager.ts`

Responsabilidades:

- criar/iniciar/parar sessões;
- restaurar sessões salvas;
- controlar rate limit por sessão;
- delegar envio ao adapter correto;
- emitir eventos padronizados.

### 3. MessagingEngine

Contrato: `src/adapters/base.ts`

Qualquer motor deve implementar:

- `start()`
- `stop()`
- `logout()`
- `sendText()`
- `sendMedia()`
- `listGroups()`
- `getGroup()`
- listeners de eventos.

### 4. BaileysEngine

Arquivo: `src/adapters/baileys/BaileysEngine.ts`

Motor padrão por ser leve, sem navegador Chromium, e adequado para múltiplas sessões.

### 5. GatewayEventBus

Padroniza eventos internos antes de enviar para webhooks.

Eventos principais:

- `session.updated`
- `message.received`
- `message.sent`

### 6. WebhookService

Entrega eventos via HTTP POST, com assinatura HMAC SHA-256.

### 7. JsonStore

Storage simples para a primeira versão open-source.

Para produção em escala, o roadmap recomenda criar adapters:

- PostgreSQL
- Redis
- S3/MinIO para mídia
- BullMQ para filas

## Por que adapter-first?

Porque o ecossistema muda com frequência. Baileys é rápido e leve; whatsapp-web.js/WPPConnect tendem a cobrir recursos do WhatsApp Web com mais fidelidade visual; Cloud API é oficial, mas depende da Meta e templates. Separar o núcleo do motor permite trocar a implementação sem quebrar a REST API.

## Próximos adapters sugeridos

```txt
src/adapters/wwebjs/WwebjsEngine.ts
src/adapters/wppconnect/WppConnectEngine.ts
src/adapters/cloud/MetaCloudEngine.ts
```

## Escala recomendada

Para muitos números simultâneos:

1. Use Docker com volume persistente.
2. Separe API e workers.
3. Use Redis/BullMQ para fila de envio consentido.
4. Use PostgreSQL para sessões, webhooks e auditoria.
5. Evite reiniciar o container sem necessidade.
6. Configure alertas para estado `disconnected` e `logged_out`.
