import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StoreService } from '../store/store.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';
import { MessengerGateway } from '../gateway/messenger.gateway';
import { PushService } from '../notifications/push.service';

@Controller('invitations')
@UseFilters(GlobalExceptionFilter)
export class InvitationsController {
  constructor(
    private readonly store: StoreService,
    private readonly gateway: MessengerGateway,
    private readonly pushService: PushService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async createInvitation(@Req() req: any, @Body() body: { recipientId?: string; toId?: string; toUserId?: string }) {
    const toId = body.recipientId || body.toId || body.toUserId || '';
    const result = await this.store.createInvitation(req.user.id, toId);
    const sender = await this.store.getUserById(req.user.id).catch(() => null);
    const senderName = sender?.username || req.user.username || 'Someone';
    await this.pushService.sendInvitationPush(toId, result.id, senderName, req.user.id);
    return result;
  }

  @Get('pending')
  @UseGuards(AuthGuard)
  getPending(@Req() req: any) {
    return this.store.getPendingInvitations(req.user.id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async acceptInvitation(@Req() req: any, @Param('id') id: string) {
    const result = await this.store.acceptInvitation(id, req.user.id);
    const sender = await this.store.getUserById(req.user.id).catch(() => null);
    const responderName = sender?.username || req.user.username || 'Someone';

    this.gateway.notifyInvitationResolved(result.fromId, {
      invitationId: id,
      status: 'accepted',
      responderName,
      chatId: result.chatId,
    });

    await this.pushService.sendInvitationAcceptedPush(
      result.fromId,
      id,
      responderName,
      req.user.id,
      result.chatId,
    );

    return result;
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async declineInvitation(@Req() req: any, @Param('id') id: string) {
    const result = await this.store.declineInvitation(id, req.user.id);
    const sender = await this.store.getUserById(req.user.id).catch(() => null);
    const responderName = sender?.username || req.user.username || 'Someone';

    this.gateway.notifyInvitationResolved(result.fromId, {
      invitationId: id,
      status: 'declined',
      responderName,
    });

    await this.pushService.sendInvitationDeclinedPush(
      result.fromId,
      id,
      responderName,
      req.user.id,
    );

    return result;
  }
}
