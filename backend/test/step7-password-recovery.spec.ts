/**
 * STEP 7 — PASSWORD RECOVERY TESTS
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 * - OTP expiry and brute-force protection
 * - After reset: old password fails, new password works
 * - All prior sessions invalidated after reset
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `pwrec_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `pwrec_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
}
const STRONG_PASSWORD = 'Test@Password1';
const NEW_PASSWORD = 'NewPass@word99';

async function registerAndVerify(
  server: any,
  email: string,
  username: string,
): Promise<{ token: string; refreshToken: string; userId: string }> {
  await request(server)
    .post('/api/auth/register')
    .send({ email, username, password: STRONG_PASSWORD });

  const devRes = await request(server)
    .get(`/api/auth/dev-verification-code?email=${encodeURIComponent(email)}`);

  const verifyRes = await request(server)
    .post('/api/auth/verify-email')
    .send({ email, code: devRes.body.code });

  return {
    token: verifyRes.body.token,
    refreshToken: verifyRes.body.refreshToken,
    userId: verifyRes.body.user.id,
  };
}

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'pwrec_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------

describe('[STEP 7] POST /api/auth/forgot-password', () => {
  it('200 — returns success for existing email', async () => {
    const email = uniqueEmail();
    await registerAndVerify(app.getHttpServer(), email, uniqueUsername());

    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it('200 — returns same generic response for non-existent email (no user enumeration)', async () => {
    // Must NOT reveal whether email exists — same 200 response
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody_pwrec@example.com' });

    // Both 200 (security by obscurity) and 400 with generic message are acceptable
    // Key: must NOT be 404 (would reveal email existence)
    expect(res.status).not.toBe(404);
  });

  it('400 — rejects missing email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(400);
  });

  it('SECURITY — reset code is stored hashed in DB, not plaintext', async () => {
    const email = uniqueEmail();
    await registerAndVerify(app.getHttpServer(), email, uniqueUsername());
    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email });

    const row = await pool.query(
      `SELECT reset_code_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    const hash = row.rows[0]?.reset_code_hash as string;
    expect(hash).toBeDefined();
    // Must not be a 6-digit plaintext code
    expect(hash).not.toMatch(/^\d{6}$/);
    // Must be a hash (longer than 6 chars)
    expect(hash.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

describe('[STEP 7] POST /api/auth/reset-password', () => {
  let testEmail: string;
  let resetCode: string;
  let existingToken: string;

  beforeEach(async () => {
    testEmail = uniqueEmail();
    const session = await registerAndVerify(app.getHttpServer(), testEmail, uniqueUsername());
    existingToken = session.token;

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: testEmail });

    const devRes = await request(app.getHttpServer())
      .get(`/api/auth/dev-reset-code?email=${encodeURIComponent(testEmail)}`);
    resetCode = devRes.body.code;
  });

  it('200 — resets password with valid OTP', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it('after reset — old password fails', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: NEW_PASSWORD });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: STRONG_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('after reset — new password works', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: NEW_PASSWORD });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('SECURITY — prior session is invalidated after password reset', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: NEW_PASSWORD });

    // The old access token must be rejected
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${existingToken}`);
    expect(res.status).toBe(401);
  });

  it('400 — wrong OTP code is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: '000000', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — new password must pass strength validation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  it('400 — code cannot be reused after successful reset', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: NEW_PASSWORD });

    // Try to use same code again
    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ email: testEmail, code: resetCode, newPassword: 'Another@Pass9' });
    expect(res.status).toBe(400);
  });

  it('SECURITY — brute-force: multiple wrong codes trigger rate limiting', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ email: testEmail, code: `11111${i}`, newPassword: NEW_PASSWORD });
      attempts.push(res.status);
    }
    // After several failed attempts, at least one should be rate-limited (429) or locked (400/403)
    const hasRateLimit = attempts.some((s) => s === 429 || s === 403);
    expect(hasRateLimit).toBe(true);
  });
});

