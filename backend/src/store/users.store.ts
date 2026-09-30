import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CryptoService } from '../crypto/crypto.service';
import { PublicUser } from './types';
import { th } from '@faker-js/faker';

export class UsersStore {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {}

  publicUser(row: any): PublicUser {
    const about = row.about_encrypted ? this.crypto.decryptText(row.about_encrypted) : (row.about ?? '');
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      about: about || '',
      avatarUrl: row.avatar_path ? `/api/media/stream/${row.id}` : null,
    };
  }

  async getUserById(id: string) {
    const res = await this.pool.query(
      `SELECT id, email, username, about_encrypted, avatar_path FROM users WHERE id = $1`,
      [id],
    );
    if (!res.rows || res.rows.length === 0) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return this.publicUser(res.rows[0]);
  }

  async updateProfile(userId: string, username?: string, about?: string) {
    const userRes = await this.pool.query(`SELECT id, username FROM users WHERE id = $1`, [userId]);
    if (!userRes.rows || userRes.rows.length === 0) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const currentUsername = userRes.rows[0].username;

    if (username !== undefined) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username.trim())) {
        throw new HttpException('Username must be 3-30 characters', HttpStatus.BAD_REQUEST);
      }
      if (currentUsername.toLowerCase() !== username.trim().toLowerCase()) {
        const conflict = await this.pool.query(
          `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`,
          [username.trim(), userId],
        );
        if (conflict.rowCount && conflict.rowCount > 0) {
          throw new HttpException('Username is already taken', HttpStatus.CONFLICT);
        }
      }
      await this.pool.query(`UPDATE users SET username = $1 WHERE id = $2`, [username.trim(), userId]);
    }

    if (about !== undefined) {
      const encryptedAbout = this.crypto.encryptText(about);
      await this.pool.query(`UPDATE users SET about_encrypted = $1 WHERE id = $2`, [encryptedAbout, userId]);
    }

    return this.getUserById(userId);
  }

  async updateAvatar(userId: string, avatarPath: string) {
    await this.pool.query(`UPDATE users SET avatar_path = $1 WHERE id = $2`, [avatarPath, userId]);
    return { avatarUrl: `/api/media/stream/${userId}` };
  }

  async searchUsers(currentUserId: string, query = '') {
    const q = `%${query.trim().toLowerCase()}%`;
    const res = await this.pool.query(
      `SELECT u.id, u.email, u.username, u.avatar_path,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM chat_members cm1
                  JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
                  WHERE cm1.user_id = $1 AND cm2.user_id = u.id
                ) THEN 'contact'
                WHEN EXISTS (
                  SELECT 1 FROM invitations
                  WHERE from_id = $1 AND to_id = u.id AND status = 'pending'
                ) THEN 'pending'
                ELSE 'none'
              END AS relationship
       FROM users u
       WHERE u.id != $1 AND (LOWER(u.email) LIKE $2 OR LOWER(u.username) LIKE $2)
         AND u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $1)
         AND u.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = $1)
       ORDER BY u.username ASC`,
      [currentUserId, q],
    );

    return res.rows.map(r => ({
      id: r.id,
      email: r.email,
      username: r.username,
      avatarUrl: r.avatar_path ? `/api/media/stream/${r.id}` : null,
      relationship: r.relationship,
    }));
  }

  async users(query = '') {
    return this.searchUsers('', query);
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new HttpException('Cannot block yourself', HttpStatus.BAD_REQUEST);
    }
    const target = await this.pool.query(`SELECT 1 FROM users WHERE id = $1`, [blockedId]);
    if (!target.rowCount) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO blocked_users (id, blocker_id, blocked_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [id, blockerId, blockedId],
    );
    return { ok: true, blockedId };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.pool.query(
      `DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId],
    );
    return { ok: true, unblockedId: blockedId };
  }

  async getBlockedUserIds(blockedId: string): Promise<PublicUser[]> {
    const res = await this.pool.query(
      `SELECT u.id, u.email, u.username,
      u.about_encrypted, u.avatar_path
      FROM blocked_users b
      JOIN users u ON b.blocked_id = u.id
      WHERE b.blocker_id = $1
      ORDER BY u.username ASC`,
      [blockedId],
    );
    return res.rows.map(r => this.publicUser(r));
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId],
    );
    return Boolean(res.rowCount && res.rowCount > 0);
  }

  async isBlockedEither(userA: string, userB: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [userA, userB],
    );
    return Boolean(res.rowCount && res.rowCount > 0);
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    await this.pool.query('UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [token, userId]);
  }
}
