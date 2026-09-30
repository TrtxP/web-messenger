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
  return `block_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}

function uniqueUsername() {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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
let chatId: string;

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

  const inviteRes = await request(app.getHttpServer())
    .post('/api/invitations')
    .set('Authorization', `Bearer ${sessionA.token}`)
    .send({ toUserId: sessionB.userId });

  const acceptRes = await request(app.getHttpServer())
    .post(`/api/invitations/${inviteRes.body.id}/accept`)
    .set('Authorization', `Bearer ${sessionB.token}`);

  chatId = acceptRes.body.chatId;
});

afterAll(async () => {
  await pool.end();
  await app.close();
});

describe('[USER BLOCKING] Endpoints & Business Logic', () => {
  it('POST /api/users/:id/block — user A blocks user B', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/users/${sessionB.userId}/block`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect([200, 201]).toContain(res.status);
  });

  it('GET /api/users/blocked — user A sees user B in blocked list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/blocked')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain(sessionB.userId);
  });

  it('POST /api/chats/:id/messages — blocked user B cannot send message to user A', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ content: 'Hello after block', type: 'TEXT' });

    expect(res.status).toBe(403);
  });

  it('POST /api/invitations — blocked user B cannot send invitation to user A', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ toUserId: sessionA.userId });

    expect(res.status).toBe(403);
  });

  it('GET /api/users/search — user A cannot find blocked user B', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/search?query=${encodeURIComponent(sessionB.username)}`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.some((u: any) => u.id === sessionB.userId)).toBe(false);
  });

  it('DELETE /api/users/:id/block — user A unblocks user B', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/users/${sessionB.userId}/block`)
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(res.status).toBe(200);

    const listRes = await request(app.getHttpServer())
      .get('/api/users/blocked')
      .set('Authorization', `Bearer ${sessionA.token}`);

    expect(listRes.body).not.toContain(sessionB.userId);
  });

  it('POST /api/chats/:id/messages — user B can send message after unblock', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chats/${chatId}/messages`)
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ content: 'Hello after unblock', type: 'TEXT' });

    expect(res.status).toBe(201);
  });
});
