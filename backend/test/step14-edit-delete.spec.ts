/**
 * STEP 14 — EDIT/DELETE OWN MESSAGES TESTS
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - PUT /api/chats/:chatId/messages/:msgId — edit own text message
 * - DELETE /api/chats/:chatId/messages/:msgId — delete own message
 * - Edited message: isEdited = true
 * - Deleted message: tombstone or removed
 * - Cannot edit/delete other user's message (IDOR)
 * - Cannot edit media messages (only TEXT)
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
  return `edit_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `edit_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

async function sendMessage(server: any, token: string, chatId: string, content: string): Promise<{ id: string }> {
  const res = await request(server)
    .post(`/api/chats/${chatId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content, type: 'TEXT' });
  return res.body;
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
  await app.init();
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  sessionA = await registerAndVerify(app.getHttpServer());
  sessionB = await registerAndVerify(app.getHttpServer());
  chatIdAB = await createChatBetween(app.getHttpServer(), sessionA.token, sessionB.userId, sessionB.token);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'edit_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// PUT /api/chats/:chatId/messages/:msgId — Edit
// ---------------------------------------------------------------------------

describe('[STEP 14] PUT /api/chats/:chatId/messages/:msgId (edit)', () => {
  it('200 — can edit own text message', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Original text');

    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'Edited text' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Edited text');
    expect(res.body.isEdited).toBe(true);
  });

  it('403 — cannot edit another user\'s message (IDOR)', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'A wrote this');

    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ content: 'B hacked this' });

    expect(res.status).toBe(403);
  });

  it('400 — rejects edit with empty content', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Some text');

    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('400 — rejects edit with content > 4000 chars', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Some text');

    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'x'.repeat(4001) });

    expect(res.status).toBe(400);
  });

  it('404 — returns 404 for non-existent message', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/non-existent-id`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: 'New content' });

    expect(res.status).toBe(404);
  });

  it('401 — requires authentication', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Some text');

    const res = await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .send({ content: 'New content' });

    expect(res.status).toBe(401);
  });

  it('SECURITY — edited content is re-encrypted in DB', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Before edit');
    const newContent = 'After edit ' + Date.now();

    await request(app.getHttpServer())
      .put(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ content: newContent });

    // Verify DB has encrypted (not plaintext) new content
    const row = await pool.query(
      `SELECT content_encrypted FROM messages WHERE id = $1`,
      [msg.id],
    );
    const stored = row.rows[0]?.content_encrypted as string;
    expect(stored).not.toBe(newContent);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/chats/:chatId/messages/:msgId — Delete
// ---------------------------------------------------------------------------

describe('[STEP 14] DELETE /api/chats/:chatId/messages/:msgId', () => {
  it('200 — can delete own message', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Delete me');

    const res = await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
  });

  it('after delete — message appears as tombstone or absent in list', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Delete and check');

    await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    const listRes = await request(app.getHttpServer())
      .get(`/api/chats/${chatIdAB}/messages?limit=50`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    const found = (listRes.body as any[]).find((m) => m.id === msg.id);
    if (found) {
      // Tombstone: content should indicate deletion
      expect(found.isDeleted || found.content === null || /deleted/i.test(found.content)).toBe(true);
    }
    // else: message completely removed — also acceptable
  });

  it('403 — cannot delete another user\'s message (IDOR)', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'A owns this');

    const res = await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${sessionB.token}`);

    expect(res.status).toBe(403);
  });

  it('404 — returns 404 for non-existent message', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/non-existent-id`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(404);
  });

  it('401 — requires authentication', async () => {
    const msg = await sendMessage(app.getHttpServer(), sessionA.token, chatIdAB, 'Auth test');

    const res = await request(app.getHttpServer())
      .delete(`/api/chats/${chatIdAB}/messages/${msg.id}`);

    expect(res.status).toBe(401);
  });
});

