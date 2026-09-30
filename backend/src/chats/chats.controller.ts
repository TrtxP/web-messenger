import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StoreService } from '../store/store.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';
import { MessengerGateway } from '../gateway/messenger.gateway';
import { PushService } from '../notifications/push.service';
import { th } from '@faker-js/faker';

@Controller('chats')
@UseFilters(GlobalExceptionFilter)
export class ChatsController {
  constructor(
    private readonly store: StoreService,
    private readonly messengerGateway: MessengerGateway,
    private readonly pushService: PushService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getChats(@Req() req: any, @Query('archived') archived?: string) {
    const isArchived = archived === 'true';
    const chats = await this.store.getChats(req.user.id, isArchived);
    return chats.map((chat: any) => ({
      ...chat,
      partner: {
        ...chat.partner,
        isOnline: this.messengerGateway.isUserOnline(chat.partner?.id ?? ''),
      },
    }));
  }

  @Get(':id/presence')
  @UseGuards(AuthGuard)
  async getChatPresence(@Req() req: any, @Param('id') chatId: string) {
    const result = await this.store['pool'].query(
      `SELECT user_id FROM chat_members WHERE chat_id = $1`,
      [chatId],
    );
    const memberIds = result.rows.map((row: any) => row.user_id);
    if (!memberIds.includes(req.user.id)) {
      throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    }

    const partnerId = memberIds.find((id: string) => id !== req.user.id);
    return {
      isOnline: partnerId
          ? this.messengerGateway.isUserOnline(partnerId)
          : false,
      activity: partnerId
          ? this.messengerGateway.getChatActivity(chatId, partnerId)
          : null,
      lastSeenAt: partnerId
          ? this.messengerGateway.getUserLastSeenAt(partnerId)
          : null,
    };
  }

  @Post(':id/activity')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async setChatActivity(
    @Req() req: any,
    @Param('id') chatId: string,
    @Body() body: { activity?: string | null },
  ) {
    const allowedActivities = [
      'typing',
      'sending_image',
      'sending_video',
      'sending_audio',
    ];
    const activity = body.activity ?? null;
    if (activity !== null && !allowedActivities.includes(activity)) {
      throw new HttpException('Invalid activity', HttpStatus.BAD_REQUEST);
    }
    const member = await this.store['pool'].query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, req.user.id],
    );
    if (!member.rowCount) {
      throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    }
    this.messengerGateway.setChatActivity(chatId, req.user.id, activity);
    return { ok: true };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  setArchive(@Req() req: any, @Param('id') id: string, @Body() body: { archived?: boolean }) {
    return this.store.setChatArchive(id, req.user.id, body.archived ?? true);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async deleteChat(@Req() req: any, @Param('id') id: string) {
    const result = await this.store.deleteChat(id, req.user.id);
    this.messengerGateway.notifyChatDeleted(id, result.participantIds);
    return { chatId: id, deleted: true };
  }

  @Post(':id/mute')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  setMute(@Req() req: any, @Param('id') id: string, @Body() body: { muted?: boolean }) {
    return this.store.setChatMute(id, req.user.id, body.muted ?? true);
  }

  @Get(':id/messages')
  @UseGuards(AuthGuard)
  getMessages(
    @Req() req: any,
    @Param('id') chatId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.store.getMessages(chatId, req.user.id, limitNum);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async markChatRead(@Req() req: any, @Param('id') chatId: string) {
    const res = await this.store.markChatRead(chatId, req.user.id);
    this.messengerGateway.notifyMessageStatusUpdated(chatId, res.readMessageIds, 'read');
    return res;
  }

  @Post(':id/delivered')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async markMessagesDelivered(@Req() req: any, @Param('id') chatId: string) {
    const res = await this.store.markMessagesDelivered(chatId, req.user.id);
    this.messengerGateway.notifyMessageStatusUpdated(chatId, res.deliveredMessageIds, 'delivered');
    return res;
  }

  @Post(':id/messages')
  @UseGuards(AuthGuard)
  async sendMessage(
    @Req() req: any,
    @Param('id') chatId: string,
    @Body() body: { content?: string; text?: string; type?: string; mediaId?: string },
  ) {
    const content = body.content || body.text || '';
    const message = await this.store.sendMessage(chatId, req.user.id, content, body.type || 'TEXT', body.mediaId);
    try {
      const sender = await this.store.getUserById(req.user.id).catch(() => null);
      const senderName = sender?.username || req.user.username || 'New message';

      const membersRes = await this.store.getPool().query(
        `SELECT user_id, is_muted FROM chat_members WHERE chat_id = $1 AND user_id != $2`,
        [chatId, req.user.id],
      );
      for (const member of membersRes.rows) {
        if (!member.is_muted) {
          const bodyPreview =
            body.type === 'AUDIO'
              ? '🎤 Voice message'
              : body.type === 'IMAGE'
              ? '📷 Photo'
              : body.type === 'VIDEO'
              ? '🎥 Video'
              : content;
          await this.pushService.sendMessagePush(
            member.user_id,
            chatId,
            senderName,
            bodyPreview,
            body.type || 'TEXT',
            req.user.id,
          );
        }
      }
    } catch (_) {}
    return message;
  }

  @Put(':chatId/messages/:msgId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  editMessage(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Param('msgId') msgId: string,
    @Body() body: { content?: string; text?: string },
  ) {
    const content = body.content || body.text || '';
    return this.store.editMessage(msgId, req.user.id, content);
  }

  @Delete(':chatId/messages/:msgId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  deleteMessage(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Param('msgId') msgId: string,
  ) {
    return this.store.deleteMessage(msgId, req.user.id);
  }

  @Post(':id/typing')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async typing(@Req() req: any, @Param('id') chatId: string, @Body() body: { isTyping?: boolean }) {
    const member = await this.store['pool'].query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, req.user.id],
    );
    if (!member.rowCount) {
      throw new (require('@nestjs/common').HttpException)('Unauthorized', HttpStatus.FORBIDDEN);
    }
    return { ok: true };
  }
}
