import { Module } from '@nestjs/common';
import { FakerData } from './faker-data';

@Module({
  providers: [FakerData],
  exports: [FakerData],
})
export class FakerModule {}
