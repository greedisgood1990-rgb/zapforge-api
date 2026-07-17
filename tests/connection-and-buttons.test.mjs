import assert from 'node:assert/strict';
import test from 'node:test';
import { BaileysEngine } from '../dist/adapters/baileys/BaileysEngine.js';

const options = {
  id: 'test-session',
  sessionDir: '/tmp/zapinho-test-sessions',
  browserName: 'Zapinho-Test',
  maxMentionParticipants: 10,
  pairingCodeCooldownMs: 60_000,
  pairingCodeWindowMs: 600_000,
  pairingCodeMaxAttempts: 3,
  pairingCodeLockoutMs: 600_000,
  pairingCodeStabilizationMs: 0,
  pairingCodeReadyTimeoutMs: 1_000,
  pairingCodeTtlMs: 180_000,
  reconnectBaseDelayMs: 5_000,
  reconnectMaxDelayMs: 120_000,
  reconnectMaxAttempts: 6,
  reconnectJitterMs: 0,
  interactiveMessageFallback: true,
  interactiveMaxButtons: 3,
  interactiveMaxListRows: 10,
  messageRetryCacheMax: 50
};

test('reuses a still-valid pairing code without another provider request', async () => {
  const engine = new BaileysEngine(options);
  let providerCalls = 0;
  engine.socket = {
    requestPairingCode: async (phone) => {
      providerCalls += 1;
      assert.equal(phone, '5511999999999');
      return '12345678';
    }
  };
  engine.socketCreatedAt = Date.now() - 10_000;
  engine.session.state = 'qr';
  engine.session.qr = 'qr-ready';

  const first = await engine.requestPairingCode('+55 (11) 99999-9999');
  const second = await engine.requestPairingCode('5511999999999');

  assert.equal(first.formattedCode, '1234-5678');
  assert.equal(second.reused, true);
  assert.equal(providerCalls, 1);
  await engine.stop();
});


test('persists pairing throttling metadata without storing the pairing code', async () => {
  const engine = new BaileysEngine(options);
  engine.socket = { requestPairingCode: async () => '87654321' };
  engine.socketCreatedAt = Date.now() - 10_000;
  engine.session.state = 'qr';
  engine.session.qr = 'qr-ready';

  const result = await engine.requestPairingCode('5511999999999');
  const policy = engine.snapshot().metadata.pairingPolicy;

  assert.equal(result.code, '87654321');
  assert.equal(Array.isArray(policy.attempts), true);
  assert.equal(policy.attempts.length, 1);
  assert.equal(JSON.stringify(engine.snapshot().metadata).includes('87654321'), false);
  await engine.stop();
});

test('waits for the registration transport before requesting a pairing code', async () => {
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

test('reconnects on restartRequired even before creds.update marks the session registered', async () => {
  const engine = new BaileysEngine({ ...options, reconnectBaseDelayMs: 1, reconnectMaxDelayMs: 1 });
  engine.baileys = { DisconnectReason: { loggedOut: 401, restartRequired: 515 } };
  engine.socket = { ev: { removeAllListeners() {} } };
  engine.connectionGeneration = 7;
  let scheduled = false;
  engine.scheduleReconnect = (_status, allowUnregistered) => {
    scheduled = allowUnregistered === true;
  };

  await engine.handleConnectionUpdate(
    { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } },
    7
  );

  assert.equal(scheduled, true);
});

test('uses text fallback for lists when native-flow generation is unavailable', async () => {
  const engine = new BaileysEngine(options);
  engine.session.state = 'connected';
  let fallbackPayload;
  engine.socket = {
    user: { id: '5511000000000@s.whatsapp.net' },
    sendMessage: async (_to, payload) => {
      fallbackPayload = payload;
      return { key: { id: 'list-fallback-1' }, message: payload };
    }
  };
  engine.baileys = {};

  const result = await engine.sendList({
    sessionId: 'test-session',
    to: '5511888888888',
    body: 'Escolha:',
    buttonText: 'Abrir',
    sections: [{
      title: 'Opções',
      rows: [
        { id: 'one', title: 'Primeira' },
        { id: 'two', title: 'Segunda' }
      ]
    }]
  });

  assert.equal(result.deliveryMode, 'text_fallback');
  assert.match(fallbackPayload.text, /Primeira \[one\]/);
  assert.match(fallbackPayload.text, /Segunda \[two\]/);
  await engine.stop();
});

test('uses text fallback when native-flow generation is unavailable', async () => {
  const engine = new BaileysEngine(options);
  engine.session.state = 'connected';
  let fallbackPayload;
  engine.socket = {
    user: { id: '5511000000000@s.whatsapp.net' },
    sendMessage: async (_to, payload) => {
      fallbackPayload = payload;
      return { key: { id: 'fallback-1' } };
    }
  };
  engine.baileys = {};

  const result = await engine.sendButtons({
    sessionId: 'test-session',
    to: '5511888888888',
    body: 'Confirma?',
    buttons: [
      { type: 'reply', id: 'yes', text: 'Sim' },
      { type: 'reply', id: 'no', text: 'Não' }
    ]
  });

  assert.equal(result.deliveryMode, 'text_fallback');
  assert.match(fallbackPayload.text, /1\. Sim \[yes\]/);
  assert.match(fallbackPayload.text, /2\. Não \[no\]/);
  await engine.stop();
});
