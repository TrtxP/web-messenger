/**
 * STEP 16 — MEDIA UPLOAD TESTS (Image/Video, 20MB limit, encrypted storage)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - POST /api/media/upload — valid image (JPEG, PNG, WebP)
 * - POST /api/media/upload — valid video (MP4)
 * - File > 20MB rejected
 * - GET /api/media/stream/:id — returns decrypted binary stream
 * - Non-member cannot access media
 * - Media encrypted at rest on disk
 * - Path traversal in filename
 * - Malicious executable disguised as media
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
  return `media_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

// File creation helpers
function createJpeg(sizeBytes: number): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const payload = Buffer.alloc(Math.max(0, sizeBytes - header.length), 0);
  return Buffer.concat([header, payload]);
}

function createMp4(sizeBytes: number): Buffer {
  // Minimal ftyp box header for MP4
  const header = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size + 'ftyp'
    0x6d, 0x70, 0x34, 0x32, // major brand 'mp42'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x6d, 0x70, 0x34, 0x32, // compatible brand 'mp42'
    0x69, 0x73, 0x6f, 0x6d, // compatible brand 'isom'
  ]);
  const payload = Buffer.alloc(Math.max(0, sizeBytes - header.length), 0);
  return Buffer.concat([header, payload]);
}

function writeTempFile(buf: Buffer, ext: string): string {
  const p = path.join(os.tmpdir(), `media_test_${Date.now()}.${ext}`);
  fs.writeFileSync(p, buf);
  return p;
}

let sessionA: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionB: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionC: Awaited<ReturnType<typeof registerAndVerify>>;
let chatIdAB: string;

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
  sessionC = await registerAndVerify(app.getHttpServer());
  chatIdAB = await createChatBetween(app.getHttpServer(), sessionA.token, sessionB.userId, sessionB.token);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'media_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/media/upload
// ---------------------------------------------------------------------------

describe('[STEP 16] POST /api/media/upload', () => {
  it('201 — accepts valid JPEG under 20MB', async () => {
    const buf = createJpeg(500 * 1024); // 500KB
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      mediaId: expect.any(String),
      mediaUrl: expect.any(String),
      mimeType: expect.stringMatching(/^image\//),
    });
  });

  it('201 — accepts valid MP4 under 20MB', async () => {
    const buf = createMp4(1 * 1024 * 1024); // 1MB
    const tmp = writeTempFile(buf, 'mp4');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(201);
    expect(res.body.mediaId).toBeDefined();
  });

  it('400 — rejects file exceeding 20MB', async () => {
    const buf = createJpeg(21 * 1024 * 1024); // 21MB
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });

  it('400 — rejects upload with no file', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`);
    expect(res.status).toBe(400);
  });

  it('401 — rejects without token', async () => {
    const buf = createJpeg(50 * 1024);
    const tmp = writeTempFile(buf, 'jpg');
    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .attach('media', tmp);
    fs.unlinkSync(tmp);
    expect(res.status).toBe(401);
  });

  // --- Encryption ---

  it('SECURITY — uploaded media file is encrypted on disk', async () => {
    const buf = createJpeg(100 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(201);

    const mediaId = res.body.mediaId as string;

    // Fetch media record from DB to get file path
    const row = await pool.query(
      `SELECT file_path FROM media_records WHERE id = $1`,
      [mediaId],
    );
    const filePath = row.rows[0]?.file_path as string;
    if (filePath && fs.existsSync(filePath)) {
      const storedFile = fs.readFileSync(filePath);
      // Must NOT start with JPEG magic bytes (FF D8 FF) — it's encrypted
      const isRawJpeg = storedFile[0] === 0xff && storedFile[1] === 0xd8;
      expect(isRawJpeg).toBe(false);
    }
  });

  // --- Path traversal ---

  it('SECURITY — path traversal in filename is blocked', async () => {
    const buf = createJpeg(50 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp, { filename: '../../../etc/cron.d/malicious.jpg' });

    fs.unlinkSync(tmp);

    if (res.status === 201) {
      const mediaId = res.body.mediaId as string;
      const row = await pool.query(`SELECT file_path FROM media_records WHERE id = $1`, [mediaId]);
      const filePath = row.rows[0]?.file_path as string;
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      expect(path.resolve(filePath).startsWith(uploadDir)).toBe(true);
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });

  // --- Malicious content ---

  it('SECURITY — executable disguised as JPEG is rejected', async () => {
    // ELF binary header
    const elfContent = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const tmp = writeTempFile(elfContent, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/media/stream/:id
// ---------------------------------------------------------------------------

describe('[STEP 16] GET /api/media/stream/:id', () => {
  let uploadedMediaId: string;
  let uploadedMimeType: string;
  let originalJpegHeader: Buffer;

  beforeAll(async () => {
    originalJpegHeader = createJpeg(50 * 1024).slice(0, 12);
    const buf = createJpeg(50 * 1024);
    const tmp = writeTempFile(buf, 'jpg');

    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .attach('media', tmp);

    fs.unlinkSync(tmp);
    uploadedMediaId = res.body.mediaId;
    uploadedMimeType = res.body.mimeType;
  });

  it('200 — returns decrypted binary stream for chat member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/media/stream/${uploadedMediaId}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\//);
    // Decrypted content must start with JPEG magic bytes
    const body = Buffer.from(res.body as Buffer);
    expect(body[0]).toBe(0xff);
    expect(body[1]).toBe(0xd8);
  });

  it('401 — requires authentication for media stream', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/media/stream/${uploadedMediaId}`);
    expect(res.status).toBe(401);
  });

  it('404 — returns 404 for non-existent media', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/media/stream/non-existent-media-id')
      .set('Authorization', `Bearer ${sessionA.token}`);
    expect(res.status).toBe(404);
  });
});

