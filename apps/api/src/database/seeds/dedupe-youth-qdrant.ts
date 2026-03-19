import { QdrantClient } from '@qdrant/js-client-rest';

const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const SCROLL_LIMIT = 1000;
const DELETE_BATCH = 500;
const SOURCE = 'youth_center';
const POINT_OFFSET = 1_500_000_000;

function plcyNoToPointId(plcyNo: string): number {
  const key = `youth_${plcyNo}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (POINT_OFFSET + (hash & 0x3fffffff)) % 2_147_483_647;
}

async function main() {
  const groups = new Map<string, Array<number | string>>();
  let offset: number | string | undefined;

  while (true) {
    const response = await qdrant.scroll(COLLECTION, {
      limit: SCROLL_LIMIT,
      offset,
      with_payload: ['policyId', 'source'],
      with_vector: false,
      filter: {
        must: [{ key: 'source', match: { value: SOURCE } }],
      },
    });

    for (const point of response.points) {
      const policyId = String(point.payload?.policyId ?? '');
      if (!policyId) continue;
      if (!groups.has(policyId)) groups.set(policyId, []);
      groups.get(policyId)!.push(point.id as number | string);
    }

    if (!response.next_page_offset) break;
    offset = response.next_page_offset as number | string;
  }

  const deleteIds: Array<number | string> = [];
  let duplicatePolicyIds = 0;

  for (const [policyId, pointIds] of groups.entries()) {
    if (pointIds.length <= 1) continue;

    duplicatePolicyIds += 1;
    const canonicalId = String(plcyNoToPointId(policyId.replace(/^youth_/, '')));
    const keepId = pointIds.find((pointId) => String(pointId) === canonicalId) ?? pointIds[0];

    for (const pointId of pointIds) {
      if (String(pointId) !== String(keepId)) {
        deleteIds.push(pointId);
      }
    }
  }

  if (deleteIds.length === 0) {
    console.log('✅ 삭제할 youth_center 중복 포인트가 없습니다.');
    return;
  }

  for (let i = 0; i < deleteIds.length; i += DELETE_BATCH) {
    const batch = deleteIds.slice(i, i + DELETE_BATCH);
    await qdrant.delete(COLLECTION, {
      wait: true,
      points: batch,
    });
    process.stdout.write(`중복 삭제 [${Math.min(i + DELETE_BATCH, deleteIds.length)}/${deleteIds.length}]\r`);
  }

  console.log(`\n🎉 youth_center 중복 정리 완료`);
  console.log(`   중복 policyId: ${duplicatePolicyIds}개`);
  console.log(`   삭제 포인트: ${deleteIds.length}개`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
