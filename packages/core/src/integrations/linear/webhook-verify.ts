import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the signature of a Linear webhook payload
 *
 * @param payload - The raw webhook payload as a string
 * @param signature - The signature from the 'linear-signature' header (format: "sha256=<hash>")
 * @param secret - The webhook secret from Linear
 * @returns Object with validation result and optional error message
 *
 * @example
 * ```typescript
 * const result = verifyLinearWebhookSignature(
 *   JSON.stringify(webhookBody),
 *   req.headers['linear-signature'],
 *   process.env.LINEAR_WEBHOOK_SECRET
 * );
 *
 * if (!result.valid) {
 *   console.error('Webhook verification failed:', result.error);
 * }
 * ```
 */
export function verifyLinearWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): { valid: boolean; error?: string } {
  // Validate inputs
  if (!payload) {
    return { valid: false, error: 'Payload is required' };
  }

  if (!signature) {
    return { valid: false, error: 'Signature is required' };
  }

  if (!secret) {
    return { valid: false, error: 'Secret is required' };
  }

  // Extract hash from "sha256=<hash>" format
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    return {
      valid: false,
      error: 'Invalid signature format. Expected "sha256=<hash>"'
    };
  }

  const receivedHash = signatureParts[1];

  // Compute expected hash using HMAC-SHA256
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedHash = hmac.digest('hex');

  // Verify both hashes have the same length to use timingSafeEqual
  if (receivedHash.length !== expectedHash.length) {
    return {
      valid: false,
      error: 'Signature hash length mismatch'
    };
  }

  // Compare using timingSafeEqual to prevent timing attacks
  try {
    const receivedBuffer = Buffer.from(receivedHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

    return isValid
      ? { valid: true }
      : { valid: false, error: 'Signature verification failed' };
  } catch (error) {
    return {
      valid: false,
      error: `Signature comparison error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
