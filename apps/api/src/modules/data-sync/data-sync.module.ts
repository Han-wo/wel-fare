import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSyncService } from './data-sync.service';
import { DataSyncController } from './data-sync.controller';
import { DataSyncLog } from './entities/data-sync-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataSyncLog])],
  controllers: [DataSyncController],
  providers: [DataSyncService],
  exports: [DataSyncService],
})
export class DataSyncModule {}
