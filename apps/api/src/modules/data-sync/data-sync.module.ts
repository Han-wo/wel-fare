import { Module } from '@nestjs/common';
import { DataSyncService } from './data-sync.service';
import { DataSyncController } from './data-sync.controller';

@Module({
  controllers: [DataSyncController],
  providers: [DataSyncService],
  exports: [DataSyncService],
})
export class DataSyncModule {}
