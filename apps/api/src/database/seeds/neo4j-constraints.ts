/**
 * Neo4j MERGE 성능을 위한 uniqueness constraint 보장.
 *
 * 제약이 없으면 MERGE가 label scan을 매번 수행해 시드가 매우 느려진다.
 * IF NOT EXISTS 라 idempotent — 시드 진입점에서 매번 호출해도 안전.
 */
import type { Driver } from 'neo4j-driver';

const CONSTRAINTS: ReadonlyArray<{ name: string; cypher: string }> = [
  {
    name: 'policy_id_unique',
    cypher: 'CREATE CONSTRAINT policy_id_unique IF NOT EXISTS FOR (p:Policy) REQUIRE p.id IS UNIQUE',
  },
  {
    name: 'region_name_unique',
    cypher: 'CREATE CONSTRAINT region_name_unique IF NOT EXISTS FOR (r:Region) REQUIRE r.name IS UNIQUE',
  },
  {
    name: 'region_code_unique',
    cypher: 'CREATE CONSTRAINT region_code_unique IF NOT EXISTS FOR (r:Region) REQUIRE r.code IS UNIQUE',
  },
  {
    name: 'lifestage_name_unique',
    cypher: 'CREATE CONSTRAINT lifestage_name_unique IF NOT EXISTS FOR (l:LifeStage) REQUIRE l.name IS UNIQUE',
  },
  {
    name: 'theme_name_unique',
    cypher: 'CREATE CONSTRAINT theme_name_unique IF NOT EXISTS FOR (t:Theme) REQUIRE t.name IS UNIQUE',
  },
  {
    name: 'targetgroup_name_unique',
    cypher: 'CREATE CONSTRAINT targetgroup_name_unique IF NOT EXISTS FOR (g:TargetGroup) REQUIRE g.name IS UNIQUE',
  },
  {
    name: 'housing_complex_id_unique',
    cypher: 'CREATE CONSTRAINT housing_complex_id_unique IF NOT EXISTS FOR (h:HousingComplex) REQUIRE h.id IS UNIQUE',
  },
  {
    name: 'housing_announcement_id_unique',
    cypher: 'CREATE CONSTRAINT housing_announcement_id_unique IF NOT EXISTS FOR (a:HousingAnnouncement) REQUIRE a.id IS UNIQUE',
  },
  {
    name: 'institution_name_unique',
    cypher: 'CREATE CONSTRAINT institution_name_unique IF NOT EXISTS FOR (i:Institution) REQUIRE i.name IS UNIQUE',
  },
  {
    name: 'welfare_facility_id_unique',
    cypher: 'CREATE CONSTRAINT welfare_facility_id_unique IF NOT EXISTS FOR (f:WelfareFacility) REQUIRE f.id IS UNIQUE',
  },
  {
    name: 'facility_kind_name_unique',
    cypher: 'CREATE CONSTRAINT facility_kind_name_unique IF NOT EXISTS FOR (k:FacilityKind) REQUIRE k.name IS UNIQUE',
  },
];

let ensured = false;

export async function ensureNeo4jConstraints(driver: Driver): Promise<void> {
  if (ensured) return;
  const session = driver.session();
  try {
    for (const { cypher } of CONSTRAINTS) {
      try {
        await session.run(cypher);
      } catch (error) {
        // EquivalentSchemaRuleAlreadyExistsException 등은 무시 — 다른 이름으로 같은 제약이 있을 때 발생
        const message = (error as Error).message ?? '';
        if (!/already exists|EquivalentSchemaRule/i.test(message)) {
          console.warn(`Neo4j constraint 생성 경고: ${message}`);
        }
      }
    }
    ensured = true;
  } finally {
    await session.close();
  }
}
