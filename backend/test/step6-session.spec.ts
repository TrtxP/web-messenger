/**
 * STEP 6 — SESSION PERSISTENCE & LOGOUT TESTS
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - GET /api/auth/me with valid token → 200
 * - GET /api/auth/me without token → 401
 * - POST /api/auth/refresh with valid refresh token → new access token
 * - POST /api/auth/refresh with expired/invalid token → 401
 * - POST /api/auth/logout — token is invalidated
 * - JWT manipulation security tests
 * - Token replay attack prevention
 */

import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';
import * as jwt from 'jsonwebtoken';

let app: INestApplication;
let pool: Pool;

// Shared state for registered+verified test user
let accessToken: string;
let refreshToken: string;
let userId: string;

function uniqueEmail() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
}
const STRONG_PASSWORD = 'Test@Password1';

async function registerAndVerify(
  server: any,
): Promise<{ email: string; username: string; token: string; refreshToken: string; userId: string }> {
  const email = uniqueEmail();
  const username = uniqueUsername();

  await request(server)
    .post('/api/auth/register')
    .send({ email, username, password: STRONG_PASSWORD });

  const devRes = await request(server)
    .get(`/api/auth/dev-verification-code?email=${encodeURIComponent(email)}`);

  const verifyRes = await request(server)
    .post('/api/auth/verify-email')
    .send({ email, code: devRes.body.code });

  return {
    email,
    username,
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

  const session = await registerAndVerify(app.getHttpServer());
  accessToken = session.token;
  refreshToken = session.refreshToken;
  userId = session.userId;
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'sess_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('[STEP 6] GET /api/auth/me', () => {
  it('200 — returns current user with valid Bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: userId,
      email: expect.any(String),
      username: expect.any(String),
    });
    // Sensitive fields must not be returned
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();
    expect(res.body.verification_code_hash).toBeUndefined();
  });

  it('401 — returns 401 with no Authorization header', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 — returns 401 with malformed token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('401 — returns 401 with empty Bearer', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('SECURITY — rejects token signed with wrong secret', async () => {
    const forgedToken = jwt.sign({ sub: userId }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
  });

  it('SECURITY — rejects expired access token', async () => {
    const expiredToken = jwt.sign(
      { sub: userId },
      process.env.JWT_SECRET as string,
      { expiresIn: '-1s' }, // already expired
    );
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('SECURITY — rejects access token used as refresh token (alg swap)', async () => {
    // A refresh token must not work as an access token for auth/me if separate secrets are used
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`);
    // Should be 401 because refresh tokens use a different secret
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe('[STEP 6] POST /api/auth/refresh', () => {
  it('200 — returns new access token with valid refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  it('401 — rejects invalid refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.value' });
    expect(res.status).toBe(401);
  });

  it('401 — rejects missing refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(401);
  });

  it('SECURITY — rejects refresh token signed with wrong secret', async () => {
    const forgedRefresh = jwt.sign({ sub: userId }, 'wrong-refresh-secret', {
      expiresIn: '30d',
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: forgedRefresh });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('[STEP 6] POST /api/auth/logout', () => {
  it('200 — logout succeeds and invalidates the token', async () => {
    // Create a fresh session for logout test
    const session = await registerAndVerify(app.getHttpServer());

    const logoutRes = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.token}`);
    expect(logoutRes.status).toBe(200);

    // Token must no longer work after logout
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.token}`);
    expect(meRes.status).toBe(401);
  });

  it('401 — logout without token is rejected', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('SECURITY — refresh token cannot be used after logout', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.token}`);

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    // After logout, refresh must be invalidated
    expect(refreshRes.status).toBe(401);
  });
});

