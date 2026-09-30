import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { StoreService } from '../store/store.service';

@Global()
@Module({
  providers: [
    {
      provide: PushService,
      useFactory: (storeService: StoreService) => {
        return new PushService(storeService.getPool());
      },
      inject: [StoreService],
    },
  ],
  exports: [PushService],
})
export class NotificationsModule {}
