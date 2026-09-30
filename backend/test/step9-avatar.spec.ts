/**
 * STEP 9 — AVATAR UPLOAD TESTS (JPEG/PNG, 5MB limit, encrypted storage)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - POST /api/users/me/avatar — valid JPEG < 5MB
 * - POST /api/users/me/avatar — valid PNG < 5MB
 * - POST /api/users/me/avatar — file > 5MB rejected with 400
 * - POST /api/users/me/avatar — GIF rejected (wrong MIME)
 * - File stored encrypted on disk
 * - Path traversal in filename is blocked
 * - Malicious file content (polyglot) is blocked
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

// Helpers to create test files

function createJpeg(sizeBytes: number): Buffer {
  // Minimal valid JPEG header
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const payload = Buffer.alloc(Math.max(0, sizeBytes - header.length), 0);
  return Buffer.concat([header, payload]);
}

function createPng(sizeBytes: number): Buffer {
  // Minimal valid PNG header (8-byte signature)
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = Buffer.alloc(Math.max(0, sizeBytes - header.length), 0);
  return Buffer.concat([header, payload]);
}

function createGif(): Buffer {
  return Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
}

function writeTempFile(buf: Buffer, ext: string): string {
  const p = path.join(os.tmpdir(), `avatar_test_${Date.now()}.${ext}`);
  fs.writeFileSync(p, buf);
  return p;
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
  await pool.query(`DELETE FROM users WHERE email LIKE 'avatar_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/users/me/avatar
// ---------------------------------------------------------------------------

describe('[STEP 9] POST /api/users/me/avatar', () => {
  it('200 — accepts valid JPEG under 5MB', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createJpeg(100 * 1024); // 100KB
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeDefined();
    expect(typeof res.body.avatarUrl).toBe('string');
  });

  it('200 — accepts valid PNG under 5MB', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createPng(200 * 1024); // 200KB
    const tmp = writeTempFile(buf, 'png');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeDefined();
  });

  it('400 — rejects file exceeding 5MB', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createJpeg(6 * 1024 * 1024); // 6MB
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });

  it('400 — rejects GIF format', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createGif();
    const tmp = writeTempFile(buf, 'gif');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });

  it('400 — rejects upload without file', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`);

    expect(res.status).toBe(400);
  });

  it('401 — rejects upload without token', async () => {
    const buf = createJpeg(100 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(401);
  });

  // --- Encryption ---

  it('SECURITY — uploaded avatar file is stored encrypted on disk (not raw bytes)', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createJpeg(50 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(200);

    // Fetch avatar_path from DB
    const row = await pool.query(
      `SELECT avatar_path FROM users WHERE id = $1`,
      [session.userId],
    );
    const avatarPath = row.rows[0]?.avatar_path as string;
    expect(avatarPath).toBeDefined();

    // The stored file must NOT begin with JPEG/PNG magic bytes (it must be encrypted)
    if (fs.existsSync(avatarPath)) {
      const storedFile = fs.readFileSync(avatarPath);
      // JPEG magic: FF D8 FF
      const isRawJpeg = storedFile[0] === 0xff && storedFile[1] === 0xd8;
      // PNG magic: 89 50 4E 47
      const isRawPng = storedFile[0] === 0x89 && storedFile[1] === 0x50;
      expect(isRawJpeg || isRawPng).toBe(false);
    }
  });

  // --- Path traversal ---

  it('SECURITY — path traversal in filename is blocked', async () => {
    const session = await registerAndVerify(app.getHttpServer());
    const buf = createJpeg(10 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    // Simulate path traversal by sending custom Content-Disposition
    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp, { filename: '../../../etc/passwd.jpg' });

    fs.unlinkSync(tmp);

    // Must either succeed safely (saving in upload dir) or reject — but must NOT write to ../../
    if (res.status === 200) {
      // If accepted, avatar_path must be within upload directory
      const row = await pool.query(`SELECT avatar_path FROM users WHERE id = $1`, [session.userId]);
      const avatarPath = row.rows[0]?.avatar_path as string;
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      const resolvedPath = path.resolve(avatarPath);
      expect(resolvedPath.startsWith(uploadDir)).toBe(true);
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });

  // --- Polyglot / malicious file content ---

  it('SECURITY — file with JPEG extension but non-image content is rejected', async () => {
    const session = await registerAndVerify(app.getHttpServer());

    // PHP script disguised as JPEG
    const maliciousContent = Buffer.from('MALICIOUS_EXEC_NON_IMAGE_TEST_PAYLOAD');
    const tmp = writeTempFile(maliciousContent, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${session.token}`)
      .attach('avatar', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });
});
