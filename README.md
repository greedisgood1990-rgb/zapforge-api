# Zapinho API

Zapinho API is a self-hosted HTTP gateway for WhatsApp Web sessions. It provides session management, QR and phone-number pairing, message delivery, group administration, interactive messages, webhooks, Docker packaging and an OpenAPI interface.

The default provider is [Baileys](https://github.com/WhiskeySockets/Baileys). Zapinho is not affiliated with Meta or WhatsApp.

## Runtime requirements

- Node.js 20.10 or newer
- Git, required by some Baileys dependency resolutions
- Docker and Docker Compose, optional
- A persistent writable directory for `data/`

## Initial configuration

Generate a local `.env` with a free port between `9000` and `9999`:

```bash
git clone https://github.com/greedisgood1990-rgb/zapinho-api.git
cd zapinho-api
bash scripts/init-env.sh
```

The selected port is written once and remains stable across restarts. When the initializer is not used, the default port is `9467`.

Run with Docker:

```bash
docker compose up -d --build
```

Run with Node.js:

```bash
npm install
npm run build
npm start
```

Read the selected port from `.env`, then open:

```text
http://localhost:<PORT>/dashboard.html
http://localhost:<PORT>/docs
http://localhost:<PORT>/health
```

## Authentication

Protected endpoints accept either header:

```http
x-api-key: <API_KEY>
```

or:

```http
Authorization: Bearer <API_KEY>
```

Do not expose the default key from `.env.example`.

## Create a session

```bash
curl -X POST http://localhost:9467/v1/sessions \
  -H 'x-api-key: zf_live_example' \
  -H 'content-type: application/json' \
  -d '{"id":"sales-main","engine":"baileys"}'
```

Session identifiers must match:

```text
^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$
```

## Connect by QR Code

Start the session once and poll the QR endpoint without restarting the session:

```bash
curl http://localhost:9467/v1/sessions/sales-main/qr \
  -H 'x-api-key: zf_live_example'
```

The response includes the raw QR reference and a PNG data URL.

## Connect by phone-number pairing code

```bash
curl -X POST http://localhost:9467/v1/sessions/sales-main/pairing-code \
  -H 'x-api-key: zf_live_example' \
  -H 'content-type: application/json' \
  -d '{"phoneNumber":"5511999999999"}'
```

The phone number must include the country code. Formatting characters are accepted by the API and removed before the provider call.

Pairing requests are controlled per session:

- one request at a time;
- an unexpired code is returned again instead of requesting a new code;
- 60-second cooldown between new codes;
- maximum of three new codes in ten minutes;
- ten-minute lockout after the limit;
- three-second socket stabilization before the provider request.

These controls prevent connection loops and accidental repeated device-link operations. They do not guarantee protection against account restrictions. Operators remain responsible for complying with WhatsApp terms and acceptable-use requirements.

## Connection recovery

Registered sessions reconnect with exponential backoff and jitter. The default sequence begins near 5 seconds and increases up to 2 minutes. Unregistered sessions do not automatically reconnect after the socket closes; a new explicit start is required.

See [docs/CONNECTION_LIFECYCLE.md](docs/CONNECTION_LIFECYCLE.md).

## Send text

```bash
curl -X POST http://localhost:9467/v1/messages/text \
  -H 'x-api-key: zf_live_example' \
  -H 'content-type: application/json' \
  -d '{
    "sessionId":"sales-main",
    "to":"5511999999999",
    "body":"Pedido confirmado."
  }'
```

## Send interactive buttons

```bash
curl -X POST http://localhost:9467/v1/messages/buttons \
  -H 'x-api-key: zf_live_example' \
  -H 'content-type: application/json' \
  -d '{
    "sessionId":"sales-main",
    "to":"5511999999999",
    "title":"Atendimento",
    "body":"Confirma o atendimento?",
    "footer":"Equipe comercial",
    "buttons":[
      {"type":"reply","id":"confirm","text":"Confirmar"},
      {"type":"reply","id":"cancel","text":"Cancelar"}
    ]
  }'
```

Baileys native-flow messages depend on the current WhatsApp Web protocol. Zapinho validates the message envelope and, by default, sends a readable text fallback if the native relay throws an error. Inspect `deliveryMode` in the response:

```text
native_flow
text_fallback
```

Set `disableFallback: true` for strict native-flow behavior. See [docs/INTERACTIVE_MESSAGES.md](docs/INTERACTIVE_MESSAGES.md).

## Group operations

Supported group operations include:

- list, create and inspect groups;
- update subject, description and permissions;
- add and remove participants;
- promote and demote administrators;
- inspect and process join requests;
- create, revoke and accept invite codes;
- leave a group;
- mention all or selected participants.

Example:

```bash
curl -X POST http://localhost:9467/v1/messages/group-mention \
  -H 'x-api-key: zf_live_example' \
  -H 'content-type: application/json' \
  -d '{
    "sessionId":"sales-main",
    "groupId":"120363000000000000@g.us",
    "body":"Atualização disponível.",
    "mentionAll":true
  }'
```

## Capabilities

Provider-specific support is available at:

```http
GET /v1/sessions/:id/capabilities
```

Interactive buttons and lists are marked experimental because WhatsApp Web protocol changes may affect them independently of the Zapinho release cycle.

## Webhook events

```text
session.updated
message.received
message.sent
message.interaction
group.updated
group.participants.updated
```

Webhook payloads are signed with HMAC SHA-256 in `x-zapinho-signature`.

## Configuration reference

Connection controls:

```env
PAIRING_CODE_COOLDOWN_MS=60000
PAIRING_CODE_WINDOW_MS=600000
PAIRING_CODE_MAX_ATTEMPTS=3
PAIRING_CODE_LOCKOUT_MS=600000
PAIRING_CODE_STABILIZATION_MS=3000
PAIRING_CODE_TTL_MS=180000
RECONNECT_BASE_DELAY_MS=5000
RECONNECT_MAX_DELAY_MS=120000
RECONNECT_MAX_ATTEMPTS=6
RECONNECT_JITTER_MS=3000
```

Interactive controls:

```env
INTERACTIVE_MESSAGE_FALLBACK=true
INTERACTIVE_MAX_BUTTONS=3
```

## Project structure

```text
src/adapters/       provider implementations
src/core/           session, policy, event and webhook services
src/routes/         HTTP endpoints
src/storage/        persistence adapters
public/             operational console
docs/               engineering documentation
scripts/            setup and deployment utilities
```

## Production notes

- Put the API behind HTTPS and a reverse proxy.
- Restrict access to the dashboard and Swagger in public deployments.
- Back up `data/`; it contains session credentials.
- Do not run multiple Zapinho processes against the same session directory.
- Keep Baileys and Zapinho versions pinned and test upgrades with a separate WhatsApp account.
- Treat interactive messages as protocol-dependent until validated against the target client versions.

## License

MIT. WhatsApp is a trademark of Meta Platforms, Inc. Zapinho is an independent project and is not endorsed by Meta.
