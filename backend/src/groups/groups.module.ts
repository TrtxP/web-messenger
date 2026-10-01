import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { StoreModule } from '../store/store.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [StoreModule, GatewayModule],
  controllers: [GroupsController],
})
export class GroupsModule {}
