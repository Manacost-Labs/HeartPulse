import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createPayloadCipher(secret: Uint8Array) {
  if (secret.byteLength !== 32) throw new Error('Identity encryption requires a 32-byte key');
  const key = Buffer.from(secret);
  return {
    encrypt(value: unknown, context: string): string {
      const plaintext = Buffer.from(JSON.stringify(value));
      if (plaintext.byteLength > 262_144) throw new Error('Identity payload too large');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    },
    decrypt(value: string, context: string): unknown {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length < 29) throw new Error('Invalid identity payload');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12), { authTagLength: 16 });
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    },
  };
}
