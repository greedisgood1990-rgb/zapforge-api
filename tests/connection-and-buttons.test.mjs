import assert from 'node:assert/strict';
import test from 'node:test';
import { BaileysEngine } from '../dist/adapters/baileys/BaileysEngine.js';

const options = {
  id: 'test-session',
  sessionDir: '/tmp/zapforge-test-sessions',
  browserName: 'ZapForge-Test',
  maxMentionParticipants: 10,
  pairingCodeCooldownMs: 60_000,
  pairingCodeWindowMs: 600_000,
  pairingCodeMaxAttempts: 3,
  pairingCodeLockoutMs: 600_000,
  pairingCodeStabilizationMs: 0,
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

  const result = await engine.requestPairingCode('5511999999999');
  const policy = engine.snapshot().metadata.pairingPolicy;

  assert.equal(result.code, '87654321');
  assert.equal(Array.isArray(policy.attempts), true);
  assert.equal(policy.attempts.length, 1);
  assert.equal(JSON.stringify(engine.snapshot().metadata).includes('87654321'), false);
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
