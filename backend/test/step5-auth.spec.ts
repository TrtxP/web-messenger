/**
 * STEP 5 — AUTH TESTS (Registration, Login, Password Strength, Email Verification)
 *
 * These tests are written FIRST (RED phase).
 * They will fail until the implementation is complete.
 *
 * Covers:
 * - Registration validation (email, username, password)
 * - Duplicate email/username detection
 * - Password strength rules
 * - Email verification OTP flow
 * - Login flow with JWT response
 * - bcrypt password hashing (NOT plaintext or SHA-256)
 */

import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';

let app: INestApplication;
let pool: Pool;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueEmail() {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}

function uniqueUsername() {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
}

const STRONG_PASSWORD = 'Test@Password1';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

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
  // clean test users
  await pool.query(`DELETE FROM users WHERE email LIKE 'test_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// REGISTRATION
// ---------------------------------------------------------------------------

describe('[STEP 5] POST /api/auth/register', () => {
  it('201 — registers a new user with valid data', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: STRONG_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      username: expect.any(String),
    });
    // password must NEVER appear in the response
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();
  });

  it('201 — response indicates email verification required', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: STRONG_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
  });

  it('409 — rejects duplicate email (case-insensitive)', async () => {
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username: uniqueUsername(), password: STRONG_PASSWORD });

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), username: uniqueUsername(), password: STRONG_PASSWORD });

    expect(res.status).toBe(409);
  });

  it('409 — rejects duplicate username (case-insensitive)', async () => {
    const username = uniqueUsername();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username, password: STRONG_PASSWORD });

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: username.toUpperCase(), password: STRONG_PASSWORD });

    expect(res.status).toBe(409);
  });

  it('400 — rejects missing email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username: uniqueUsername(), password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — rejects missing username', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — rejects missing password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername() });
    expect(res.status).toBe(400);
  });

  it('400 — rejects invalid email format', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', username: uniqueUsername(), password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  // --- Password strength ---

  it('400 — rejects password shorter than 8 chars', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: 'Aa1!' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects password without uppercase', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: 'test@password1' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects password without lowercase', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: 'TEST@PASSWORD1' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects password without digit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: 'Test@Password' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects password without special character', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: 'TestPassword1' });
    expect(res.status).toBe(400);
  });

  // --- Username validation ---

  it('400 — rejects username shorter than 3 chars', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: 'ab', password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — rejects username longer than 30 chars', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: 'a'.repeat(31), password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — rejects username with special characters', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), username: 'user@name!', password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  // --- Password MUST be hashed with bcrypt (not SHA-256) ---

  it('SECURITY — password is stored as bcrypt hash (not SHA-256, not plaintext)', async () => {
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, username: uniqueUsername(), password: STRONG_PASSWORD });

    const row = await pool.query(
      `SELECT password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );

    const hash = row.rows[0]?.password_hash as string;
    expect(hash).toBeDefined();
    // bcrypt hashes always start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
    // Must NOT be plain SHA-256 (64 hex chars)
    expect(hash).not.toMatch(/^[a-f0-9]{64}$/);
    // Must NOT be the plaintext password
    expect(hash).not.toBe(STRONG_PASSWORD);
  });
});

// ---------------------------------------------------------------------------
// EMAIL VERIFICATION
// ---------------------------------------------------------------------------

describe('[STEP 5] POST /api/auth/verify-email', () => {
  let testEmail: string;
  let testUsername: string;

  beforeEach(async () => {
    testEmail = uniqueEmail();
    testUsername = uniqueUsername();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: testEmail, username: testUsername, password: STRONG_PASSWORD });
  });

  it('400 — login before verification is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: testEmail, password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
    // should hint about verification
    expect(JSON.stringify(res.body).toLowerCase()).toMatch(/verif/);
  });

  it('200 — verification with wrong code fails', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ email: testEmail, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('200 — verification with correct code succeeds and returns JWT', async () => {
    // In dev mode the code is logged — we retrieve it from DB
    const row = await pool.query(
      `SELECT verification_code_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [testEmail],
    );
    // verification_code_hash must exist (code was generated)
    expect(row.rows[0]?.verification_code_hash).toBeDefined();

    // For test purposes: the dev-mode endpoint returns the code directly
    const devRes = await request(app.getHttpServer())
      .get(`/api/auth/dev-verification-code?email=${encodeURIComponent(testEmail)}`);
    expect(devRes.status).toBe(200);
    const code = devRes.body.code as string;
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ email: testEmail, code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeDefined();
    expect(verifyRes.body.refreshToken).toBeDefined();
    expect(verifyRes.body.user).toMatchObject({ email: testEmail, username: testUsername });
  });
});

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------

describe('[STEP 5] POST /api/auth/login', () => {
  let verifiedEmail: string;
  let verifiedUsername: string;

  beforeAll(async () => {
    verifiedEmail = uniqueEmail();
    verifiedUsername = uniqueUsername();

    // Register
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: verifiedEmail, username: verifiedUsername, password: STRONG_PASSWORD });

    // Verify via dev endpoint
    const devRes = await request(app.getHttpServer())
      .get(`/api/auth/dev-verification-code?email=${encodeURIComponent(verifiedEmail)}`);
    await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ email: verifiedEmail, code: devRes.body.code });
  });

  it('200 — login with correct credentials returns JWT tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: verifiedEmail, password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toMatchObject({ email: verifiedEmail, username: verifiedUsername });
  });

  it('401 — login with wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: verifiedEmail, password: 'WrongPassword1!' });
    expect(res.status).toBe(401);
  });

  it('401 — login with non-existent email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: STRONG_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('400 — login with missing email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('SECURITY — response body does NOT contain password hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: verifiedEmail, password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/password_hash|passwordHash/);
    expect(body).not.toContain(STRONG_PASSWORD);
  });
});

