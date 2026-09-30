/**
 * STEP 10 — USER SEARCH TESTS
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - GET /api/users/search?query= by username
 * - GET /api/users/search?query= by email
 * - Self-user excluded from results
 * - relationship field in response
 * - SQL injection prevention
 * - Requires authentication
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
  return `search_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `srch_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

let sessionA: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionB: Awaited<ReturnType<typeof registerAndVerify>>;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  sessionA = await registerAndVerify(app.getHttpServer());
  sessionB = await registerAndVerify(app.getHttpServer());
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'search_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /api/users/search
// ---------------------------------------------------------------------------

describe('[STEP 10] GET /api/users/search', () => {
  it('200 — finds user by exact username', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${sessionB.username}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((u: any) => u.id === sessionB.userId);
    expect(found).toBeDefined();
    expect(found.username).toBe(sessionB.username);
  });

  it('200 — finds user by partial username', async () => {
    const partial = sessionB.username.slice(0, 5);
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${partial}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((u: any) => u.id === sessionB.userId);
    expect(found).toBeDefined();
  });

  it('200 — finds user by email', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${sessionB.email}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((u: any) => u.id === sessionB.userId);
    expect(found).toBeDefined();
  });

  it('200 — self-user is excluded from results', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${sessionA.username}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const self = res.body.find((u: any) => u.id === sessionA.userId);
    expect(self).toBeUndefined();
  });

  it('200 — result contains relationship field', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${sessionB.username}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const found = res.body.find((u: any) => u.id === sessionB.userId);
    expect(found).toHaveProperty('relationship');
    expect(['none', 'pending', 'contact']).toContain(found.relationship);
  });

  it('200 — password fields are never returned in search results', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${sessionB.username}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/password_hash|passwordHash|verification_code/);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=alice`);
    expect(res.status).toBe(401);
  });

  it('200 — empty query returns users (or empty array)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/search?query=')
      .set('Authorization', `Bearer ${sessionA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- SQL Injection ---

  it('SECURITY — SQL injection in query param is safely handled', async () => {
    const injectionPayloads = [
      `' OR '1'='1`,
      `'; DROP TABLE users; --`,
      `' UNION SELECT * FROM users --`,
      `%27%20OR%20%271%27%3D%271`,
    ];

    for (const payload of injectionPayloads) {
      const res = await request(app.getHttpServer())
        .get(`/api/users/search?query=${encodeURIComponent(payload)}`)
        .set('Authorization', `Bearer ${sessionA.token}`);

      // Must not crash (500) and must not return all users
      expect(res.status).not.toBe(500);
      // Should return normal response (200 with empty or filtered results)
      expect(res.status).toBe(200);
      // Results must not contain sensitive dump
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/password_hash/);
    }

    // Verify users table was not dropped
    const check = await pool.query(`SELECT COUNT(*) FROM users`);
    expect(Number(check.rows[0].count)).toBeGreaterThan(0);
  });
});

