import { Pool } from 'pg';
import { CryptoService } from '../crypto/crypto.service';
import {
  ChatConversationsStore,
  ChatMessagesStore,
  ChatGroupsStore,
  ChatPollsStore,
} from './chats';

export * from './chats';

export class ChatsStore {
  readonly conversations: ChatConversationsStore;
  readonly messagesStore: ChatMessagesStore;
  readonly groupsStore: ChatGroupsStore;
  readonly pollsStore: ChatPollsStore;

  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {
    this.conversations = new ChatConversationsStore(this.pool, this.crypto);
    this.messagesStore = new ChatMessagesStore(this.pool, this.crypto);
    this.groupsStore = new ChatGroupsStore(this.pool);
    this.pollsStore = new ChatPollsStore(this.pool, this.crypto);
  }


  async getChats(userId: string, archived = false) {
    return this.conversations.getChats(userId, archived);
  }

  async setChatArchive(chatId: string, userId: string, archived: boolean) {
    return this.conversations.setChatArchive(chatId, userId, archived);
  }

  async deleteChat(chatId: string, userId: string) {
    return this.conversations.deleteChat(chatId, userId);
  }

  async setChatMute(chatId: string, userId: string, muted: boolean) {
    return this.conversations.setChatMute(chatId, userId, muted);
  }

  async chats(userId: string) {
    return this.conversations.chats(userId);
  }


  async getMessages(chatId: string, userId: string, limit = 50) {
    return this.messagesStore.getMessages(chatId, userId, limit);
  }

  async markChatRead(chatId: string, userId: string) {
    return this.messagesStore.markChatRead(chatId, userId);
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    type = 'TEXT',
    mediaId?: string,
  ) {
    return this.messagesStore.sendMessage(chatId, senderId, content, type, mediaId);
  }

  async markMessagesDelivered(chatId: string, userId: string) {
    return this.messagesStore.markMessagesDelivered(chatId, userId);
  }

  async editMessage(messageId: string, senderId: string, newContent: string) {
    return this.messagesStore.editMessage(messageId, senderId, newContent);
  }

  async deleteMessage(messageId: string, senderId: string) {
    return this.messagesStore.deleteMessage(messageId, senderId);
  }

  async messages(chatId: string) {
    return this.messagesStore.messages(chatId);
  }

  async message(chatId: string, senderId: string, text: string) {
    return this.messagesStore.message(chatId, senderId, text);
  }

  async searchMessages(chatId: string, userId: string, query: string, limit = 50) {
    return this.messagesStore.searchMessages(chatId, userId, query, limit);
  }


  async createGroup(creatorId: string, name: string, memberIds: string[]) {
    return this.groupsStore.createGroup(creatorId, name, memberIds);
  }

  async getGroupInfo(groupId: string, userId: string) {
    return this.groupsStore.getGroupInfo(groupId, userId);
  }

  async updateGroup(groupId: string, userId: string, name?: string, avatarPath?: string) {
    return this.groupsStore.updateGroup(groupId, userId, name, avatarPath);
  }

  async inviteToGroup(groupId: string, fromId: string, userIds: string[]) {
    return this.groupsStore.inviteToGroup(groupId, fromId, userIds);
  }

  async getPendingGroupInvitations(userId: string) {
    return this.groupsStore.getPendingGroupInvitations(userId);
  }

  async acceptGroupInvitation(invId: string, userId: string) {
    return this.groupsStore.acceptGroupInvitation(invId, userId);
  }

  async declineGroupInvitation(invId: string, userId: string) {
    return this.groupsStore.declineGroupInvitation(invId, userId);
  }

  async removeGroupMember(groupId: string, requesterId: string, targetUserId: string) {
    return this.groupsStore.removeGroupMember(groupId, requesterId, targetUserId);
  }


  async createPoll(
    chatId: string,
    creatorId: string,
    question: string,
    options: string[],
    isAnonymous = false,
  ) {
    return this.pollsStore.createPoll(chatId, creatorId, question, options, isAnonymous);
  }

  async getPoll(pollId: string, userId: string) {
    return this.pollsStore.getPoll(pollId, userId);
  }

  async votePoll(pollId: string, userId: string, optionId: string) {
    return this.pollsStore.votePoll(pollId, userId, optionId);
  }

  async retractPollVote(pollId: string, userId: string) {
    return this.pollsStore.retractPollVote(pollId, userId);
  }

  async closePoll(pollId: string, userId: string) {
    return this.pollsStore.closePoll(pollId, userId);
  }
}
