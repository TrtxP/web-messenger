import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly store: StoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.resume();
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      request.resume();
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      const decoded = this.store.verifyAccessToken(token);
      request.user = { id: decoded.sub, email: decoded.email };
      return true;
    } catch (e) {
      request.resume();
      throw e;
    }
  }
}

