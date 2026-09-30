import { Module } from '@nestjs/common';
import { MessengerGateway } from './messenger.gateway';

@Module({
  providers: [MessengerGateway],
  exports: [MessengerGateway],
})
export class GatewayModule {}

