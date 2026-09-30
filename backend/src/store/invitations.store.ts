import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { th } from '@faker-js/faker';

export class InvitationsStore {
  constructor(private readonly pool: Pool) { }

  async createInvitation(fromId: string, toId: string) {
    if (!toId) {
      throw new HttpException('Recipient is required', HttpStatus.BAD_REQUEST);
    }
    if (fromId === toId) {
      throw new HttpException('Cannot invite yourself', HttpStatus.BAD_REQUEST);
    }

    const blocked = await this.pool.query(
      `SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [fromId, toId],
    );
    if (blocked.rowCount && blocked.rowCount > 0) {
      throw new HttpException('Cannot invite this user', HttpStatus.FORBIDDEN);
    }

    const existingChat = await this.pool.query(
      `SELECT cm1.chat_id FROM chat_members cm1
       JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
       WHERE cm1.user_id = $1 AND cm2.user_id = $2`,
      [fromId, toId],
    );
    if (existingChat.rowCount && existingChat.rowCount > 0) {
      throw new HttpException('Contact already in chat list', HttpStatus.CONFLICT);
    }

    const existingInvite = await this.pool.query(
      `SELECT 1 FROM invitations WHERE from_id = $1 AND to_id = $2 AND status = 'pending'`,
      [fromId, toId],
    );
    if (existingInvite.rowCount && existingInvite.rowCount > 0) {
      throw new HttpException('Invitation already sent', HttpStatus.CONFLICT);
    }

    const id = randomUUID();
    const res = await this.pool.query(
      `INSERT INTO invitations (id, from_id, to_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, from_id AS "fromId", to_id AS "toId", status, created_at AS "createdAt"`,
      [id, fromId, toId],
    );

    return res.rows[0];
  }

  async getPendingInvitations(userId: string) {
    const received = await this.pool.query(
      `SELECT i.id, i.from_id AS "fromId", i.to_id AS "toId", i.status, i.created_at AS "createdAt",
              json_build_object('id', u.id, 'username', u.username,
                'avatarUrl', CASE WHEN u.avatar_path IS NOT NULL THEN '/api/media/stream/' || u.id::text ELSE NULL END) AS "from"
       FROM invitations i
       JOIN users u ON u.id = i.from_id
       WHERE i.to_id = $1 AND i.status = 'pending'`,
      [userId],
    );

    const sent = await this.pool.query(
      `SELECT i.id, i.from_id AS "fromId", i.to_id AS "toId", i.status, i.created_at AS "createdAt",
              json_build_object('id', u.id, 'username', u.username,
                'avatarUrl', CASE WHEN u.avatar_path IS NOT NULL THEN '/api/media/stream/' || u.id::text ELSE NULL END) AS "to"
       FROM invitations i
       JOIN users u ON u.id = i.to_id
       WHERE i.from_id = $1 AND i.status = 'pending'`,
      [userId],
    );

    return {
      received: received.rows,
      sent: sent.rows,
    };
  }

  async acceptInvitation(inviteId: string, currentUserId: string) {
    const inv = await this.pool.query(`SELECT * FROM invitations WHERE id = $1`, [inviteId]);
    if (!inv.rows || inv.rows.length === 0) {
      throw new HttpException('Invitation not found', HttpStatus.NOT_FOUND);
    }
    if (inv.rows[0].to_id !== currentUserId) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }
    if (inv.rows[0].status !== 'pending') {
      throw new HttpException('Invitation already processed', HttpStatus.CONFLICT);
    }

    await this.pool.query(`UPDATE invitations SET status = 'accepted' WHERE id = $1`, [inviteId]);

    const chatId = randomUUID();
    await this.pool.query(`INSERT INTO chats (id) VALUES ($1)`, [chatId]);
    await this.pool.query(
      `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [chatId, inv.rows[0].from_id, inv.rows[0].to_id],
    );

    return { status: 'accepted', chatId, fromId: inv.rows[0].from_id };
  }

  async declineInvitation(inviteId: string, currentUserId: string) {
    const inv = await this.pool.query(`SELECT * FROM invitations WHERE id = $1`, [inviteId]);
    if (!inv.rows || inv.rows.length === 0) {
      throw new HttpException('Invitation not found', HttpStatus.NOT_FOUND);
    }
    if (inv.rows[0].to_id !== currentUserId) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }
    if (inv.rows[0].status !== 'pending') {
      throw new HttpException('Invitation already processed', HttpStatus.CONFLICT);
    }

    await this.pool.query(`UPDATE invitations SET status = 'declined' WHERE id = $1`, [inviteId]);
    return { status: 'declined', fromId: inv.rows[0].from_id };
  }

  async cancelInvitation(inviteId: string, currentUserId: string) {
    const inv = await this.pool.query(`SELECT * FROM invitations WHERE id = $1`, [inviteId]);
    if (!inv.rows || inv.rows.length === 0) {
      throw new HttpException('Invitation not found', HttpStatus.NOT_FOUND);
    }
    if (inv.rows[0].from_id !== currentUserId) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }
    if (inv.rows[0].status !== 'pending') {
      throw new HttpException('Invitation already processed', HttpStatus.CONFLICT);
    }

    await this.pool.query(`UPDATE invitations SET status = 'cancelled' WHERE id = $1`, [inviteId]);
    return { status: 'cancelled', toId: inv.rows[0].to_id };
  }

  async invite(fromId: string, toId: string) {
    return this.createInvitation(fromId, toId);
  }
}
