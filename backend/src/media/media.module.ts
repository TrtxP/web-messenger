import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StoreModule } from '../store/store.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [StoreModule, CryptoModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}

