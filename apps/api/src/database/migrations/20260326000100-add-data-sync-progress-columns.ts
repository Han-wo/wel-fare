import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDataSyncProgressColumns20260326000100 implements MigrationInterface {
  name = 'AddDataSyncProgressColumns20260326000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('data_sync_logs');
    if (!table) return;

    const columnsToAdd: TableColumn[] = [];

    const ensureColumn = (name: string, column: TableColumn) => {
      if (!table.findColumnByName(name)) {
        columnsToAdd.push(column);
      }
    };

    ensureColumn(
      'orderIndex',
      new TableColumn({
        name: 'orderIndex',
        type: 'integer',
        isNullable: false,
        default: '0',
      }),
    );
    ensureColumn(
      'phase',
      new TableColumn({
        name: 'phase',
        type: 'varchar',
        length: '96',
        isNullable: true,
      }),
    );
    ensureColumn(
      'itemTotal',
      new TableColumn({
        name: 'itemTotal',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'fetchCurrent',
      new TableColumn({
        name: 'fetchCurrent',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'fetchTotal',
      new TableColumn({
        name: 'fetchTotal',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'processCurrent',
      new TableColumn({
        name: 'processCurrent',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'processTotal',
      new TableColumn({
        name: 'processTotal',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'vectorCurrent',
      new TableColumn({
        name: 'vectorCurrent',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'vectorTotal',
      new TableColumn({
        name: 'vectorTotal',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'graphCurrent',
      new TableColumn({
        name: 'graphCurrent',
        type: 'integer',
        isNullable: true,
      }),
    );
    ensureColumn(
      'graphTotal',
      new TableColumn({
        name: 'graphTotal',
        type: 'integer',
        isNullable: true,
      }),
    );

    for (const column of columnsToAdd) {
      await queryRunner.addColumn('data_sync_logs', column);
    }

    await queryRunner.query(`
      UPDATE data_sync_logs
      SET "orderIndex" = COALESCE("orderIndex", 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('data_sync_logs');
    if (!table) return;

    const dropIfExists = async (name: string) => {
      if (table.findColumnByName(name)) {
        await queryRunner.dropColumn('data_sync_logs', name);
      }
    };

    await dropIfExists('graphTotal');
    await dropIfExists('graphCurrent');
    await dropIfExists('vectorTotal');
    await dropIfExists('vectorCurrent');
    await dropIfExists('processTotal');
    await dropIfExists('processCurrent');
    await dropIfExists('fetchTotal');
    await dropIfExists('fetchCurrent');
    await dropIfExists('itemTotal');
    await dropIfExists('phase');
    await dropIfExists('orderIndex');
  }
}
