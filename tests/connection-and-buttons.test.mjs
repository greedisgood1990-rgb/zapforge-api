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
  interactiveMaxButtons: 3
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
