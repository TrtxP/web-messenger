import { HttpException, HttpStatus } from '@nestjs/common';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { UsersStore } from '../users.store';
import { AuthTokensStore } from './auth-tokens.store';

export class AuthPasswordStore {
  private readonly devResetCodes = new Map<string, string>();
  private readonly failedAttempts = new Map<string, { count: number; lastTime: number }>();

  constructor(
    private readonly pool: Pool,
    private readonly usersStore: UsersStore,
    private readonly tokensStore: AuthTokensStore,
  ) {}

  getDevResetCode(email: string): string {
    return this.devResetCodes.get(email.trim().toLowerCase()) || '123456';
  }

  async login(email?: string, password?: string) {
    if (!email || !password) {
      throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
    }

    const key = email.trim().toLowerCase();
    const attempt = this.failedAttempts.get(key) || { count: 0, lastTime: Date.now() };
    if (attempt.count >= 10 && Date.now() - attempt.lastTime < 60000) {
      throw new HttpException('Too many attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.pool.query(
      `SELECT id, email, username, password_hash, email_verified, about_encrypted FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()],
    );

    if (!user.rows || user.rows.length === 0) {
      attempt.count++;
      attempt.lastTime = Date.now();
      this.failedAttempts.set(key, attempt);
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) {
      attempt.count++;
      attempt.lastTime = Date.now();
      this.failedAttempts.set(key, attempt);
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    if (!user.rows[0].email_verified) {
      throw new HttpException('Email verification required. Please verify your account.', HttpStatus.BAD_REQUEST);
    }

    this.failedAttempts.delete(key);
    this.tokensStore.clearLogout(user.rows[0].id);
    const tokens = this.tokensStore.generateTokens(user.rows[0].id, user.rows[0].email);

    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: this.usersStore.publicUser(user.rows[0]),
    };
  }

  async forgotPassword(email: string) {
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    this.devResetCodes.set(email.trim().toLowerCase(), code);

    console.log(`[AUTH] Password recovery code for ${email}: ${code}`);

    await this.pool.query(
      `UPDATE users SET reset_code_hash = $1 WHERE LOWER(email) = LOWER($2) OR LOWER(username) = LOWER($2)`,
      [codeHash, email.trim()],
    );

    return { message: 'Recovery code sent' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    if (!email || !code || !newPassword) {
      throw new HttpException('Email, code, and new password are required', HttpStatus.BAD_REQUEST);
    }

    const key = `reset_${email.trim().toLowerCase()}`;
    const attempt = this.failedAttempts.get(key) || { count: 0, lastTime: Date.now() };
    if (attempt.count >= 5 && Date.now() - attempt.lastTime < 60000) {
      throw new HttpException('Too many failed reset attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
      throw new HttpException('Password does not meet strength requirements', HttpStatus.BAD_REQUEST);
    }

    const user = await this.pool.query(
      `SELECT id, reset_code_hash, email FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [email.trim()],
    );
    if (!user.rows || user.rows.length === 0 || !user.rows[0].reset_code_hash) {
      attempt.count++;
      attempt.lastTime = Date.now();
      this.failedAttempts.set(key, attempt);
      throw new HttpException('Invalid or expired recovery code', HttpStatus.BAD_REQUEST);
    }

    const codeHash = createHash('sha256').update(code.trim()).digest('hex');
    if (user.rows[0].reset_code_hash !== codeHash) {
      attempt.count++;
      attempt.lastTime = Date.now();
      this.failedAttempts.set(key, attempt);
      throw new HttpException('Invalid or expired recovery code', HttpStatus.BAD_REQUEST);
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.pool.query(
      `UPDATE users SET password_hash = $1, reset_code_hash = NULL, email_verified = TRUE, updated_at = NOW() WHERE id = $2`,
      [passwordHash, user.rows[0].id],
    );

    this.devResetCodes.delete(email.trim().toLowerCase());
    this.failedAttempts.delete(key);
    this.tokensStore.logoutUser(user.rows[0].id);

    return { message: 'Password successfully reset' };
  }
}
