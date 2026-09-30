import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Injectable()
export class UsersService {
  constructor(private readonly store: StoreService) {}

  search(query?: string) {
    return this.store.users(query ?? '');
  }
}

