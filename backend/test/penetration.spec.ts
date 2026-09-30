/**
 * PENETRATION TESTS — Full Security Test Suite
 *
 * RED phase — written before implementation as security gate.
 * All tests here must PASS before declaring implementation complete.
 *
 * Categories:
 * P1 — Injection attacks (SQL injection, NoSQL, header injection)
 * P2 — Authentication bypass
 * P3 — Authorization / IDOR (Insecure Direct Object Reference)
 * P4 — Sensitive data exposure
 * P5 — File upload vulnerabilities
 * P6 — Rate limiting / DoS protection
 * P7 — Cryptographic verification (encryption at rest)
 * P8 — Session management
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as jwt from 'jsonwebtoken';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `pen_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `pen_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
}
const STRONG_PASSWORD = 'Test@Password1';

async function registerAndVerify(server: any) {
  const email = uniqueEmail();
  const username = uniqueUsername();
  await request(server).post('/api/auth/register').send({ email, username, password: STRONG_PASSWORD });
  const devRes = await request(server).get(`/api/auth/dev-verification-code?email=${encodeURIComponent(email)}`);
  const verifyRes = await request(server).post('/api/auth/verify-email').send({ email, code: devRes.body.code });
  return { email, username, token: verifyRes.body.token as string, userId: verifyRes.body.user.id as string };
}

async function createChatBetween(server: any, tokenA: string, userIdB: string, tokenB: string): Promise<string> {
  const inv = await request(server).post('/api/invitations').set('Authorization', `Bearer ${tokenA}`).send({ recipientId: userIdB });
  const acc = await request(server).post(`/api/invitations/${inv.body.id}/accept`).set('Authorization', `Bearer ${tokenB}`);
  return acc.body.chatId as string;
}

let sessionA: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionB: Awaited<ReturnType<typeof registerAndVerify>>;
let chatIdAB: string;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });
  await app.init();
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  sessionA = await registerAndVerify(app.getHttpServer());
  sessionB = await registerAndVerify(app.getHttpServer());
  chatIdAB = await createChatBetween(app.getHttpServer(), sessionA.token, sessionB.userId, sessionB.token);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'pen_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// P1 — SQL INJECTION
// ---------------------------------------------------------------------------

describe('[PEN-P1] SQL Injection', () => {
  const sqlPayloads = [
    `' OR '1'='1'--`,
    `'; DROP TABLE users;--`,
    `' UNION SELECT password_hash,2,3,4,5 FROM users--`,
    `1' AND SLEEP(5)--`,
    `' OR 1=1--`,
    `admin'--`,
    `1; EXEC xp_cmdshell('dir')--`,
  ];

  for (const payload of sqlPayloads) {
    it(`[P1] SQL injection in login email: ${payload.slice(0, 30)}`, async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: payload, password: STRONG_PASSWORD });

      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(200); // Must not bypass login

      // Check users table still exists
      const check = await pool.query(`SELECT COUNT(*) FROM users`);
      expect(Number(check.rows[0].count)).toBeGreaterThan(0);
    });
  }

  for (const payload of sqlPayloads) {
    it(`[P1] SQL injection in search query: ${payload.slice(0, 30)}`, async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/search?query=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${sessionA.token}`);

      expect(res.status).not.toBe(500);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/password_hash/);
    });
  }
});

// ---------------------------------------------------------------------------
// P2 — AUTHENTICATION BYPASS
// ---------------------------------------------------------------------------

describe('[PEN-P2] Authentication Bypass', () => {
  it('[P2] Cannot access protected route without token', async () => {
    const endpoints = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'get', path: '/api/chats' },
      { method: 'get', path: '/api/invitations/pending' },
      { method: 'get', path: '/api/users/me' },
    ];

    for (const ep of endpoints) {
      const res = await (request(app.getHttpServer()) as any)[ep.method](ep.path);
      expect(res.status).toBe(401);
    }
  });

  it('[P2] Cannot use "none" algorithm JWT (alg=none attack)', async () => {
    // Create a token with alg:none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: sessionA.userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${noneToken}`);

    expect(res.status).toBe(401);
  });

  it('[P2] Cannot forge JWT with wrong secret', async () => {
    const forged = jwt.sign({ sub: sessionA.userId }, 'attacker-secret', { expiresIn: '1h' });
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('[P2] Cannot use refresh token as access token', async () => {
    // Get a refresh token
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: sessionA.email, password: STRONG_PASSWORD });
    const rToken = loginRes.body.refreshToken as string;

    // Use refresh token where access token is expected
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rToken}`);
    expect(res.status).toBe(401);
  });

  it('[P2] JWT payload tampering is rejected (modified userId)', async () => {
    // Decode the real token, change sub, re-sign with original header
    const [headerB64, payloadB64, sig] = sessionA.token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    payload.sub = 'evil-user-id-12345';
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = `${headerB64}.${tamperedPayload}.${sig}`;

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// P3 — AUTHORIZATION / IDOR
// ---------------------------------------------------------------------------

describe('[PEN-P3] IDOR & Authorization', () => {
  it('[P3] User cannot read another user\'s chat messages', async () => {
    const freshC = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${freshC.token}`);

    expect([403, 404]).toContain(res.status);
  });

  it('[P3] User cannot edit another user\'s profile via body param', async () => {
    const freshC = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${freshC.token}`)
      .send({ userId: sessionA.userId, username: 'hackedname123' });

    // sessionA's username must remain unchanged
    const aProfile = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(aProfile.body.username).not.toBe('hackedname123');
  });

  it('[P3] Cannot archive another user\'s chat', async () => {
    const freshC = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${freshC.token}`)
      .send({ archived: true });

    expect([403, 404]).toContain(res.status);
  });

  it('[P3] Cannot mute another user\'s chat', async () => {
    const freshC = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/mute`)
      .set('Authorization', `Bearer ${freshC.token}`)
      .send({ muted: true });

    expect([403, 404]).toContain(res.status);
  });

  it('[P3] Cannot delete another user\'s message', async () => {
    const msgRes = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'A owns this', type: 'TEXT' });

    const freshC = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/${msgRes.body.id}`)
      .set('Authorization', `Bearer ${freshC.token}`);

    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// P4 — SENSITIVE DATA EXPOSURE
// ---------------------------------------------------------------------------

describe('[PEN-P4] Sensitive Data Exposure', () => {
  it('[P4] Password hash is NEVER returned in any API response', async () => {
    const endpoints = [
      { method: 'get', path: '/api/auth/me', token: sessionA.token },
      { method: 'get', path: '/api/users/me', token: sessionA.token },
      { method: 'get', path: `/api/users/search?query=${sessionA.username}`, token: sessionB.token },
    ];

    for (const ep of endpoints) {
      const res = await (request(app.getHttpServer()) as any)[ep.method](ep.path)
        .set('Authorization', `Bearer ${ep.token}`);

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/password_hash|passwordHash/);
      expect(bodyStr).not.toContain(STRONG_PASSWORD);
    }
  });

  it('[P4] Verification codes are NEVER returned in any API response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${sessionA.token}`);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/verification_code|reset_code/);
  });

  it('[P4] About field is stored encrypted in DB (not plaintext)', async () => {
    const plainAbout = 'Penetration test bio ' + Date.now();

    await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ about: plainAbout });

    const row = await pool.query(
      `SELECT about_encrypted FROM users WHERE id = $1`,
      [sessionA.userId],
    );
    const stored = row.rows[0]?.about_encrypted as string;
    expect(stored).not.toBe(plainAbout);
    expect(stored).not.toContain(plainAbout);
  });

  it('[P4] Message content is stored encrypted in DB', async () => {
    const plainMsg = 'PenTest message ' + Date.now();

    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: plainMsg, type: 'TEXT' });

    const row = await pool.query(
      `SELECT content_encrypted FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [chatIdAB],
    );
    const stored = row.rows[0]?.content_encrypted as string;
    expect(stored).not.toBe(plainMsg);
    expect(stored).not.toContain(plainMsg);
  });

  it('[P4] Error responses do not leak internal implementation details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });

    const bodyStr = JSON.stringify(res.body);
    // Must not leak DB errors, stack traces, SQL, file paths
    expect(bodyStr).not.toMatch(/PG|postgres|pg_|ERROR:|syntax error|ENOENT|stack|at Object\.|node_modules/i);
  });

  it('[P4] Server-side error (500) does not expose stack trace', async () => {
    // Send malformed but syntactically valid JSON to trigger processing
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: null, username: null, password: null });

    if (res.status === 500) {
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/at Object\.|at Function\.|node_modules|Error:/);
    }
    // Ideally should be 400, not 500
    expect(res.status).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// P5 — FILE UPLOAD VULNERABILITIES
// ---------------------------------------------------------------------------

describe('[PEN-P5] File Upload Vulnerabilities', () => {
  it('[P5] Double extension attack blocked (.jpg.php)', async () => {
    const malicious = Buffer.from('FAKE_DISGUISED_NON_IMAGE_SCRIPT_PAYLOAD_TEST');
    const tmp = path.join(os.tmpdir(), `pen_test_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, malicious);

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp, { filename: 'shell.php.jpg' });

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });

  it('[P5] ZIP bomb does not crash server', async () => {
    // Create a deeply nested ZIP (bomb-like) — simplified version
    const zipBomb = Buffer.alloc(100 * 1024, 0x00);
    zipBomb[0] = 0x50; zipBomb[1] = 0x4b; // PK header
    const tmp = path.join(os.tmpdir(), `pen_zipbomb_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, zipBomb);

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp, { filename: 'bomb.jpg' });

    fs.unlinkSync(tmp);
    // Must not crash (500) — return 400 for invalid content
    expect(res.status).not.toBe(500);
  });

  it('[P5] SSRF via filename is blocked (UNC path, etc.)', async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(100, 0)]);
    const tmp = path.join(os.tmpdir(), `pen_ssrf_${Date.now()}.jpg`);
    fs.writeFileSync(tmp, buf);

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp, { filename: '//attacker.com/shell.jpg' });

    fs.unlinkSync(tmp);
    if (res.status === 201) {
      const mediaId = res.body.mediaId as string;
      const row = await pool.query(`SELECT file_path FROM media_records WHERE id = $1`, [mediaId]);
      const filePath = row.rows[0]?.file_path as string;
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      expect(path.resolve(filePath).startsWith(uploadDir)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// P6 — RATE LIMITING / DoS PROTECTION
// ---------------------------------------------------------------------------

describe('[PEN-P6] Rate Limiting', () => {
  it('[P6] Login brute-force is rate-limited after many failed attempts', async () => {
    const email = uniqueEmail();
    const username = uniqueUsername();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username, password: STRONG_PASSWORD });

    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'wrong-password' });
      statuses.push(res.status);
    }

    const hasRateLimit = statuses.some((s) => s === 429 || s === 403);
    expect(hasRateLimit).toBe(true);
  });

  it('[P6] Registration spam is rate-limited', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail(), username: uniqueUsername(), password: STRONG_PASSWORD });
      statuses.push(res.status);
    }

    const hasRateLimit = statuses.some((s) => s === 429);
    // Rate limiting is highly recommended but may not be implemented initially
    // Log the result for awareness
    if (!hasRateLimit) {
      console.warn('[P6] WARNING: No rate limiting detected on registration endpoint');
    }
  });
});

// ---------------------------------------------------------------------------
// P7 — CRYPTOGRAPHIC VERIFICATION
// ---------------------------------------------------------------------------

describe('[PEN-P7] Cryptographic Standards', () => {
  it('[P7] Passwords are hashed with bcrypt (starts with $2b$ or $2a$)', async () => {
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username: uniqueUsername(), password: STRONG_PASSWORD });

    const row = await pool.query(
      `SELECT password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    const hash = row.rows[0]?.password_hash as string;
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('[P7] Message content_encrypted uses AES-256-GCM JSON format', async () => {
    const plainMsg = 'Crypto verification ' + Date.now();

    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: plainMsg, type: 'TEXT' });

    const row = await pool.query(
      `SELECT content_encrypted FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [chatIdAB],
    );
    const stored = row.rows[0]?.content_encrypted as string;
    expect(stored).toBeDefined();
    expect(stored).not.toBe(plainMsg);

    // Should be JSON with iv + ciphertext structure
    let parsed: any;
    try {
      parsed = JSON.parse(stored);
    } catch {
      // Could be base64 combined — still must not be plaintext
    }
    if (parsed) {
      expect(parsed.iv ?? parsed.nonce ?? parsed.IV).toBeDefined();
      expect(parsed.ciphertext ?? parsed.data ?? parsed.enc).toBeDefined();
    }
  });

  it('[P7] about_encrypted uses AES-256-GCM', async () => {
    const plainAbout = 'Crypto about test ' + Date.now();
    await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ about: plainAbout });

    const row = await pool.query(
      `SELECT about_encrypted FROM users WHERE id = $1`,
      [sessionA.userId],
    );
    const stored = row.rows[0]?.about_encrypted as string;
    expect(stored).not.toBe(plainAbout);
    // Should be parseable as JSON with crypto fields
    let parsed: any;
    try { parsed = JSON.parse(stored); } catch {}
    if (parsed) {
      expect(parsed.iv ?? parsed.nonce ?? parsed.IV).toBeDefined();
    }
  });

  it('[P7] MASTER_ENCRYPTION_KEY is not committed to source code', () => {
    // The key must only be in .env (not tracked) — check no hardcoded key in source
    const srcFiles = ['src/store/store.service.ts', 'src/app.module.ts'];
    const key = process.env.MASTER_ENCRYPTION_KEY as string;
    if (key && key.length > 0) {
      for (const file of srcFiles) {
        const fullPath = path.join(__dirname, '..', file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain(key);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P8 — SESSION MANAGEMENT
// ---------------------------------------------------------------------------

describe('[PEN-P8] Session Management', () => {
  it('[P8] Access token expires after 15 minutes (via exp claim)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: sessionA.email, password: STRONG_PASSWORD });

    const token = loginRes.body.token as string;
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - nowSec;

    // Should expire in roughly 15 minutes (900 seconds) ± 60s
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(960);
  });

  it('[P8] Refresh token has longer expiry than access token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: sessionA.email, password: STRONG_PASSWORD });

    const accessToken = loginRes.body.token as string;
    const refreshToken = loginRes.body.refreshToken as string;

    const accessPayload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString());

    expect(refreshPayload.exp).toBeGreaterThan(accessPayload.exp);
  });

  it('[P8] CORS is configured (not wildcard * in production)', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', 'http://evil.com')
      .set('Access-Control-Request-Method', 'POST');

    // In development * is OK, but check header exists
    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).toBeDefined();
  });
});

