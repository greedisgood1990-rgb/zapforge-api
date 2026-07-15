# Code review 1.2.1

## Scope

This review focused on session initialization, QR and pairing-code connection, reconnect behavior, native-flow delivery and persistence.

## Findings corrected

### Automatic restore

The server restored sessions stored as `qr`, `pairing` or `disconnected` without confirming that the account had ever been linked. A service restart could therefore create another unregistered connection and publish a new QR. Automatic restore now requires linked-session evidence (`phone` or `metadata.registered=true`) and only restores connected/connecting/disconnected linked sessions.

### Pairing restart handoff

Baileys closes the initial socket with `restartRequired` after a successful link. The previous implementation stopped when the local `registered` flag had not yet been updated by `creds.update`. The close handler now treats `restartRequired` as a controlled reconnect signal.

### Pairing throttling after restart

Cooldown, attempt counters and lockout existed only in memory. Restarting the process cleared them. The policy timestamps are now persisted in session metadata. The pairing code and full phone number are not written to metadata.

### State-file writes

Multiple session and audit events could call `writeFile` concurrently. State writes are now queued and use a temporary file followed by atomic rename.

### Baileys retry support

The socket now provides `getMessage` backed by a bounded cache. This supports message retry requests without keeping unlimited history in memory.

### Interactive delivery

Buttons now validate URL, phone, reply IDs and copy values before native-flow construction. Lists now validate total rows and unique IDs and use the same text-fallback behavior as buttons.

## Operational limits

A successful `relayMessage` only confirms acceptance by the connected provider socket. It does not guarantee that every client build will render native-flow controls. Test Android, iOS and Web after Baileys upgrades.

QR and pairing codes are credentials. Their endpoints return `Cache-Control: no-store`.
