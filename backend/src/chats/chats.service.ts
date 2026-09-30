import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Injectable()
export class ChatsService {
  constructor(private readonly store: StoreService) {}

  getChats(userId: string) {
    return this.store.chats(userId);
  }

  getMessages(chatId: string) {
    return this.store.messages(chatId);
  }

  sendMessage(chatId: string, senderId: string, text: string) {
    return this.store.message(chatId, senderId, text);
  }
}

