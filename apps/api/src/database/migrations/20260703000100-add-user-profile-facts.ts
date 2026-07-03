import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddUserProfileFacts20260703000100 implements MigrationInterface {
  name = 'AddUserProfileFacts20260703000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.getTable('user_profile_facts');
    if (existing) return;

    await queryRunner.createTable(
      new Table({
        name: 'user_profile_facts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid' },
          { name: 'field', type: 'varchar', length: '32' },
          { name: 'value', type: 'text' },
          { name: 'source', type: 'varchar', length: '32', default: "'hitl'" },
          { name: 'session_id', type: 'uuid', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
        uniques: [{ columnNames: ['user_id', 'field'] }],
        indices: [{ columnNames: ['user_id'] }],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_profile_facts', true);
  }
}
