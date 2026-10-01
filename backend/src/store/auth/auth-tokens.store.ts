import { HttpException, HttpStatus } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export class AuthTokensStore {
  private readonly invalidatedTokens = new Set<string>();
  private readonly userLoggedOutAt = new Map<string, number>();

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

  clearLogout(userId: string) {
    this.userLoggedOutAt.delete(userId);
  }
}
