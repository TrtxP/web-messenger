/**
 * STEP 12 — CHAT LIST TESTS (Sorted, Archive/Unarchive)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - GET /api/chats → sorted by last message DESC
 * - GET /api/chats?archived=true → archived chats
 * - POST /api/chats/:id/archive → archive
 * - POST /api/chats/:id/archive with {archived:false} → unarchive
 * - POST /api/chats/:id/mute
 * - Accessing other user's chats → 403/404
 * - Chat list includes: partner, lastMessage, unreadCount, isArchived, isMuted
 */

import _request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
const request: any = (_request as any).default || _request;
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `chats_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `chats_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

async function createChatBetween(
  server: any,
  tokenA: string,
  userIdB: string,
  tokenB: string,
): Promise<string> {
  const inv = await request(server)
    .post('/api/invitations')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ recipientId: userIdB });

  const accepted = await request(server)
    .post(`/api/invitations/${inv.body.id}/accept`)
    .set('Authorization', `Bearer ${tokenB}`);

  return accepted.body.chatId as string;
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

  chatIdAB = await createChatBetween(
    app.getHttpServer(),
    sessionA.token,
    sessionB.userId,
    sessionB.token,
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'chats_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /api/chats
// ---------------------------------------------------------------------------

describe('[STEP 12] GET /api/chats', () => {
  it('200 — returns chats for authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/chats')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 — chat object contains required fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/chats')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const chat = res.body.find((c: any) => c.id === chatIdAB);
    expect(chat).toBeDefined();
    expect(chat).toHaveProperty('id');
    expect(chat).toHaveProperty('partner');
    expect(chat.partner).toHaveProperty('id');
    expect(chat.partner).toHaveProperty('username');
    expect(chat).toHaveProperty('lastMessage');
    expect(chat).toHaveProperty('unreadCount');
    expect(chat).toHaveProperty('isArchived');
    expect(chat).toHaveProperty('isMuted');
  });

  it('200 — chats sorted by lastMessage DESC (newest first)', async () => {
    // Send messages to create different timestamps
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'first message', type: 'TEXT' });

    const chatAC = await createChatBetween(
      app.getHttpServer(),
      sessionA.token,
      sessionC.userId,
      sessionC.token,
    );

    await new Promise((r) => setTimeout(r, 100));

    await request(app.getHttpServer())
      .post(`/api/chats/${chatAC}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'more recent message', type: 'TEXT' });

    const res = await request(app.getHttpServer())
      .get('/api/chats')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const chatIds = (res.body as any[]).map((c) => c.id);
    const idxAC = chatIds.indexOf(chatAC);
    const idxAB = chatIds.indexOf(chatIdAB);
    // chatAC (more recent) must come before chatAB
    expect(idxAC).toBeLessThan(idxAB);
  });

  it('200 — archived chats excluded from default list', async () => {
    // Archive the chat
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: true });

    const res = await request(app.getHttpServer())
      .get('/api/chats')
      .set('Authorization', `Bearer ${sessionA.token}`);

    const found = (res.body as any[]).find((c) => c.id === chatIdAB);
    expect(found).toBeUndefined();

    // Unarchive for subsequent tests
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: false });
  });

  it('200 — GET /api/chats?archived=true returns archived chats', async () => {
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: true });

    const res = await request(app.getHttpServer())
      .get('/api/chats?archived=true')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    const found = (res.body as any[]).find((c) => c.id === chatIdAB);
    expect(found).toBeDefined();

    // Unarchive
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: false });
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/chats');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/chats/:id/archive
// ---------------------------------------------------------------------------

describe('[STEP 12] POST /api/chats/:id/archive', () => {
  it('200 — archives a chat', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: true });

    expect(res.status).toBe(200);
    expect(res.body.isArchived).toBe(true);

    // Unarchive
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: false });
  });

  it('200 — unarchives a chat', async () => {
    await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: true });

    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ archived: false });

    expect(res.status).toBe(200);
    expect(res.body.isArchived).toBe(false);
  });

  it('SECURITY — cannot archive another user\'s chat view', async () => {
    // C tries to archive A-B chat
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .set('Authorization', `Bearer ${sessionC.token}`)
      .send({ archived: true });

    expect([403, 404]).toContain(res.status);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/archive`)
      .send({ archived: true });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/chats/:id/mute
// ---------------------------------------------------------------------------

describe('[STEP 12] POST /api/chats/:id/mute', () => {
  it('200 — mutes a chat', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/mute`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ muted: true });

    expect(res.status).toBe(200);
    expect(res.body.isMuted).toBe(true);
  });

  it('200 — unmutes a chat', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/mute`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ muted: false });

    expect(res.status).toBe(200);
    expect(res.body.isMuted).toBe(false);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/mute`)
      .send({ muted: true });
    expect(res.status).toBe(401);
  });
});

describe('[STEP 12] DELETE /api/chats/:id', () => {
  it('deletes the chat and its full history for both participants', async () => {
    const chatId = chatIdAB;
    await request(app.getHttpServer())
      .post(`/api/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'conversation to delete', type: 'TEXT' });

    const deleted = await request(app.getHttpServer())
      .delete(`/api/chats/${chatId}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect([200, 204]).toContain(deleted.status);
    const [members, messages] = await Promise.all([
      pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1', [chatId]),
      pool.query('SELECT 1 FROM messages WHERE chat_id = $1', [chatId]),
    ]);
    expect(members.rowCount).toBe(0);
    expect(messages.rowCount).toBe(0);

    for (const token of [sessionA.token, sessionB.token]) {
      const chats = await request(app.getHttpServer())
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);
      expect(chats.body.some((chat: any) => chat.id === chatId)).toBe(false);
    }
  });
});

