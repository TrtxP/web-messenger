import { HttpException, HttpStatus } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { UsersStore } from '../users.store';
import { AuthTokensStore } from './auth-tokens.store';

export class AuthVerificationStore {
  private readonly devVerificationCodes = new Map<string, string>();

  constructor(
    private readonly pool: Pool,
    private readonly usersStore: UsersStore,
    private readonly tokensStore: AuthTokensStore,
  ) {}

  getDevVerificationCode(email: string): string {
    return this.devVerificationCodes.get(email.trim().toLowerCase()) || '123456';
  }

  async register(email: string, password: string, username: string) {
    if (!email || !password || !username) {
      throw new HttpException('All fields are required', HttpStatus.BAD_REQUEST);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username.trim())) {
      throw new HttpException('Username must be 3-30 alphanumeric characters or underscores', HttpStatus.BAD_REQUEST);
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
      throw new HttpException('Password does not meet strength requirements', HttpStatus.BAD_REQUEST);
    }

    const check = await this.pool.query(
      `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)`,
      [email.trim(), username.trim()],
    );
    if (check.rowCount && check.rowCount > 0) {
      throw new HttpException('Email or username is already taken', HttpStatus.CONFLICT);
    }

    const id = randomUUID();
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    this.devVerificationCodes.set(email.trim().toLowerCase(), code);

    console.log(`[AUTH] Verification code for ${email}: ${code}`);

    await this.pool.query(
      `INSERT INTO users (id, email, username, password_hash, email_verified, verification_code_hash, about_encrypted)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [id, email.trim().toLowerCase(), username.trim(), passwordHash, codeHash, ''],
    );

    return {
      id,
      email: email.trim().toLowerCase(),
      username: username.trim(),
      requiresVerification: true,
    };
  }

  async verifyEmail(email: string, code: string) {
    if (!email || !code) {
      throw new HttpException('Email and code are required', HttpStatus.BAD_REQUEST);
    }

    const user = await this.pool.query(
      `SELECT id, email, username, verification_code_hash, about_encrypted FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [email.trim()],
    );
    if (!user.rows || user.rows.length === 0) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const codeHash = createHash('sha256').update(code.trim()).digest('hex');
    if (user.rows[0].verification_code_hash !== codeHash) {
      throw new HttpException('Invalid verification code', HttpStatus.BAD_REQUEST);
    }

    await this.pool.query(
      `UPDATE users SET email_verified = TRUE, verification_code_hash = NULL WHERE id = $1`,
      [user.rows[0].id],
    );

    this.tokensStore.clearLogout(user.rows[0].id);
    const tokens = this.tokensStore.generateTokens(user.rows[0].id, user.rows[0].email);
    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: this.usersStore.publicUser(user.rows[0]),
    };
  }

  async resendVerificationCode(email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.pool.query(
      `SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [email.trim()],
    );
    if (!user.rows || user.rows.length === 0) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    this.devVerificationCodes.set(user.rows[0].email.toLowerCase(), code);
    console.log(`[AUTH] Verification code for ${user.rows[0].email}: ${code}`);
    await this.pool.query(
      `UPDATE users SET verification_code_hash = $1 WHERE id = $2`,
      [codeHash, user.rows[0].id],
    );
    return { message: 'Verification code sent' };
  }
}
