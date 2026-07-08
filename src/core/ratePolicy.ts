export class PerSessionRatePolicy {
  private buckets = new Map<string, number[]>();

  constructor(private maxPerMinute: number) {}

  assertAllowed(sessionId: string): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    const bucket = (this.buckets.get(sessionId) || []).filter((ts) => ts >= windowStart);

    if (bucket.length >= this.maxPerMinute) {
      throw new Error(`Rate limit exceeded for session ${sessionId}. Reduce message frequency or increase MAX_MESSAGES_PER_MINUTE_PER_SESSION responsibly.`);
    }

    bucket.push(now);
    this.buckets.set(sessionId, bucket);
  }
}
