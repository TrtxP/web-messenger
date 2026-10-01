import { Pool } from 'pg';
import { UsersStore } from './users.store';
import {
  AuthTokensStore,
  AuthVerificationStore,
  AuthPasswordStore,
} from './auth';

export * from './auth';

export class AuthStore {
  readonly tokens: AuthTokensStore;
  readonly verification: AuthVerificationStore;
  readonly passwordAuth: AuthPasswordStore;

  constructor(
    private readonly pool: Pool,
    private readonly usersStore: UsersStore,
  ) {
    this.tokens = new AuthTokensStore();
    this.verification = new AuthVerificationStore(this.pool, this.usersStore, this.tokens);
    this.passwordAuth = new AuthPasswordStore(this.pool, this.usersStore, this.tokens);
  }

  generateTokens(userId: string, email: string) {
    return this.tokens.generateTokens(userId, email);
  }

  verifyAccessToken(token: string): any {
    return this.tokens.verifyAccessToken(token);
  }

  verifyRefreshToken(refreshToken: string): any {
    return this.tokens.verifyRefreshToken(refreshToken);
  }

  invalidateToken(token: string) {
    this.tokens.invalidateToken(token);
  }

  logoutUser(userId: string) {
    this.tokens.logoutUser(userId);
  }

  getDevVerificationCode(email: string): string {
    return this.verification.getDevVerificationCode(email);
  }

  getDevResetCode(email: string): string {
    return this.passwordAuth.getDevResetCode(email);
  }

  async register(email: string, password: string, username: string) {
    return this.verification.register(email, password, username);
  }

  async verifyEmail(email: string, code: string) {
    return this.verification.verifyEmail(email, code);
  }

  async resendVerificationCode(email: string) {
    return this.verification.resendVerificationCode(email);
  }

  async login(email?: string, password?: string) {
    return this.passwordAuth.login(email, password);
  }

  async forgotPassword(email: string) {
    return this.passwordAuth.forgotPassword(email);
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    return this.passwordAuth.resetPassword(email, code, newPassword);
  }
}
