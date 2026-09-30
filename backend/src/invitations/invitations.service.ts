import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Injectable()
export class InvitationsService {
  constructor(private readonly store: StoreService) {}

  invite(fromId: string, toId: string) {
    return this.store.invite(fromId, toId);
  }
}

