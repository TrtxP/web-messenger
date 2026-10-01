import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { StoreService } from '../store/store.service';
import { th } from '@faker-js/faker';

@WebSocketGateway({
  namespace: '/messenger',
  cors: {
    origin: '*',
  },
})
export class MessengerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets = new Map<string, Set<string>>();
  private socketUsers = new Map<string, string>();
  private typingRateLimits = new Map<string, number>();
  private userLastSeen = new Map<string, number>();
  private chatActivities = new Map<string, { activity: string; updatedAt: number }>();

  constructor(private readonly store: StoreService) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('unauthorized: missing token'));
      }

      try {
        const decoded = this.store.verifyAccessToken(token);
        (socket as any).userId = decoded.sub;
        return next();
      } catch (err: any) {
        return next(new Error('unauthorized: ' + (err.message || 'invalid token')));
      }
    });
  }

  isUserOnline(userId: string): boolean {
    const lastSeen = this.userLastSeen.get(userId) ?? 0;
    return (this.userSockets.get(userId)?.size ?? 0) > 0 ||
      Date.now() - lastSeen < 15000;
  }

  markUserOnline(userId: string): void {
    this.userLastSeen.set(userId, Date.now());
  }

  getUserLastSeenAt(userId: string): string | null {
    const timestamp = this.userLastSeen.get(userId);
    return timestamp == null ? null : new Date(timestamp).toISOString();
  }

  setChatActivity(chatId: string, userId: string, activity: string | null): void {
    const key = `${chatId}:${userId}`;
    if (!activity) {
      this.chatActivities.delete(key);
      return;
    }
    this.chatActivities.set(key, { activity, updatedAt: Date.now() });
  }

  getChatActivity(chatId: string, userId: string): string | null {
    const key = `${chatId}:${userId}`;
    const current = this.chatActivities.get(key);
    if (!current || Date.now() - current.updatedAt >= 12000) {
      this.chatActivities.delete(key);
      return null;
    }
    return current.activity;
  }

  notifyChatDeleted(chatId: string, participantIds: string[]): void {
    for (const userId of participantIds) {
      this.server?.to(`user:${userId}`).emit('chat:deleted', { chatId });
    }
  }

  notifyGroupInvitation(targetUserId: string, payload: { chatId: string; groupName: string; invitationId: string }) {
    this.server?.to(`user:${targetUserId}`).emit('group:invitation', payload);
  }

  async notifyGroupMemberUpdate(chatId: string, payload: { userId: string; action: 'joined' | 'left' | 'removed' }) {
    const members = await this.getChatMembers(chatId).catch(() => [] as string[]);
    for (const memberId of members) {
      this.server?.to(`user:${memberId}`).emit('group:member_updated', { chatId, ...payload });
    }
  }

  notifyInvitationResolved(targetUserId: string, payload: {
    invitationId: string,
    status: 'accepted' | 'declined',
    responderName: string,
    chatId?: string;
  }): void {
    this.server?.to(`user:${targetUserId}`).emit('invitation:resolved', payload);
  }

  async handleConnection(client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.disconnect(true);
      return;
    }

    this.socketUsers.set(client.id, userId);
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    this.markUserOnline(userId);

    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    if (userId) {
      this.socketUsers.delete(client.id);
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
          this.userLastSeen.set(userId, Date.now());
        }
      }
    }
  }

  private async getChatMembers(chatId: string): Promise<string[]> {
    const res = await this.store['pool'].query(
      `SELECT user_id FROM chat_members WHERE chat_id = $1`,
      [chatId],
    );
    return res.rows.map(r => r.user_id);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; type?: string; content: string; localId?: string },
  ) {
    const senderId = this.socketUsers.get(client.id);
    if (!senderId) return;

    try {
      const members = await this.getChatMembers(data.chatId);
      if (!members.includes(senderId)) return;

      const message = await this.store.sendMessage(
        data.chatId,
        senderId,
        data.content,
        data.type || 'TEXT',
      );

      client.emit('message:created', { message, localId: data.localId });

      for (const memberId of members) {
        if (memberId !== senderId) {
          this.server.to(`user:${memberId}`).emit('message:incoming', { message });
        }
      }
    } catch (e: any) {
      client.emit('message:error', { error: e.message, localId: data.localId });
    }
  }

  @SubscribeMessage('message:delivered')
  async handleDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; chatId: string },
  ) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;

    await this.store['pool'].query(
      `UPDATE messages SET status = 'delivered' WHERE id = $1 AND status = 'sent'`,
      [data.messageId],
    );

    const members = await this.getChatMembers(data.chatId);
    for (const memberId of members) {
      this.server.to(`user:${memberId}`).emit('message:status_updated', {
        messageId: data.messageId,
        status: 'delivered',
      });
    }
  }

  async notifyMessageStatusUpdated(chatId: string, messageIds: string[], status: 'delivered' | 'read') {
    if (!messageIds || messageIds.length === 0) return;
    const members = await this.getChatMembers(chatId);
    for (const memberId of members) {
      for (const msgId of messageIds) {
        this.server?.to(`user:${memberId}`).emit('message:status_updated', {
          chatId,
          messageId: msgId,
          status
        });
      }
    }
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageIds: string[] },
  ) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;
    if (!data.chatId || !data.messageIds || data.messageIds.length === 0) return;

    const members = await this.getChatMembers(data.chatId);
    if (!members.includes(userId)) return;

    const updated = await this.store['pool'].query(
      `UPDATE messages SET status = 'read'
        WHERE id = ANY($1::varchar[])
          AND chat_id = $2
          AND sender_id != $3
          AND status != 'read'
          AND COALESCE(is_deleted, FALSE) = FALSE
        RETURNING id`,
      [data.messageIds, data.chatId, userId],
    );

    for (const row of updated.rows) {
      const id = row.id as string;
      for (const memberId of members) {
        this.server.to(`user:${memberId}`).emit('message:status_updated', {
          chatId: data.chatId,
          messageId: id,
          status: 'read',
        });
      }
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;

    const members = await this.getChatMembers(data.chatId);
    if (!members.includes(userId)) return;

    const rateLimitKey = `${client.id}:${data.chatId}`;
    const now = Date.now();
    const last = this.typingRateLimits.get(rateLimitKey) || 0;
    if (now - last < 500) {
      return;
    }
    this.typingRateLimits.set(rateLimitKey, now);

    for (const memberId of members) {
      if (memberId !== userId) {
        this.server.to(`user:${memberId}`).emit('typing:update', {
          chatId: data.chatId,
          userId,
          isTyping: true,
        });
      }
    }
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ) {
    const userId = this.socketUsers.get(client.id);
    if (!userId) return;

    const members = await this.getChatMembers(data.chatId);
    if (!members.includes(userId)) return;

    for (const memberId of members) {
      if (memberId !== userId) {
        this.server.to(`user:${memberId}`).emit('typing:update', {
          chatId: data.chatId,
          userId,
          isTyping: false,
        });
      }
    }
  }
}

