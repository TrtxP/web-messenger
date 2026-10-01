import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { CryptoService } from '../crypto/crypto.service';
import { createDatabasePool, initDatabaseSchema } from './database';
import { AuthStore } from './auth.store';
import { UsersStore } from './users.store';
import { InvitationsStore } from './invitations.store';
import { ChatsStore } from './chats.store';
import { MediaStore } from './media.store';

export * from './types';

@Injectable()
export class StoreService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private authStore: AuthStore;
  private usersStore: UsersStore;
  private invitationsStore: InvitationsStore;
  private chatsStore: ChatsStore;
  private mediaStore: MediaStore;

  constructor(private readonly crypto: CryptoService) {
    this.pool = createDatabasePool();
    this.usersStore = new UsersStore(this.pool, this.crypto);
    this.authStore = new AuthStore(this.pool, this.usersStore);
    this.invitationsStore = new InvitationsStore(this.pool);
    this.chatsStore = new ChatsStore(this.pool, this.crypto);
    this.mediaStore = new MediaStore(this.pool);
  }

  async onModuleInit() {
    await initDatabaseSchema(this.pool);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  generateTokens(userId: string, email: string) {
    return this.authStore.generateTokens(userId, email);
  }

  verifyAccessToken(token: string) {
    return this.authStore.verifyAccessToken(token);
  }

  verifyRefreshToken(refreshToken: string) {
    return this.authStore.verifyRefreshToken(refreshToken);
  }

  invalidateToken(token: string) {
    return this.authStore.invalidateToken(token);
  }

  logoutUser(userId: string) {
    return this.authStore.logoutUser(userId);
  }

  getDevVerificationCode(email: string): string {
    return this.authStore.getDevVerificationCode(email);
  }

  getDevResetCode(email: string): string {
    return this.authStore.getDevResetCode(email);
  }

  register(email: string, password: string, username: string) {
    return this.authStore.register(email, password, username);
  }

  verifyEmail(email: string, code: string) {
    return this.authStore.verifyEmail(email, code);
  }

  resendVerificationCode(email: string) {
    return this.authStore.resendVerificationCode(email);
  }

  login(email?: string, password?: string) {
    return this.authStore.login(email, password);
  }

  forgotPassword(email: string) {
    return this.authStore.forgotPassword(email);
  }

  resetPassword(email: string, code: string, newPassword: string) {
    return this.authStore.resetPassword(email, code, newPassword);
  }

  publicUser(row: any) {
    return this.usersStore.publicUser(row);
  }

  getUserById(id: string) {
    return this.usersStore.getUserById(id);
  }

  updateProfile(userId: string, username?: string, about?: string) {
    return this.usersStore.updateProfile(userId, username, about);
  }

  updateAvatar(userId: string, avatarPath: string) {
    return this.usersStore.updateAvatar(userId, avatarPath);
  }

  searchUsers(currentUserId: string, query = '') {
    return this.usersStore.searchUsers(currentUserId, query);
  }

  users(query = '') {
    return this.usersStore.users(query);
  }

  blockUser(blockerId: string, blockedId: string) {
    return this.usersStore.blockUser(blockerId, blockedId);
  }

  unblockUser(blockerId: string, blockedId: string) {
    return this.usersStore.unblockUser(blockerId, blockedId);
  }

  getBlockedUserIds(blockerId: string) {
    return this.usersStore.getBlockedUserIds(blockerId);
  }

  getBlockedUsers(blockerId: string) {
    return this.usersStore.getBlockedUsers(blockerId);
  }

  isBlocked(blockerId: string, blockedId: string) {
    return this.usersStore.isBlocked(blockerId, blockedId);
  }

  isBlockedEither(userA: string, userB: string) {
    return this.usersStore.isBlockedEither(userA, userB);
  }

  saveFcmToken(userId: string, token: string) {
    return this.usersStore.saveFcmToken(userId, token);
  }

  createInvitation(fromId: string, toId: string) {
    return this.invitationsStore.createInvitation(fromId, toId);
  }

  getPendingInvitations(userId: string) {
    return this.invitationsStore.getPendingInvitations(userId);
  }

  acceptInvitation(inviteId: string, currentUserId: string) {
    return this.invitationsStore.acceptInvitation(inviteId, currentUserId);
  }

  declineInvitation(inviteId: string, currentUserId: string) {
    return this.invitationsStore.declineInvitation(inviteId, currentUserId);
  }

  invite(fromId: string, toId: string) {
    return this.invitationsStore.invite(fromId, toId);
  }

  getChats(userId: string, archived = false) {
    return this.chatsStore.getChats(userId, archived);
  }

  setChatArchive(chatId: string, userId: string, archived: boolean) {
    return this.chatsStore.setChatArchive(chatId, userId, archived);
  }

  deleteChat(chatId: string, userId: string) {
    return this.chatsStore.deleteChat(chatId, userId);
  }

  setChatMute(chatId: string, userId: string, muted: boolean) {
    return this.chatsStore.setChatMute(chatId, userId, muted);
  }

  getMessages(chatId: string, userId: string, limit = 50) {
    return this.chatsStore.getMessages(chatId, userId, limit);
  }

  markChatRead(chatId: string, userId: string) {
    return this.chatsStore.markChatRead(chatId, userId);
  }

  markMessagesDelivered(chatId: string, userId: string) {
    return this.chatsStore.markMessagesDelivered(chatId, userId);
  }

  sendMessage(chatId: string, senderId: string, content: string, type = 'TEXT', mediaId?: string) {
    return this.chatsStore.sendMessage(chatId, senderId, content, type, mediaId);
  }

  editMessage(messageId: string, senderId: string, newContent: string) {
    return this.chatsStore.editMessage(messageId, senderId, newContent);
  }

  deleteMessage(messageId: string, senderId: string) {
    return this.chatsStore.deleteMessage(messageId, senderId);
  }

  chats(userId: string) {
    return this.chatsStore.chats(userId);
  }

  messages(chatId: string) {
    return this.chatsStore.messages(chatId);
  }

  message(chatId: string, senderId: string, text: string) {
    return this.chatsStore.message(chatId, senderId, text);
  }

  searchMessages(chatId: string, userId: string, query: string, limit = 50) {
    return this.chatsStore.searchMessages(chatId, userId, query, limit);
  }

  createGroup(creatorId: string, name: string, memberIds: string[]) {
    return this.chatsStore.createGroup(creatorId, name, memberIds);
  }

  getGroupInfo(groupId: string, userId: string) {
    return this.chatsStore.getGroupInfo(groupId, userId);
  }

  updateGroup(groupId: string, userId: string, name?: string, avatarPath?: string) {
    return this.chatsStore.updateGroup(groupId, userId, name, avatarPath);
  }

  inviteToGroup(groupId: string, fromId: string, userIds: string[]) {
    return this.chatsStore.inviteToGroup(groupId, fromId, userIds);
  }

  getPendingGroupInvitations(userId: string) {
    return this.chatsStore.getPendingGroupInvitations(userId);
  }

  getGroupPendingInvitations(groupId: string, userId: string) {
    return this.chatsStore.getGroupPendingInvitations(groupId, userId);
  }

  acceptGroupInvitation(invId: string, userId: string) {
    return this.chatsStore.acceptGroupInvitation(invId, userId);
  }

  declineGroupInvitation(invId: string, userId: string) {
    return this.chatsStore.declineGroupInvitation(invId, userId);
  }

  removeGroupMember(groupId: string, requesterId: string, targetUserId: string) {
    return this.chatsStore.removeGroupMember(groupId, requesterId, targetUserId);
  }

  createPoll(chatId: string, creatorId: string, question: string, options: string[], isAnonymous = false) {
    return this.chatsStore.createPoll(chatId, creatorId, question, options, isAnonymous);
  }

  getPoll(pollId: string, userId: string) {
    return this.chatsStore.getPoll(pollId, userId);
  }

  votePoll(pollId: string, userId: string, optionId: string) {
    return this.chatsStore.votePoll(pollId, userId, optionId);
  }

  retractPollVote(pollId: string, userId: string) {
    return this.chatsStore.retractPollVote(pollId, userId);
  }

  closePoll(pollId: string, userId: string) {
    return this.chatsStore.closePoll(pollId, userId);
  }

  saveMediaRecord(
    mediaId: string,
    uploaderId: string,
    filePath: string,
    iv: string,
    tag: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    return this.mediaStore.saveMediaRecord(mediaId, uploaderId, filePath, iv, tag, mimeType, sizeBytes);
  }

  getMediaRecord(mediaId: string) {
    return this.mediaStore.getMediaRecord(mediaId);
  }

  getPool(): Pool {
    return this.pool;
  }
}
