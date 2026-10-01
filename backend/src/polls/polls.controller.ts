import { Body, Controller, Delete, Get, Param, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StoreService } from '../store/store.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';

@Controller('polls')
@UseFilters(GlobalExceptionFilter)
export class PollsController {
  constructor(private readonly store: StoreService) {}

  @Get(':pollId')
  @UseGuards(AuthGuard)
  getPoll(@Req() req: any, @Param('pollId') pollId: string) {
    return this.store.getPoll(pollId, req.user.id);
  }

  @Post(':pollId/vote')
  @UseGuards(AuthGuard)
  vote(@Req() req: any, @Param('pollId') pollId: string, @Body() body: { optionId: string }) {
    return this.store.votePoll(pollId, req.user.id, body.optionId);
  }

  @Delete(':pollId/vote')
  @UseGuards(AuthGuard)
  retractVote(@Req() req: any, @Param('pollId') pollId: string) {
    return this.store.retractPollVote(pollId, req.user.id);
  }

  @Post(':pollId/close')
  @UseGuards(AuthGuard)
  closePoll(@Req() req: any, @Param('pollId') pollId: string) {
    return this.store.closePoll(pollId, req.user.id);
  }
}

@Controller('chats')
@UseFilters(GlobalExceptionFilter)
export class ChatsPollsController {
  constructor(private readonly store: StoreService) {}

  @Post(':chatId/polls')
  @UseGuards(AuthGuard)
  createPoll(@Req() req: any, @Param('chatId') chatId: string, @Body() body: { question: string; options: string[]; isAnonymous?: boolean }) {
    return this.store.createPoll(chatId, req.user.id, body.question, body.options || [], body.isAnonymous || false);
  }
}
