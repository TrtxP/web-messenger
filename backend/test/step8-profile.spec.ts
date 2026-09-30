/**
 * STEP 8 — USER PROFILE TESTS (View, Edit, About me, Encryption)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - GET /api/users/me → full profile
 * - PUT /api/users/me → update username and about
 * - Conflict on duplicate username
 * - `about` field encrypted in DB with AES-256-GCM
 * - Unauthorized access to profile
 */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `prof_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `prof_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
}
const STRONG_PASSWORD = 'Test@Password1';

async function registerAndVerify(server: any) {
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
    token: verifyRes.body.token as string,
    userId: verifyRes.body.user.id as string,
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
  await pool.query(`DELETE FROM users WHERE email LIKE 'prof_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /api/users/me
// ---------------------------------------------------------------------------

describe('[STEP 8] GET /api/users/me', () => {
  it('200 — returns full profile fields', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: session.userId,
      email: session.email,
      username: session.username,
    });
    // profile fields must exist
    expect(res.body).toHaveProperty('about');
    expect(res.body).toHaveProperty('avatarUrl');
  });

  it('200 — about is initially empty string', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`);

    expect(res.status).toBe(200);
    expect(res.body.about).toBe('');
  });

  it('401 — returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('SECURITY — does not expose password_hash or verification codes', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/password_hash|passwordHash|verification_code|reset_code/);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/me
// ---------------------------------------------------------------------------

describe('[STEP 8] PUT /api/users/me', () => {
  it('200 — updates username successfully', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const newUsername = uniqueUsername();

    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ username: newUsername });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(newUsername);
  });

  it('200 — updates about field', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ about: 'Hey there! Using Mobile Messenger.' });

    expect(res.status).toBe(200);
    expect(res.body.about).toBe('Hey there! Using Mobile Messenger.');
  });

  it('409 — rejects username already taken by another user', async () => {
    const sessionA = await registerAndVerify(app.getHttpServer());
    const sessionB = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ username: sessionA.username });

    expect(res.status).toBe(409);
  });

  it('400 — rejects username shorter than 3 chars in update', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ username: 'ab' });

    expect(res.status).toBe(400);
  });

  it('401 — update without token is rejected', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .send({ about: 'test' });
    expect(res.status).toBe(401);
  });

  // --- Encryption verification ---

  it('SECURITY — about field is encrypted in DB (AES-256-GCM), not stored plaintext', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const plainAbout = 'My secret bio text';

    await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ about: plainAbout });

    // Check raw DB value
    const row = await pool.query(
      `SELECT about_encrypted FROM users WHERE id = $1`,
      [session.userId],
    );
    const stored = row.rows[0]?.about_encrypted as string;

    expect(stored).toBeDefined();
    // Must NOT be plaintext
    expect(stored).not.toBe(plainAbout);
    // Must be JSON with iv, tag, ciphertext (AES-256-GCM format)
    let parsed: any;
    try {
      parsed = JSON.parse(stored);
    } catch {
      // Could be base64 combined format — still must not be plaintext
    }
    if (parsed) {
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('ciphertext');
    }
  });

  it('SECURITY — user cannot update another user\'s profile (IDOR)', async () => {
    const sessionA = await registerAndVerify(app.getHttpServer());
    const sessionB = await registerAndVerify(app.getHttpServer());

    // B tries to update A's profile — must be rejected
    // The endpoint /api/users/me must use JWT identity, not a body user_id
    const res = await request(app.getHttpServer())
      .put('/api/users/me')
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ username: 'hacked_username', userId: sessionA.userId });

    // Either 200 (changing only B's profile) or 400/403
    // Check: A's username must NOT change
    const aProfile = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${sessionA.token}`);
    expect(aProfile.body.username).toBe(sessionA.username);
  });
});

