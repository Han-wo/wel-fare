import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * 웹푸시(VAPID) 구독 저장소.
 *
 * 한 사용자가 기기·브라우저마다 구독을 따로 갖기 때문에 user가 아니라
 * endpoint가 고유키다. 만료된 구독은 발송 시 410/404 응답을 보고 지운다.
 */
export class AddPushSubscriptions20261027000100 implements MigrationInterface {
  name = 'AddPushSubscriptions20261027000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('push_subscriptions')) return;

    await queryRunner.createTable(
      new Table({
        name: 'push_subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'endpoint', type: 'text', isNullable: false },
          { name: 'p256dh', type: 'text', isNullable: false },
          { name: 'auth', type: 'text', isNullable: false },
          { name: 'userAgent', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'UQ_push_subscriptions_endpoint',
        columnNames: ['endpoint'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'IDX_push_subscriptions_user',
        columnNames: ['userId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('push_subscriptions')) {
      await queryRunner.dropTable('push_subscriptions');
    }
  }
}
