from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# Engine configuration and transport readiness.
replace_once(
    'src/adapters/baileys/BaileysEngine.ts',
    '  pairingCodeStabilizationMs: number;\n  pairingCodeTtlMs: number;',
    '  pairingCodeStabilizationMs: number;\n  pairingCodeReadyTimeoutMs: number;\n  pairingCodeTtlMs: number;'
)

engine_file = Path('src/adapters/baileys/BaileysEngine.ts')
engine_text = engine_file.read_text(encoding='utf-8')
engine_text = engine_text.replace('    const Browsers = baileys.Browsers;\n', '')
engine_file.write_text(engine_text, encoding='utf-8')

replace_once(
    'src/adapters/baileys/BaileysEngine.ts',
    "      browser: Browsers?.ubuntu ? Browsers.ubuntu(this.options.browserName) : undefined,",
    "      // Pairing-code registration is more reliable when the companion identifies as a Chrome Web client.\n      // This matches the browser tuple used by OpenWA's Baileys adapter.\n      browser: [this.options.browserName, 'Chrome', '120.0.0'],"
)

wait_method = '''  private async waitForPairingTransport(): Promise<void> {
    const deadline = Date.now() + this.options.pairingCodeReadyTimeoutMs;

    while (Date.now() < deadline) {
      if (this.session.state === 'connected' || this.registered) {
        throw conflict('This session is already linked. Logout before requesting a new pairing code.', 'session_already_linked');
      }
      if (!this.socket || typeof this.socket.requestPairingCode !== 'function') {
        throw conflict('The session stopped before the pairing transport became ready.', 'session_not_initialized');
      }

      const transport = this.socket?.ws;
      const transportOpen = transport?.isOpen === true || transport?.readyState === 1;
      const registrationReady = Boolean(this.session.qr) || this.session.state === 'qr';
      if (transportOpen || registrationReady) return;

      if (['failed', 'logged_out', 'disconnected'].includes(this.session.state)) {
        throw conflict(
          `Session ${this.session.id} entered state ${this.session.state} before pairing became ready.`,
          'pairing_transport_closed'
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new ApiError(
      'The WhatsApp registration transport did not become ready in time. Check network egress and try again without restarting the session repeatedly.',
      504,
      'pairing_transport_timeout',
      {
        sessionId: this.session.id,
        state: this.session.state,
        timeoutMs: this.options.pairingCodeReadyTimeoutMs
      }
    );
  }

'''
replace_once(
    'src/adapters/baileys/BaileysEngine.ts',
    '  private async generatePairingCode(phone: string): Promise<PairingCodeResult> {\n    const elapsed = Date.now() - this.socketCreatedAt;',
    wait_method + '  private async generatePairingCode(phone: string): Promise<PairingCodeResult> {\n    await this.waitForPairingTransport();\n    const previousQr = this.session.qr || null;\n    const elapsed = Date.now() - this.socketCreatedAt;'
)

replace_once(
    'src/adapters/baileys/BaileysEngine.ts',
    "    } catch (error) {\n      this.pairingModeActive = false;\n      this.update({ state: 'connecting' });\n      if (error instanceof ApiError) throw error;\n      throw new ApiError(\n        `Pairing code generation failed: ${error instanceof Error ? error.message : String(error)}`,\n        502,\n        'pairing_provider_error'\n      );\n    }",
    "    } catch (error) {\n      this.pairingModeActive = false;\n      const providerStatusCode = extractProviderStatusCode(error);\n      const failureMessage = error instanceof Error ? error.message : String(error);\n      this.update({\n        state: previousQr ? 'qr' : 'connecting',\n        qr: previousQr,\n        metadata: {\n          ...this.session.metadata,\n          pairingFailedAt: nowIso(),\n          pairingFailure: failureMessage,\n          pairingFailureStatusCode: providerStatusCode ?? null\n        }\n      });\n      if (error instanceof ApiError) throw error;\n      throw new ApiError(\n        `Pairing code generation failed: ${failureMessage}`,\n        502,\n        'pairing_provider_error',\n        {\n          providerStatusCode: providerStatusCode ?? null,\n          sessionState: this.session.state,\n          qrAvailable: Boolean(previousQr)\n        }\n      );\n    }"
)

replace_once(
    'src/adapters/baileys/BaileysEngine.ts',
    "function normalizePairingPhoneNumber(input: string): string {",
    "function extractProviderStatusCode(error: unknown): number | undefined {\n  const candidate = error as { output?: { statusCode?: unknown }; statusCode?: unknown; data?: { statusCode?: unknown } };\n  const values = [candidate?.output?.statusCode, candidate?.statusCode, candidate?.data?.statusCode];\n  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));\n}\n\nfunction normalizePairingPhoneNumber(input: string): string {"
)

# Configuration wiring.
replace_once(
    'src/config.ts',
    '  PAIRING_CODE_STABILIZATION_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),\n  PAIRING_CODE_TTL_MS:',
    '  PAIRING_CODE_STABILIZATION_MS: z.coerce.number().int().min(0).max(30_000).default(3_000),\n  PAIRING_CODE_READY_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),\n  PAIRING_CODE_TTL_MS:'
)

replace_once(
    'src/core/sessionManager.ts',
    '        pairingCodeStabilizationMs: this.config.PAIRING_CODE_STABILIZATION_MS,\n        pairingCodeTtlMs:',
    '        pairingCodeStabilizationMs: this.config.PAIRING_CODE_STABILIZATION_MS,\n        pairingCodeReadyTimeoutMs: this.config.PAIRING_CODE_READY_TIMEOUT_MS,\n        pairingCodeTtlMs:'
)

replace_once(
    '.env.example',
    'PAIRING_CODE_STABILIZATION_MS=3000\nPAIRING_CODE_TTL_MS=180000',
    'PAIRING_CODE_STABILIZATION_MS=3000\nPAIRING_CODE_READY_TIMEOUT_MS=30000\nPAIRING_CODE_TTL_MS=180000'
)

# Regression tests.
replace_once(
    'tests/connection-and-buttons.test.mjs',
    '  pairingCodeStabilizationMs: 0,\n  pairingCodeTtlMs: 180_000,',
    '  pairingCodeStabilizationMs: 0,\n  pairingCodeReadyTimeoutMs: 1_000,\n  pairingCodeTtlMs: 180_000,'
)

replace_once(
    'tests/connection-and-buttons.test.mjs',
    '  engine.socketCreatedAt = Date.now() - 10_000;\n\n  const first = await engine.requestPairingCode',
    "  engine.socketCreatedAt = Date.now() - 10_000;\n  engine.session.state = 'qr';\n  engine.session.qr = 'qr-ready';\n\n  const first = await engine.requestPairingCode"
)

replace_once(
    'tests/connection-and-buttons.test.mjs',
    "  engine.socket = { requestPairingCode: async () => '87654321' };\n  engine.socketCreatedAt = Date.now() - 10_000;\n\n  const result = await engine.requestPairingCode",
    "  engine.socket = { requestPairingCode: async () => '87654321' };\n  engine.socketCreatedAt = Date.now() - 10_000;\n  engine.session.state = 'qr';\n  engine.session.qr = 'qr-ready';\n\n  const result = await engine.requestPairingCode"
)

test_anchor = "test('reconnects on restartRequired even before creds.update marks the session registered', async () => {"
new_tests = '''test('waits for the registration transport before requesting a pairing code', async () => {
  const engine = new BaileysEngine({ ...options, pairingCodeReadyTimeoutMs: 1_000 });
  let providerCalls = 0;
  engine.socket = {
    requestPairingCode: async () => {
      providerCalls += 1;
      return '11223344';
    }
  };
  engine.socketCreatedAt = Date.now() - 10_000;

  const pending = engine.requestPairingCode('5511999999999');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(providerCalls, 0);

  engine.session.state = 'qr';
  engine.session.qr = 'late-qr';
  const result = await pending;

  assert.equal(result.code, '11223344');
  assert.equal(providerCalls, 1);
  await engine.stop();
});

test('restores the previous QR and reports provider status when pairing fails', async () => {
  const engine = new BaileysEngine(options);
  const providerError = new Error('Connection Failure');
  providerError.output = { statusCode: 408 };
  engine.socket = {
    requestPairingCode: async () => {
      throw providerError;
    }
  };
  engine.socketCreatedAt = Date.now() - 10_000;
  engine.session.state = 'qr';
  engine.session.qr = 'existing-qr';

  await assert.rejects(
    engine.requestPairingCode('5511999999999'),
    (error) => {
      assert.equal(error.code, 'pairing_provider_error');
      assert.equal(error.details.providerStatusCode, 408);
      assert.equal(error.details.qrAvailable, true);
      return true;
    }
  );

  const snapshot = engine.snapshot();
  assert.equal(snapshot.state, 'qr');
  assert.equal(snapshot.qr, 'existing-qr');
  await engine.stop();
});

'''
replace_once('tests/connection-and-buttons.test.mjs', test_anchor, new_tests + test_anchor)

# Developer-facing documentation and console wording.
replace_once(
    'README.md',
    '- three-second socket stabilization before the provider request.',
    '- waits up to 30 seconds for the WhatsApp registration transport to become ready;\n- applies a three-second stabilization interval before the provider request;\n- preserves the current QR as a fallback if the provider rejects pairing-code generation.'
)

replace_once(
    'public/dashboard.html',
    'A API reaproveita um código ainda válido e bloqueia solicitações repetidas. Não recarregue a sessão para tentar gerar outro código.',
    'A API inicia a sessão, aguarda o transporte do WhatsApp ficar pronto e só então solicita o código. Se o provider falhar, o QR atual permanece disponível como alternativa.'
)

replace_once(
    'CHANGELOG.md',
    '# Changelog\n\n',
    '# Changelog\n\n## 1.4.1 — 2026-07-17\n\n### Fixed\n\n- Waits for the WhatsApp registration transport before calling `requestPairingCode`, removing the fixed-delay startup race.\n- Uses an explicit Chrome Web companion identity, matching the working OpenWA Baileys adapter.\n- Restores the previous QR when pairing-code generation fails and exposes the provider status code in the API error details.\n- Added pairing transport readiness and provider-failure regression tests.\n\n'
)

replace_once('package.json', '"version": "1.4.0"', '"version": "1.4.1"')
replace_once('openapi.yaml', '  version: 1.2.1', '  version: 1.4.1')

print('Phone pairing reliability patch applied.')
