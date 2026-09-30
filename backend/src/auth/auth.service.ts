import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: StoreService) {}

  register(body: { email?: string; password?: string; username?: string }) {
    return this.store.register(body.email ?? '', body.password ?? '', body.username ?? '');
  }

  verifyEmail(email: string, code: string) {
    return this.store.verifyEmail(email, code);
  }

  login(body: { email?: string; password?: string }) {
    return this.store.login(body.email, body.password);
  }

  forgotPassword(email: string) {
    return this.store.forgotPassword(email);
  }

  resetPassword(email: string, code: string, newPassword: string) {
    return this.store.resetPassword(email, code, newPassword);
  }
}
