import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class CryptoService {
  private key: Buffer;

  constructor() {
    const rawKey = process.env.MASTER_ENCRYPTION_KEY || 'a7f2e1c94b38d05e2f6a89c41d7e35b0c8491f2e6d3a5b7c8e9f0123456789ab';
    this.key = Buffer.from(rawKey, 'hex');
    if (this.key.length !== 32) {
      const { createHash } = require('crypto');
      this.key = createHash('sha256').update(rawKey).digest();
    }
  }

  encryptText(plainText: string): string {
    if (!plainText) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    let ciphertext = cipher.update(plainText, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
      iv: iv.toString('hex'),
      tag,
      ciphertext,
    });
  }

  decryptText(encryptedJson: string): string {
    if (!encryptedJson) return '';
    try {
      const payload: EncryptedPayload = JSON.parse(encryptedJson);
      if (!payload.iv || !payload.tag || !payload.ciphertext) return encryptedJson;
      const iv = Buffer.from(payload.iv, 'hex');
      const tag = Buffer.from(payload.tag, 'hex');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      let plain = decipher.update(payload.ciphertext, 'hex', 'utf8');
      plain += decipher.final('utf8');
      return plain;
    } catch {
      return encryptedJson;
    }
  }

  encryptBuffer(buffer: Buffer): { encrypted: Buffer; iv: string; tag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag().toString('hex');
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag,
    };
  }

  decryptBuffer(encryptedBuffer: Buffer, ivHex: string, tagHex: string): Buffer {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  }
}

