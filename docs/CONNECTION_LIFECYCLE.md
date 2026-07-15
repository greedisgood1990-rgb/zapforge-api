# Session connection lifecycle

## States

| State | Meaning |
|---|---|
| `created` | Session record exists but no socket has been initialized. |
| `connecting` | The Baileys socket is being initialized. |
| `qr` | An unregistered socket has published a QR reference. |
| `pairing` | A phone-number pairing request is active or a code was returned. |
| `connected` | The linked device connection is open. |
| `disconnected` | The socket is closed and no connection is currently active. |
| `logged_out` | WhatsApp invalidated or explicitly removed the linked-device credentials. |
| `failed` | Automatic recovery exhausted the configured retry budget. |

## Concurrency control

`start()` is idempotent for a running session. A single in-flight promise owns socket initialization. Repeated start requests do not create parallel WebSocket connections.

Each socket is assigned a local generation number. Events received from an older socket are ignored after a replacement socket has been created.

Before a replacement socket is opened, ZapForge removes listeners from the previous socket and closes it. This prevents reconnect attempts from accumulating listeners or triggering a second reconnect from a stale close event.

## QR mode

The socket publishes QR references through `connection.update`. ZapForge stores the latest distinct reference. Calling `GET /v1/sessions/:id/qr` only reads the current reference; it does not restart the session or request a new QR.

When an unregistered socket closes, ZapForge does not reconnect automatically. This prevents an unattended QR generation loop. Call `POST /v1/sessions/:id/start` when another explicit attempt is required.

## Pairing-code mode

Endpoint:

```http
POST /v1/sessions/:id/pairing-code
```

The route starts the session if necessary and waits for the configured socket stabilization interval before calling Baileys `requestPairingCode`.

The number is normalized to digits and must contain 8 to 15 digits, including the country code.

Controls are maintained in memory per session:

1. Only one provider request may run at a time.
2. A still-valid code for the same number is returned with `reused: true`.
3. New provider requests are separated by `PAIRING_CODE_COOLDOWN_MS`.
4. Attempts are counted inside `PAIRING_CODE_WINDOW_MS`.
5. Reaching `PAIRING_CODE_MAX_ATTEMPTS` activates `PAIRING_CODE_LOCKOUT_MS`.
6. Rate-limited responses use HTTP 429 and include `Retry-After`.

The API does not persist the pairing code to disk or audit logs. Audit entries store only the masked phone suffix.

`PAIRING_CODE_TTL_MS` is a local presentation TTL used to decide whether the API may safely return the same code again. The provider may invalidate a code earlier.

## Registered-session recovery

A registered session that closes unexpectedly is recovered with exponential backoff:

```text
delay = min(maxDelay, baseDelay × 2^(attempt-1)) + randomJitter
```

Defaults:

```env
RECONNECT_BASE_DELAY_MS=5000
RECONNECT_MAX_DELAY_MS=120000
RECONNECT_MAX_ATTEMPTS=6
RECONNECT_JITTER_MS=3000
```

Successful connection resets the retry counter. Explicit stop and logout cancel pending timers.

## Logout handling

A terminal `loggedOut` disconnect removes the on-disk authentication state. Keeping invalid credentials would cause subsequent starts to reload stale keys and fail to publish a fresh QR or pairing flow.

## Operational recommendations

- Do not repeatedly delete and recreate the same session while diagnosing connectivity.
- Inspect `session.updated` metadata for `reconnectAttempt`, `reconnectAt`, `disconnectStatusCode` and `failureReason`.
- Use a dedicated test account when upgrading Baileys.
- Run one process per session directory.
- Do not interpret cooldowns as protection against WhatsApp enforcement. They are safeguards against accidental connection storms.
