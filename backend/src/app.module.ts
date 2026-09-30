import { Module } from '@nestjs/common';
import { CryptoModule } from './crypto/crypto.module';
import { StoreModule } from './store/store.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ChatsModule } from './chats/chats.module';
import { GatewayModule } from './gateway/gateway.module';
import { MediaModule } from './media/media.module';
import { FakerModule } from './faker/faker.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    CryptoModule,
    StoreModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    InvitationsModule,
    ChatsModule,
    GatewayModule,
    MediaModule,
    FakerModule,
  ],
})
export class AppModule {}
