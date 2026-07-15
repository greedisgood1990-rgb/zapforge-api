# Changelog

## 1.2.0 — 2026-07-15

### Added

- Phone-number pairing-code endpoint.
- Pairing-code cooldown, cached-code reuse, attempt window and lockout.
- Stable random 9xxx port initializer.
- Interactive text fallback and delivery-mode reporting.
- Connection lifecycle and interactive-message engineering documentation.

### Changed

- Default port changed to 9467.
- Session start is idempotent and may restart an existing stopped engine.
- Registered sessions reconnect with exponential backoff and jitter.
- Unregistered sessions no longer enter automatic QR/pairing reconnect loops.
- Logged-out sessions clear invalid local authentication state.

### Fixed

- Parallel socket initialization.
- Repeated pairing-code provider calls for the same still-valid code.
- Missing native-flow envelope validation and fallback behavior.

## 1.1.0 — 2026-07-12

### Added

- Full group management endpoints.
- Add/remove participants and promote/demote admins.
- Group invite code, reset, accept and leave operations.
- Mention all or selected group participants.
- Native-flow reply, URL, call and copy buttons.
- Interactive lists and polls.
- Provider capabilities endpoint.
- Webhook events for message interactions and group updates.

### Security

- Strict session ID validation.
- Safe session filesystem paths to prevent path traversal.
- Configurable mention and participant batch limits.
