import { Module } from '@nestjs/common';
import { PollsController, ChatsPollsController } from './polls.controller';
import { StoreModule } from '../store/store.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [StoreModule, GatewayModule],
  controllers: [PollsController, ChatsPollsController],
})
export class PollsModule {}
