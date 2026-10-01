import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseFilters, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StoreService } from '../store/store.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';
import { MessengerGateway } from '../gateway/messenger.gateway';

@Controller('groups')
@UseFilters(GlobalExceptionFilter)
export class GroupsController {
  constructor(private readonly store: StoreService, private readonly gateway: MessengerGateway) {}

  @Post()
  @UseGuards(AuthGuard)
  async createGroup(@Req() req: any, @Body() body: { name: string; memberIds: string[] }) {
    const result = await this.store.createGroup(req.user.id, body.name, body.memberIds || []);
    for (const inv of result.invitations) {
      this.gateway.notifyGroupInvitation(inv.toId, { chatId: result.id, groupName: result.name, invitationId: inv.id });
    }
    return result;
  }

  @Get('invitations/pending')
  @UseGuards(AuthGuard)
  getPending(@Req() req: any) {
    return this.store.getPendingGroupInvitations(req.user.id);
  }

  @Post('invitations/:invId/accept')
  @UseGuards(AuthGuard)
  async acceptInvitation(@Req() req: any, @Param('invId') invId: string) {
    const result = await this.store.acceptGroupInvitation(invId, req.user.id);
    await this.gateway.notifyGroupMemberUpdate(result.chatId, { userId: req.user.id, action: 'joined' });
    return result;
  }

  @Post('invitations/:invId/decline')
  @UseGuards(AuthGuard)
  declineInvitation(@Req() req: any, @Param('invId') invId: string) {
    return this.store.declineGroupInvitation(invId, req.user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async getGroupInfo(@Req() req: any, @Param('id') id: string) {
    const info = await this.store.getGroupInfo(id, req.user.id);
    if (info && Array.isArray(info.members)) {
      info.members = info.members.map((m: any) => ({
        ...m,
        isOnline: this.gateway.isUserOnline(m.userId),
        lastSeenAt: this.gateway.getUserLastSeenAt(m.userId),
      }));
    }
    return info;
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  updateGroup(@Req() req: any, @Param('id') id: string, @Body() body: { name?: string; avatarPath?: string }) {
    return this.store.updateGroup(id, req.user.id, body.name, body.avatarPath);
  }

  @Post(':id/invite')
  @UseGuards(AuthGuard)
  async inviteToGroup(@Req() req: any, @Param('id') id: string, @Body() body: { userIds: string[] }) {
    const created = await this.store.inviteToGroup(id, req.user.id, body.userIds || []);
    const info = await this.store.getGroupInfo(id, req.user.id).catch(() => ({ name: 'Group' }));
    for (const inv of created) {
      this.gateway.notifyGroupInvitation(inv.toId, { chatId: id, groupName: (info as any).name || 'Group', invitationId: inv.id });
    }
    return created;
  }

  @Delete(':id/members/:userId')
  @UseGuards(AuthGuard)
  async removeMember(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string) {
    const result = await this.store.removeGroupMember(id, req.user.id, userId);
    const isSelf = userId === 'me' || userId === req.user.id;
    if (result.groupDeleted) {
      this.gateway.notifyChatDeleted(id, result.participantIds || [req.user.id, result.removedUserId]);
    } else {
      await this.gateway.notifyGroupMemberUpdate(id, { userId: result.removedUserId, action: isSelf ? 'left' : 'removed' });
    }
    return result;
  }
}
