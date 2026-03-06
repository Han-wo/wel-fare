// ════════════════════════════════════════════════════════════
// WelfareAI Neo4j 온톨로지 초기 시드 데이터
// ════════════════════════════════════════════════════════════

// ── 제약 조건 & 인덱스 ────────────────────────────────────
CREATE CONSTRAINT policy_id IF NOT EXISTS FOR (p:Policy) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT region_code IF NOT EXISTS FOR (r:Region) REQUIRE r.code IS UNIQUE;
CREATE CONSTRAINT attribute_id IF NOT EXISTS FOR (a:Attribute) REQUIRE a.id IS UNIQUE;
CREATE INDEX policy_status IF NOT EXISTS FOR (p:Policy) ON (p.status);
CREATE INDEX policy_category IF NOT EXISTS FOR (p:Policy) ON (p.category);

// ── 지역 계층 노드 ────────────────────────────────────────
MERGE (:Region {code: 'ALL', name: '전국',          level: 'NATION'});
MERGE (:Region {code: '11',  name: '서울특별시',     level: 'SIDO'});
MERGE (:Region {code: '26',  name: '부산광역시',     level: 'SIDO'});
MERGE (:Region {code: '41',  name: '경기도',         level: 'SIDO'});
MERGE (:Region {code: '28',  name: '인천광역시',     level: 'SIDO'});
MERGE (:Region {code: '27',  name: '대구광역시',     level: 'SIDO'});
MERGE (:Region {code: '29',  name: '광주광역시',     level: 'SIDO'});
MERGE (:Region {code: '30',  name: '대전광역시',     level: 'SIDO'});
MERGE (:Region {code: '31',  name: '울산광역시',     level: 'SIDO'});
MERGE (:Region {code: '36',  name: '세종특별자치시', level: 'SIDO'});
MERGE (:Region {code: '42',  name: '강원특별자치도', level: 'SIDO'});
MERGE (:Region {code: '44',  name: '충청남도',       level: 'SIDO'});
MERGE (:Region {code: '45',  name: '전북특별자치도', level: 'SIDO'});
MERGE (:Region {code: '46',  name: '전라남도',       level: 'SIDO'});
MERGE (:Region {code: '47',  name: '경상북도',       level: 'SIDO'});
MERGE (:Region {code: '48',  name: '경상남도',       level: 'SIDO'});
MERGE (:Region {code: '50',  name: '제주특별자치도', level: 'SIDO'});

// ── 속성 노드 (온톨로지 계층) ─────────────────────────────
MERGE (:Attribute {id: 'attr-youth',        name: '청년',        attrType: 'DEMOGRAPHIC'});
MERGE (:Attribute {id: 'attr-middle-age',   name: '중장년',      attrType: 'DEMOGRAPHIC'});
MERGE (:Attribute {id: 'attr-senior',       name: '노인',        attrType: 'DEMOGRAPHIC'});
MERGE (:Attribute {id: 'attr-child',        name: '아동·청소년', attrType: 'DEMOGRAPHIC'});
MERGE (:Attribute {id: 'attr-low-income',   name: '저소득층',    attrType: 'INCOME'});
MERGE (:Attribute {id: 'attr-basic-income', name: '기초생활수급자', attrType: 'INCOME'});
MERGE (:Attribute {id: 'attr-mid-income',   name: '중위소득이하', attrType: 'INCOME'});
MERGE (:Attribute {id: 'attr-single-hh',    name: '1인가구',     attrType: 'HOUSEHOLD'});
MERGE (:Attribute {id: 'attr-single-parent', name: '한부모가족', attrType: 'HOUSEHOLD'});
MERGE (:Attribute {id: 'attr-multi-child',  name: '다자녀가구',  attrType: 'HOUSEHOLD'});
MERGE (:Attribute {id: 'attr-unemployed',   name: '미취업자',    attrType: 'EMPLOYMENT'});
MERGE (:Attribute {id: 'attr-freelancer',   name: '프리랜서',    attrType: 'EMPLOYMENT'});
MERGE (:Attribute {id: 'attr-sme-worker',   name: '중소기업재직자', attrType: 'EMPLOYMENT'});
MERGE (:Attribute {id: 'attr-non-owner',    name: '무주택자',    attrType: 'HOUSING'});
MERGE (:Attribute {id: 'attr-renter',       name: '임차인',      attrType: 'HOUSING'});
MERGE (:Attribute {id: 'attr-disabled',     name: '장애인',      attrType: 'SPECIAL'});
MERGE (:Attribute {id: 'attr-veteran',      name: '국가유공자',  attrType: 'SPECIAL'});

// ── 속성 계층 관계 ────────────────────────────────────────
MATCH (basic:Attribute {id: 'attr-basic-income'})
MATCH (low:Attribute {id: 'attr-low-income'})
MERGE (basic)-[:INCLUDES]->(low);
