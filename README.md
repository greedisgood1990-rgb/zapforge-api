# ZapForge API

> **A API open-source para quem quer controlar sua própria infraestrutura de mensagens.**
>
> Multi-sessão, REST API, webhooks assinados, Docker, dashboard simples, Swagger e motor Baileys por padrão — sem depender de gateway SaaS externo.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178c6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

## Nome e posicionamento

**ZapForge API** vem de “forjar sua própria API”: uma base self-hosted, extensível e pronta para virar o núcleo de produtos SaaS, CRMs, bots de atendimento, funis conversacionais e integrações internas.

**Tagline para o GitHub:**

> Forge your own messaging cloud — open-source, self-hosted, multi-session and webhook-first.

**Descrição curta para o repositório:**

> Self-hosted open-source messaging gateway with multi-session REST API, Baileys engine, signed webhooks, Docker, Swagger and a clean dashboard.

## Por que esse projeto existe?

Projetos como OpenWA, Evolution API, WPPConnect Server, MyZap, Baileys e whatsapp-web.js provaram que existe demanda enorme por gateways self-hosted. O objetivo do ZapForge não é copiar esses projetos, e sim entregar uma base própria, simples de publicar, com arquitetura limpa e documentação forte para crescer como open-source.

## Diferenciais

- **Servidor próprio:** roda em VPS, Docker, cloud privada ou bare metal.
- **Sem API SaaS obrigatória:** usa motor local baseado em WhatsApp Web via Baileys.
- **Multi-sessão:** vários números/sessões na mesma API.
- **Endpoints familiares:** `/v1/messages/text` e alias compatível `/messages/text` no estilo Whapi.
- **Webhooks assinados com HMAC:** eventos enviados com `x-zapforge-signature`.
- **Dashboard embutido:** conectar sessão, ver QR, enviar teste e cadastrar webhooks.
- **Swagger automático:** documentação interativa em `/docs`.
- **Rate limit responsável:** controle por API e por sessão.
- **Arquitetura de adapters:** hoje Baileys; pronto para adicionar WPPConnect/whatsapp-web.js/Cloud API depois.

## Aviso importante

Este projeto **não é oficial da Meta/WhatsApp**. Use apenas com números, contatos e grupos nos quais você tenha autorização. Respeite termos de serviço, privacidade, LGPD/GDPR, opt-in, opt-out e limites razoáveis de envio. O projeto não foi desenhado para spam.

## Stack

- Node.js 20+
- TypeScript
- Fastify
- Baileys
- Docker / Docker Compose
- JSON storage local por padrão
- Webhooks HMAC SHA-256

## Instalação rápida

```bash
git clone https://github.com/SEU-USUARIO/zapforge-api.git
cd zapforge-api
cp .env.example .env
npm install
npm run dev
```

Abra:

- Dashboard: `http://localhost:2785/dashboard.html`
- Swagger: `http://localhost:2785/docs`
- Health: `http://localhost:2785/health`

## Rodando com Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Os dados persistem em `./data`.

## Primeiro envio

### 1. Criar sessão

```bash
curl -X POST http://localhost:2785/v1/sessions \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"id":"default","engine":"baileys"}'
```

### 2. Obter QR Code

```bash
curl http://localhost:2785/v1/sessions/default/qr \
  -H "x-api-key: change-this-super-secret-key"
```

Escaneie o QR pelo celular. Depois confirme o estado:

```bash
curl http://localhost:2785/v1/sessions/default \
  -H "x-api-key: change-this-super-secret-key"
```

### 3. Enviar texto

```bash
curl -X POST http://localhost:2785/v1/messages/text \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "sessionId":"default",
    "to":"5599999999999",
    "body":"Olá! Mensagem enviada pela ZapForge API."
  }'
```

Alias compatível:

```bash
curl -X POST http://localhost:2785/messages/text \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"sessionId":"default","to":"5599999999999","body":"Teste"}'
```

## Webhooks

Cadastrar webhook:

```bash
curl -X POST http://localhost:2785/v1/webhooks \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "url":"https://seusite.com/webhook/zapforge",
    "events":["message.received","message.sent","session.updated"]
  }'
```

Evento enviado:

```json
{
  "id": "delivery-id",
  "event": "message.received",
  "timestamp": "2026-07-08T14:30:00.000Z",
  "sessionId": "default",
  "payload": {
    "id": "message-id",
    "from": "5599999999999@s.whatsapp.net",
    "text": "Oi",
    "type": "conversation"
  }
}
```

Headers:

```txt
x-zapforge-event: message.received
x-zapforge-delivery: <event-id>
x-zapforge-signature: sha256=<hmac>
```

## Endpoints principais

| Método | Rota | Função |
|---|---|---|
| GET | `/health` | Status da API |
| GET | `/docs` | Swagger UI |
| POST | `/v1/sessions` | Criar/iniciar sessão |
| GET | `/v1/sessions` | Listar sessões |
| GET | `/v1/sessions/:id` | Ver sessão |
| GET | `/v1/sessions/:id/qr` | Obter QR Code |
| POST | `/v1/sessions/:id/stop` | Pausar sessão |
| POST | `/v1/sessions/:id/logout` | Desconectar do aparelho |
| DELETE | `/v1/sessions/:id` | Apagar sessão e auth files |
| POST | `/v1/messages/text` | Enviar texto |
| POST | `/v1/messages/media` | Enviar mídia por URL/base64 |
| GET | `/v1/sessions/:sessionId/groups` | Listar grupos |
| GET | `/v1/sessions/:sessionId/groups/:groupId` | Metadados do grupo |
| GET | `/v1/webhooks` | Listar webhooks |
| POST | `/v1/webhooks` | Criar webhook |
| PATCH | `/v1/webhooks/:id` | Atualizar webhook |
| DELETE | `/v1/webhooks/:id` | Remover webhook |

## Roadmap viral para GitHub

- [x] REST API multi-sessão
- [x] QR Code via endpoint e dashboard
- [x] Envio de texto
- [x] Envio de mídia por URL/base64
- [x] Webhooks assinados
- [x] Swagger UI
- [x] Docker Compose
- [ ] Adapter whatsapp-web.js
- [ ] Adapter WPPConnect
- [ ] Adapter Meta Cloud API
- [ ] Redis/PostgreSQL storage
- [ ] Painel React completo
- [ ] SDK TypeScript/PHP/Python
- [ ] Fila BullMQ para envios opt-in
- [ ] Inbox multiatendente
- [ ] Fluxos visuais com nós
- [ ] Integrações n8n, Chatwoot, Typebot e Dify

## Estrutura

```txt
zapforge-api/
├─ src/
│  ├─ adapters/        # motores de comunicação
│  ├─ core/            # sessão, eventos, webhooks e políticas
│  ├─ plugins/         # auth e erros
│  ├─ routes/          # endpoints REST
│  ├─ storage/         # storage local JSON
│  └─ utils/
├─ public/             # dashboard mínimo
├─ docs/               # documentação detalhada
├─ examples/           # exemplos curl/postman
├─ openapi.yaml        # spec base para publicação
├─ Dockerfile
└─ docker-compose.yml
```

## Segurança recomendada para produção

1. Troque `API_KEY` no `.env`.
2. Use HTTPS com Nginx/Caddy/Traefik.
3. Não exponha `./data` publicamente.
4. Restrinja IPs por firewall.
5. Use webhooks com segredo forte.
6. Ative logs e backups do volume `data`.
7. Não envie mensagens para contatos sem consentimento.

## Licença

MIT.

## Disclaimer

ZapForge API é uma implementação open-source independente. WhatsApp é marca da Meta Platforms, Inc. Este projeto não é afiliado, endossado ou certificado pela Meta.
