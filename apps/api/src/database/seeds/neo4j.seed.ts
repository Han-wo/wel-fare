import neo4j from 'neo4j-driver';
import * as fs from 'fs';
import * as path from 'path';
import { getRequiredEnv } from '../../common/env.util';

async function seedNeo4j() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME ?? 'neo4j',
      getRequiredEnv('NEO4J_PASSWORD'),
    ),
  );

  const cypherPath = path.join(
    __dirname,
    '../../../../../packages/ontology-schema/src/seed-graph.cypher',
  );
  const cypher = fs.readFileSync(cypherPath, 'utf-8');

  const session = driver.session();
  try {
    const statements = cypher
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('//'));

    for (const stmt of statements) {
      await session.run(stmt);
      process.stdout.write('.');
    }
    console.log('\n✅ Neo4j 온톨로지 시드 완료');
  } finally {
    await session.close();
    await driver.close();
  }
}

seedNeo4j().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
