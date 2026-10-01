import { Pool } from 'pg';
import { CryptoService } from '../crypto/crypto.service';
import { PublicUser } from './types';
import {
  UserProfileStore,
  UserSearchStore,
  UserBlockingStore,
} from './users';

export * from './users';

export class UsersStore {
  readonly profile: UserProfileStore;
  readonly search: UserSearchStore;
  readonly blocking: UserBlockingStore;

  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {
    this.profile = new UserProfileStore(this.pool, this.crypto);
    this.search = new UserSearchStore(this.pool);
    this.blocking = new UserBlockingStore(this.pool, this.profile);
  }

  publicUser(row: any): PublicUser {
    return this.profile.publicUser(row);
  }

  async getUserById(id: string) {
    return this.profile.getUserById(id);
  }

  async updateProfile(userId: string, username?: string, about?: string) {
    return this.profile.updateProfile(userId, username, about);
  }

  async updateAvatar(userId: string, avatarPath: string) {
    return this.profile.updateAvatar(userId, avatarPath);
  }

  async searchUsers(currentUserId: string, query = '') {
    return this.search.searchUsers(currentUserId, query);
  }

  async users(query = '') {
    return this.search.users(query);
  }

  async blockUser(blockerId: string, blockedId: string) {
    return this.blocking.blockUser(blockerId, blockedId);
  }

  async unblockUser(blockerId: string, blockedId: string) {
    return this.blocking.unblockUser(blockerId, blockedId);
  }

  async getBlockedUserIds(blockedId: string): Promise<PublicUser[]> {
    return this.blocking.getBlockedUserIds(blockedId);
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    return this.blocking.isBlocked(blockerId, blockedId);
  }

  async isBlockedEither(userA: string, userB: string): Promise<boolean> {
    return this.blocking.isBlockedEither(userA, userB);
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    return this.profile.saveFcmToken(userId, token);
  }
}
