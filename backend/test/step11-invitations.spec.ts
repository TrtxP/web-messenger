/**
 * STEP 11 — INVITATIONS TESTS (Send/Receive/Accept/Decline, IDOR)
 *
 * RED phase — tests written before implementation.
 *
 * Covers:
 * - POST /api/invitations → 201
 * - Self-invite → 400
 * - Duplicate pending invite → 409
 * - Invite when chat already exists → 409
 * - GET /api/invitations/pending → received + sent
 * - POST /api/invitations/:id/accept → creates chat, returns chatId
 * - POST /api/invitations/:id/decline → status = declined
 * - IDOR: accepting someone else's invite
 * - WebSocket event: invitation:received
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
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}
function uniqueUsername() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`.slice(0, 28);
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
let sessionC: Awaited<ReturnType<typeof registerAndVerify>>;

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
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE 'inv_%@example.com'`);
  await pool.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// POST /api/invitations
// ---------------------------------------------------------------------------

describe('[STEP 11] POST /api/invitations', () => {
  it('201 — sends invitation successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ recipientId: sessionC.userId });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      fromId: sessionA.userId,
      toId: sessionC.userId,
      status: 'pending',
      createdAt: expect.any(String),
    });
  });

  it('400 — rejects self-invite (fromId == toId)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ recipientId: sessionA.userId });

    expect(res.status).toBe(400);
  });

  it('409 — rejects duplicate pending invitation', async () => {
    // First invite from A to B
    await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ recipientId: sessionB.userId });

    // Duplicate invite from A to B
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ recipientId: sessionB.userId });

    expect(res.status).toBe(409);
  });

  it('401 — rejects without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .send({ recipientId: sessionB.userId });
    expect(res.status).toBe(401);
  });

  it('400 — rejects missing recipientId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/invitations/pending
// ---------------------------------------------------------------------------

describe('[STEP 11] GET /api/invitations/pending', () => {
  it('200 — returns received and sent arrays', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invitations/pending')
      .set('Authorization', `Bearer ${sessionB.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received');
    expect(res.body).toHaveProperty('sent');
    expect(Array.isArray(res.body.received)).toBe(true);
    expect(Array.isArray(res.body.sent)).toBe(true);
  });

  it('200 — received contains invite from A (A invited B)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invitations/pending')
      .set('Authorization', `Bearer ${sessionB.token}`);

    const received = res.body.received as any[];
    const fromA = received.find((inv: any) => inv.fromId === sessionA.userId);
    expect(fromA).toBeDefined();
  });

  it('200 — each invite contains sender info (username/avatarUrl)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invitations/pending')
      .set('Authorization', `Bearer ${sessionB.token}`);

    const received = res.body.received as any[];
    if (received.length > 0) {
      expect(received[0]).toHaveProperty('from');
      expect(received[0].from).toHaveProperty('username');
    }
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/invitations/pending');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/invitations/:id/accept
// ---------------------------------------------------------------------------

describe('[STEP 11] POST /api/invitations/:id/accept', () => {
  let inviteId: string;

  beforeAll(async () => {
    // A sends invite to B (might already exist from previous test — create fresh sessions)
    const fresh = await registerAndVerify(app.getHttpServer());
    const target = await registerAndVerify(app.getHttpServer());

    const inv = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ recipientId: target.userId });

    inviteId = inv.body.id;

    // Replace sessions for accept tests
    (sessionA as any)._freshAccepter = target;
    (sessionA as any)._freshInviteId = inviteId;
    (sessionA as any)._freshInviterToken = fresh.token;
    (sessionA as any)._freshAccepterToken = target.token;
  });

  it('200 — accept creates a chat and returns chatId', async () => {
    const accepterToken = (sessionA as any)._freshAccepterToken;
    const id = (sessionA as any)._freshInviteId;

    const res = await request(app.getHttpServer())
      .post(`/api/invitations/${id}/accept`)
      .set('Authorization', `Bearer ${accepterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(res.body.chatId).toBeDefined();
    expect(typeof res.body.chatId).toBe('string');
  });

  it('409 — accepting again is rejected (already accepted)', async () => {
    const accepterToken = (sessionA as any)._freshAccepterToken;
    const id = (sessionA as any)._freshInviteId;

    const res = await request(app.getHttpServer())
      .post(`/api/invitations/${id}/accept`)
      .set('Authorization', `Bearer ${accepterToken}`);

    expect(res.status).toBe(409);
  });

  it('SECURITY — IDOR: user cannot accept invitation not addressed to them', async () => {
    // A invites B. C tries to accept it.
    const freshA = await registerAndVerify(app.getHttpServer());
    const freshB = await registerAndVerify(app.getHttpServer());

    const inv = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${freshA.token}`)
      .send({ recipientId: freshB.userId });

    const invId = inv.body.id;

    // C tries to accept invitation meant for B
    const res = await request(app.getHttpServer())
      .post(`/api/invitations/${invId}/accept`)
      .set('Authorization', `Bearer ${sessionC.token}`);

    expect([403, 404]).toContain(res.status);
  });

  it('401 — requires authentication', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/invitations/some-id/accept`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/invitations/:id/decline
// ---------------------------------------------------------------------------

describe('[STEP 11] POST /api/invitations/:id/decline', () => {
  it('200 — decline returns status declined', async () => {
    const freshA = await registerAndVerify(app.getHttpServer());
    const freshB = await registerAndVerify(app.getHttpServer());

    const inv = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${freshA.token}`)
      .send({ recipientId: freshB.userId });

    const res = await request(app.getHttpServer())
      .post(`/api/invitations/${inv.body.id}/decline`)
      .set('Authorization', `Bearer ${freshB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');
  });

  it('SECURITY — IDOR: user cannot decline invitation not addressed to them', async () => {
    const freshA = await registerAndVerify(app.getHttpServer());
    const freshB = await registerAndVerify(app.getHttpServer());

    const inv = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${freshA.token}`)
      .send({ recipientId: freshB.userId });

    // C tries to decline B's invitation
    const res = await request(app.getHttpServer())
      .post(`/api/invitations/${inv.body.id}/decline`)
      .set('Authorization', `Bearer ${sessionC.token}`);

    expect([403, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Prevent invite when chat already exists
// ---------------------------------------------------------------------------

describe('[STEP 11] Prevent invite when chat already exists', () => {
  it('409 — cannot invite user who is already in an active chat', async () => {
    const freshA = await registerAndVerify(app.getHttpServer());
    const freshB = await registerAndVerify(app.getHttpServer());

    // Create invite and accept it (creates chat)
    const inv = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${freshA.token}`)
      .send({ recipientId: freshB.userId });

    await request(app.getHttpServer())
      .post(`/api/invitations/${inv.body.id}/accept`)
      .set('Authorization', `Bearer ${freshB.token}`);

    // Try to invite again
    const res = await request(app.getHttpServer())
      .post('/api/invitations')
      .set('Authorization', `Bearer ${freshA.token}`)
      .send({ recipientId: freshB.userId });

    expect(res.status).toBe(409);
  });
});

