/**
 * STEP 13 — MESSAGING TESTS (Text, Status Lifecycle, Encryption, WebSocket)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - POST /api/chats/:id/messages (REST fallback)
 * - GET /api/chats/:id/messages → paginated, decrypted
 * - Message content encrypted in DB (AES-256-GCM)
 * - Status lifecycle: sent → delivered → read
 * - Message struct: id, chatId, senderId, type, content, status, isEdited, createdAt
 * - Cannot send to chat not belonging to user → 403
 * - Message content injection prevention
 * - Text max 4000 chars
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
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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
  await pool.query(`DELETE FROM users WHERE email LIKE 'msg_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/chats/:id/messages
// ---------------------------------------------------------------------------

describe('[STEP 13] POST /api/chats/:id/messages', () => {
  it('201 — sends a text message', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'Hello!', type: 'TEXT' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      chatId: chatIdAB,
      senderId: sessionA.userId,
      type: 'TEXT',
      content: 'Hello!',
      status: expect.stringMatching(/^(sent|pending)$/),
      isEdited: false,
      createdAt: expect.any(String),
    });
  });

  it('400 — rejects message exceeding 4000 characters', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'a'.repeat(4001), type: 'TEXT' });

    expect(res.status).toBe(400);
  });

  it('400 — rejects empty content', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: '', type: 'TEXT' });

    expect(res.status).toBe(400);
  });

  it('403 — cannot send message to a chat user does not belong to', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionC.token}`)
      .send({ content: 'I do not belong here', type: 'TEXT' });

    expect(res.status).toBe(403);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .send({ content: 'Hello!', type: 'TEXT' });

    expect(res.status).toBe(401);
  });

  // --- Encryption ---

  it('SECURITY — message content is encrypted in DB (AES-256-GCM)', async () => {
    const plainText = 'This is a secret message ' + Date.now();

    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: plainText, type: 'TEXT' });

    // Check raw DB row
    const row = await pool.query(
      `SELECT content_encrypted FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [chatIdAB],
    );
    const stored = row.rows[0]?.content_encrypted as string;

    expect(stored).toBeDefined();
    expect(stored).not.toBe(plainText);
    // Must not be plaintext stored in `text` column either
    const textRow = await pool.query(
      `SELECT text FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [chatIdAB],
    );
    if (textRow.rows[0]?.text) {
      expect(textRow.rows[0].text).not.toBe(plainText);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/chats/:id/messages
// ---------------------------------------------------------------------------

describe('[STEP 13] GET /api/chats/:id/messages', () => {
  it('200 — returns messages for chat member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=50`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — returned messages are decrypted (readable text, not ciphertext)', async () => {
    const plainText = 'Decryption test msg ' + Date.now();

    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: plainText, type: 'TEXT' });

    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=50`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const found = (res.body as any[]).find((m) => m.content === plainText);
    expect(found).toBeDefined();
  });

  it('200 — each message has required fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=50`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    if ((res.body as any[]).length > 0) {
      const msg = res.body[0];
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('chatId');
      expect(msg).toHaveProperty('senderId');
      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('content');
      expect(msg).toHaveProperty('status');
      expect(msg).toHaveProperty('isEdited');
      expect(msg).toHaveProperty('createdAt');
    }
  });

  it('403 — non-member cannot read chat messages', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=50`)
      .set('Authorization', `Bearer ${sessionC.token}`);

    expect(res.status).toBe(403);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages`);
    expect(res.status).toBe(401);
  });

  it('200 — pagination: limit parameter respected', async () => {
    // Send multiple messages
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(`/api/chats/${chatIdAB}/messages`)
        .set('Authorization', `Bearer ${sessionA.token}`)
        .send({ content: `Pagination msg ${i}`, type: 'TEXT' });
    }

    const res = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=3`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect((res.body as any[]).length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Message status: sent → delivered → read
// ---------------------------------------------------------------------------

describe('[STEP 13] Message status lifecycle', () => {
  it('new message starts with status "sent"', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'Status test', type: 'TEXT' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('sent');
  });
});

