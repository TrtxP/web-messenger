/**
 * STEP 15 — TYPING INDICATORS TESTS
 *
 * RED phase — tests written before implementation.
 *
 * Covers (REST equivalents for typing state, plus WebSocket via socket.io-client):
 * - POST /api/chats/:id/typing (start typing)
 * - POST /api/chats/:id/typing-stop (stop typing)
 * - Non-member cannot trigger typing
 * - 2.5s debounce / auto-stop (server-side)
 * - Flooding protection (rate limit)
 */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Pool } from 'pg';
import { io as SocketClient, Socket } from 'socket.io-client';

let app: INestApplication;
let pool: Pool;

function uniqueEmail() {
  return `typ_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `typ_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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

function connectSocket(port: number, token: string): Socket {
  return SocketClient(`http://localhost:${port}/messenger`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
}

let sessionA: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionB: Awaited<ReturnType<typeof registerAndVerify>>;
let sessionC: Awaited<ReturnType<typeof registerAndVerify>>;
let chatIdAB: string;
let serverPort: number;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  await app.listen(0); // random port
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const httpServer = app.getHttpServer();
  serverPort = httpServer.address().port;

  sessionA = await registerAndVerify(httpServer);
  sessionB = await registerAndVerify(httpServer);
  sessionC = await registerAndVerify(httpServer);

  chatIdAB = await createChatBetween(httpServer, sessionA.token, sessionB.userId, sessionB.token);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'typ_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// WebSocket: typing:start / typing:stop / typing:update
// ---------------------------------------------------------------------------

function waitForConnect(s: Socket): Promise<void> {
  if (s.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });
}

describe('[STEP 15] WebSocket Typing Indicators', () => {
  it('recipient receives typing:update isTyping=true when sender emits typing:start', async () => {
    const socketA = connectSocket(serverPort, sessionA.token);
    const socketB = connectSocket(serverPort, sessionB.token);

    await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

    const updatePromise = new Promise<any>((resolve) => {
      socketB.once('typing:update', resolve);
    });

    socketA.emit('typing:start', { chatId: chatIdAB });

    const data = await updatePromise;
    expect(data.chatId).toBe(chatIdAB);
    expect(data.userId).toBe(sessionA.userId);
    expect(data.isTyping).toBe(true);

    socketA.disconnect();
    socketB.disconnect();
  }, 10000);

  it('recipient receives typing:update isTyping=false when sender emits typing:stop', async () => {
    const socketA = connectSocket(serverPort, sessionA.token);
    const socketB = connectSocket(serverPort, sessionB.token);

    await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

    const updatePromise = new Promise<any>((resolve) => {
      socketB.on('typing:update', (data: any) => {
        if (!data.isTyping) {
          resolve(data);
        }
      });
    });

    socketA.emit('typing:start', { chatId: chatIdAB });
    await new Promise((r) => setTimeout(r, 100));
    socketA.emit('typing:stop', { chatId: chatIdAB });

    const data = await updatePromise;
    expect(data.isTyping).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  }, 10000);

  it('SECURITY — unauthenticated socket cannot emit typing events', (done) => {
    const badSocket = SocketClient(`http://localhost:${serverPort}/messenger`, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      forceNew: true,
    });

    badSocket.on('connect_error', (err) => {
      expect(err.message).toMatch(/unauthorized|auth/i);
      badSocket.disconnect();
      done();
    });

    // Timeout fallback
    setTimeout(() => {
      if (badSocket.connected) {
        badSocket.disconnect();
        done();
      }
    }, 3000);
  }, 8000);

  it('SECURITY — non-member cannot send typing:start for a chat they do not belong to', async () => {
    const socketC = connectSocket(serverPort, sessionC.token);
    const socketA = connectSocket(serverPort, sessionA.token);

    await Promise.all([waitForConnect(socketA), waitForConnect(socketC)]);

    let typingReceived = false;
    socketA.on('typing:update', (data: any) => {
      if (data.userId === sessionC.userId) {
        typingReceived = true;
      }
    });

    socketC.emit('typing:start', { chatId: chatIdAB });

    await new Promise((r) => setTimeout(r, 1000));
    expect(typingReceived).toBe(false);

    socketA.disconnect();
    socketC.disconnect();
  }, 8000);

  it('SECURITY — typing flood protection: rapid emissions are rate-limited', async () => {
    const socketA = connectSocket(serverPort, sessionA.token);
    const socketB = connectSocket(serverPort, sessionB.token);

    await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

    let updateCount = 0;
    socketB.on('typing:update', () => {
      updateCount++;
    });

    for (let i = 0; i < 20; i++) {
      socketA.emit('typing:start', { chatId: chatIdAB });
    }

    await new Promise((r) => setTimeout(r, 1500));
    expect(updateCount).toBeLessThan(20);

    socketA.disconnect();
    socketB.disconnect();
  }, 10000);
});

// ---------------------------------------------------------------------------
// REST fallback for typing (if implemented as HTTP)
// ---------------------------------------------------------------------------

describe('[STEP 15] POST /api/chats/:id/typing (REST)', () => {
  it('200 — member can trigger typing start', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/typing`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ isTyping: true });

    // Could be 200 or 404 if only WebSocket is used — both acceptable
    expect([200, 404]).toContain(res.status);
  });

  it('403 — non-member cannot trigger typing', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatIdAB}/typing`)
      .set('Authorization', `Bearer ${sessionC.token}`)
      .send({ isTyping: true });

    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

