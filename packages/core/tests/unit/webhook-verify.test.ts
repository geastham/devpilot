import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyLinearWebhookSignature } from '../../src/integrations/linear/webhook-verify';

describe('verifyLinearWebhookSignature', () => {
  const secret = 'test-webhook-secret';
  const payload = JSON.stringify({ test: 'data' });

  function createValidSignature(payload: string, secret: string): string {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hash}`;
  }

  it('should return valid for correct signature', () => {
    const signature = createValidSignature(payload, secret);
    const result = verifyLinearWebhookSignature(payload, signature, secret);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return invalid for wrong signature', () => {
    const result = verifyLinearWebhookSignature(payload, 'sha256=wronghash', secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return invalid for missing sha256 prefix', () => {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');
    const result = verifyLinearWebhookSignature(payload, hash, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid signature format');
  });

  it('should return invalid for empty payload', () => {
    const result = verifyLinearWebhookSignature('', 'sha256=hash', secret);
    expect(result.valid).toBe(false);
  });

  it('should return invalid for empty signature', () => {
    const result = verifyLinearWebhookSignature(payload, '', secret);
    expect(result.valid).toBe(false);
  });
});
