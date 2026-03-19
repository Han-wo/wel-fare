import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddChatSessionRuntimeColumns20260319000100 implements MigrationInterface {
  name = 'AddChatSessionRuntimeColumns20260319000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('chat_sessions');
    if (!table) return;

    const columnsToAdd: TableColumn[] = [];

    if (!table.findColumnByName('runtime_state')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'runtime_state',
          type: 'varchar',
          length: '16',
          isNullable: false,
          default: "'CLOSED'",
        }),
      );
    }

    if (!table.findColumnByName('active_stream_token')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'active_stream_token',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    if (!table.findColumnByName('active_stream_closed')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'active_stream_closed',
          type: 'boolean',
          isNullable: false,
          default: 'true',
        }),
      );
    }

    if (!table.findColumnByName('active_stream_started_at')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'active_stream_started_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }

    if (!table.findColumnByName('active_stream_closed_at')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'active_stream_closed_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }

    for (const column of columnsToAdd) {
      await queryRunner.addColumn('chat_sessions', column);
    }

    await queryRunner.query(`
      UPDATE chat_sessions
      SET runtime_state = COALESCE(runtime_state, 'CLOSED'),
          active_stream_closed = COALESCE(active_stream_closed, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('chat_sessions');
    if (!table) return;

    const dropIfExists = async (name: string) => {
      if (table.findColumnByName(name)) {
        await queryRunner.dropColumn('chat_sessions', name);
      }
    };

    await dropIfExists('active_stream_closed_at');
    await dropIfExists('active_stream_started_at');
    await dropIfExists('active_stream_closed');
    await dropIfExists('active_stream_token');
    await dropIfExists('runtime_state');
  }
}
