from pathlib import Path
import shutil

path = Path('src/adapters/baileys/BaileysEngine.ts')
text = path.read_text(encoding='utf-8')
old = """    const persistedPolicy = readPersistedPairingPolicy(this.session.metadata);
    const now = Date.now();
    this.pairingAttempts = persistedPolicy.attempts.filter(
      (attemptAt) => now - attemptAt < this.options.pairingCodeWindowMs
    );
"""
new = """    const persistedPolicy = readPersistedPairingPolicy(this.session.metadata);
    const nowMs = Date.now();
    this.pairingAttempts = persistedPolicy.attempts.filter(
      (attemptAt) => nowMs - attemptAt < this.options.pairingCodeWindowMs
    );
"""
if text.count(old) != 1:
    raise RuntimeError('constructor pairing-policy block not found exactly once')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
Path('review-test.log').unlink(missing_ok=True)
shutil.rmtree('.zapforge-review')
print('compile fix applied')
