import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddNotificationDedupeKey20260707000100 implements MigrationInterface {
  name = 'AddNotificationDedupeKey20260707000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('notifications');
    if (table?.findColumnByName('dedupeKey')) return;

    await queryRunner.addColumn(
      'notifications',
      new TableColumn({ name: 'dedupeKey', type: 'varchar', isNullable: true }),
    );
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'UQ_notifications_dedupe_key',
        columnNames: ['dedupeKey'],
        isUnique: true,
        where: '"dedupeKey" IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('notifications', 'UQ_notifications_dedupe_key');
    await queryRunner.dropColumn('notifications', 'dedupeKey');
  }
}
