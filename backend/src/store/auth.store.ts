import { HttpException, HttpStatus } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { UsersStore } from './users.store';

export class AuthStore {
  private invalidatedTokens = new Set<string>();
  private devVerificationCodes = new Map<string, string>();
  private devResetCodes = new Map<string, string>();
  private failedAttempts = new Map<string, { count: number; lastTime: number }>();
  private userLoggedOutAt = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly usersStore: UsersStore,
  ) {}

  generateTokens(userId: string, email: string) {
    const accessSecret = process.env.JWT_SECRET || 'mobile_messenger_jwt_access_secret_key_2026_super_secure';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'mobile_messenger_jwt_refresh_secret_key_2026_super_secure';

    const token = jwt.sign({ sub: userId, email }, accessSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: userId, email }, refreshSecret, { expiresIn: '30d' });

    return { token, refreshToken };
  }

  verifyAccessToken(token: string): any {
    if (this.invalidatedTokens.has(token)) {
      throw new HttpException('Token has been invalidated', HttpStatus.UNAUTHORIZED);
    }
    const accessSecret = process.env.JWT_SECRET || 'mobile_messenger_jwt_access_secret_key_2026_super_secure';
    try {
      const decoded = jwt.verify(token, accessSecret) as any;
      const loggedOutTime = this.userLoggedOutAt.get(decoded.sub);
      if (loggedOutTime && (decoded.iat ? decoded.iat * 1000 <= loggedOutTime : true)) {
        throw new HttpException('Token has been invalidated', HttpStatus.UNAUTHORIZED);
      }
      return decoded;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }
  }

  verifyRefreshToken(refreshToken: string): any {
    if (this.invalidatedTokens.has(refreshToken)) {
      throw new HttpException('Token has been invalidated', HttpStatus.UNAUTHORIZED);
    }
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'mobile_messenger_jwt_refresh_secret_key_2026_super_secure';
    try {
      const decoded = jwt.verify(refreshToken, refreshSecret) as any;
      const loggedOutTime = this.userLoggedOutAt.get(decoded.sub);
      if (loggedOutTime && (decoded.iat ? decoded.iat * 1000 <= loggedOutTime : true)) {
        throw new HttpException('Token has been invalidated', HttpStatus.UNAUTHORIZED);
      }
      return decoded;
    } catch {
      throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
    }
  }

  invalidateToken(token: string) {
    this.invalidatedTokens.add(token);
  }

  logoutUser(userId: string) {
    this.userLoggedOutAt.set(userId, Date.now());
  }

  getDevVerificationCode(email: string): string {
    return this.devVerificationCodes.get(email.trim().toLowerCase()) || '123456';
  }

  getDevResetCode(email: string): string {
    return this.devResetCodes.get(email.trim().toLowerCase()) || '123456';
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

    this.userLoggedOutAt.delete(user.rows[0].id);
    const tokens = this.generateTokens(user.rows[0].id, user.rows[0].email);
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
    this.userLoggedOutAt.delete(user.rows[0].id);
    const tokens = this.generateTokens(user.rows[0].id, user.rows[0].email);

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
    this.logoutUser(user.rows[0].id);

    return { message: 'Password successfully reset' };
  }
}
