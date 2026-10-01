import { HttpException, HttpStatus } from '@nestjs/common';
import { Pool } from 'pg';
import { CryptoService } from '../../crypto/crypto.service';
import { PublicUser } from '../types';

export class UserProfileStore {
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

  async saveFcmToken(userId: string, token: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET fcm_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [token, userId],
    );
  }
}

