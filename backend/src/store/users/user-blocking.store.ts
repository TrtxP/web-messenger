import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { PublicUser } from '../types';
import { UserProfileStore } from './user-profile.store';

export class UserBlockingStore {
  constructor(
    private readonly pool: Pool,
    private readonly userProfileStore: UserProfileStore,
  ) {}

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
    return res.rows.map((r) => this.userProfileStore.publicUser(r));
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
}

