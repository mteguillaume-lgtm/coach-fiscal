// Chiffrement AES-256-GCM des jetons au repos. Clé = TOKEN_ENCRYPTION_KEY (hex, 32 octets).
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const key = () => Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join('.');
}

export function decrypt(token) {
  const [ivHex, tagHex, dataHex] = token.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
