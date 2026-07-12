# ZapForge API

> **Forge your own WhatsApp messaging infrastructure.**
>
> API REST open-source e self-hosted com múltiplas sessões, gerenciamento de grupos, menções, mensagens interativas, enquetes, webhooks assinados, Docker e Swagger.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178c6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## O que é

ZapForge API é um gateway independente para integrar aplicações próprias ao WhatsApp por meio de uma API HTTP. O motor padrão utiliza Baileys e roda no seu próprio servidor, sem exigir um gateway SaaS externo.

O projeto foi desenhado para SaaS, CRMs, atendimento, automações internas, comunidades, sistemas de assinatura e integrações com n8n, Laravel, Node.js, Python e outras plataformas.

## Novidades da versão 1.1.0

- Gerenciamento completo de grupos.
- Criação e atualização de grupos.
- Adição e remoção de participantes.
- Promoção e rebaixamento de administradores.
- Links de convite, renovação de convite, entrada e saída.
- Mensagem com menção de todos ou de participantes selecionados.
- Botões de resposta, URL, ligação e cópia.
- Listas interativas.
- Enquetes.
- Evento `message.interaction` para cliques e seleções.
- Eventos de atualização de grupos e participantes.
- Endpoint de capabilities para recursos estáveis e experimentais.
- Validação segura dos IDs de sessão contra path traversal.

## Diferenciais

- **Self-hosted:** VPS, Docker, cloud privada ou bare metal.
- **Multi-sessão:** diversos números na mesma instalação.
- **Grupos como recurso de primeira classe:** participantes, admins, convites e configurações.
- **Webhook-first:** eventos assinados com HMAC SHA-256.
- **API familiar:** endpoints REST simples e alias `/messages/text` inspirado em gateways conhecidos.
- **Swagger embutido:** documentação interativa em `/docs`.
- **Dashboard incluído:** conexão, QR Code, sessões e testes básicos.
- **Responsible mode:** limites por sessão e controles para reduzir abuso.
- **Arquitetura extensível:** pronta para adapters Meta Cloud API e WPPConnect.

## Aviso importante

ZapForge não é oficial nem afiliado à Meta ou ao WhatsApp. O provider Baileys usa o protocolo do WhatsApp Web e pode ser afetado por mudanças externas. Use somente com números e contatos autorizados, respeitando LGPD/GDPR, opt-in, opt-out e os termos aplicáveis.

Recursos marcados como `experimental` podem variar conforme a versão do WhatsApp/Baileys. Consulte:

```http
GET /v1/sessions/:id/capabilities
```

## Instalação rápida

```bash
git clone https://github.com/greedisgood1990-rgb/zapforge-api.git
cd zapforge-api
cp .env.example .env
npm install
npm run build
npm start
```

Modo desenvolvimento:

```bash
npm run dev
```

Acesse:

- Dashboard: `http://localhost:2785/dashboard.html`
- Swagger: `http://localhost:2785/docs`
- Health: `http://localhost:2785/health`

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Os dados persistem em `./data`.

## Criar e conectar uma sessão

```bash
curl -X POST http://localhost:2785/v1/sessions \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{"id":"default","engine":"baileys"}'
```

Obter QR Code:

```bash
curl http://localhost:2785/v1/sessions/default/qr \
  -H "x-api-key: change-this-super-secret-key"
```

## Enviar texto

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

## Mencionar todos em um grupo

```bash
curl -X POST http://localhost:2785/v1/messages/group-mention \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "sessionId":"default",
    "groupId":"120363000000000000@g.us",
    "body":"📢 Atenção, pessoal!",
    "mentionAll":true,
    "appendMentions":true
  }'
```

O retorno contém `mentionedCount`. A API só menciona participantes presentes nos metadados do grupo e respeita `GROUP_MENTION_MAX_PARTICIPANTS`.

## Enviar botões

```bash
curl -X POST http://localhost:2785/v1/messages/buttons \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "sessionId":"default",
    "to":"5599999999999",
    "title":"Atendimento",
    "body":"Escolha uma opção:",
    "footer":"ZapForge API",
    "buttons":[
      {"type":"reply","id":"confirm","text":"Confirmar"},
      {"type":"url","text":"Visitar site","url":"https://example.com"},
      {"type":"copy","text":"Copiar código","value":"ABC-123"}
    ]
  }'
```

## Criar grupo

```bash
curl -X POST http://localhost:2785/v1/sessions/default/groups \
  -H "x-api-key: change-this-super-secret-key" \
  -H "content-type: application/json" \
  -d '{
    "subject":"Clientes VIP",
    "participants":["5511999999999","5511888888888"]
  }'
```

## Principais endpoints

| Método | Rota | Função |
|---|---|---|
| GET | `/health` | Saúde da API |
| GET | `/docs` | Swagger UI |
| POST | `/v1/sessions` | Criar/iniciar sessão |
| GET | `/v1/sessions/:id/qr` | Obter QR Code |
| GET | `/v1/sessions/:id/capabilities` | Recursos do provider |
| POST | `/v1/messages/text` | Enviar texto |
| POST | `/v1/messages/media` | Enviar mídia |
| POST | `/v1/messages/group-mention` | Mencionar todos/selecionados |
| POST | `/v1/messages/buttons` | Botões interativos |
| POST | `/v1/messages/list` | Lista interativa |
| POST | `/v1/messages/poll` | Enquete |
| GET | `/v1/sessions/:sessionId/groups` | Listar grupos |
| POST | `/v1/sessions/:sessionId/groups` | Criar grupo |
| PATCH | `/v1/sessions/:sessionId/groups/:groupId` | Editar grupo/configurações |
| POST | `/v1/sessions/:sessionId/groups/:groupId/participants` | Adicionar/remover participantes |
| POST | `/v1/sessions/:sessionId/groups/:groupId/admins` | Promover/rebaixar admins |
| GET/POST | `/v1/sessions/:sessionId/groups/:groupId/join-requests` | Aprovar/rejeitar entradas |
| GET | `/v1/sessions/:sessionId/groups/:groupId/invite` | Obter convite |
| POST | `/v1/sessions/:sessionId/groups/:groupId/invite/reset` | Renovar convite |
| POST | `/v1/sessions/:sessionId/groups/invite/accept` | Entrar por convite |
| POST | `/v1/sessions/:sessionId/groups/:groupId/leave` | Sair do grupo |
| GET/POST | `/v1/webhooks` | Gerenciar webhooks |

Documentação detalhada: [`docs/API.md`](docs/API.md).

## Webhooks novos

```txt
message.received
message.sent
message.interaction
group.updated
group.participants.updated
session.updated
```

Exemplo de clique:

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

## Variáveis de grupo

```env
GROUP_MENTION_MAX_PARTICIPANTS=1024
GROUP_PARTICIPANT_BATCH_MAX=100
```

## Roadmap

- [x] REST API multi-sessão
- [x] Texto, mídia e QR Code
- [x] Webhooks assinados
- [x] Gestão completa de grupos
- [x] Menção de todos os participantes
- [x] Botões, listas e enquetes
- [ ] Adapter Meta Cloud API oficial
- [ ] PostgreSQL e Redis
- [ ] Fila BullMQ e idempotência
- [ ] SDKs TypeScript, PHP e Python
- [ ] Dashboard React e inbox multiatendente
- [ ] Integrações n8n, Chatwoot e Typebot

## Segurança de produção

1. Troque `API_KEY` antes de iniciar.
2. Use HTTPS com Nginx, Caddy ou Traefik.
3. Nunca publique o diretório `data/`.
4. Restrinja o acesso por firewall quando possível.
5. Utilize segredo forte nos webhooks.
6. Faça backup do volume persistente.
7. Não faça disparos ou menções sem autorização.

## Licença

MIT.

## Disclaimer

WhatsApp é marca da Meta Platforms, Inc. ZapForge API é uma implementação open-source independente e não é afiliada, certificada ou endossada pela Meta.
