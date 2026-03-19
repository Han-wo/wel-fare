import { QdrantClient } from '@qdrant/js-client-rest';

async function seedQdrant() {
  const client = new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  });

  const collectionName = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === collectionName);

  if (!exists) {
    await client.createCollection(collectionName, {
      vectors: { size: 3072, distance: 'Cosine' },
      optimizers_config: { default_segment_number: 2 },
    });

    await client.createPayloadIndex(collectionName, {
      field_name: 'category',
      field_schema: 'keyword',
    });
    await client.createPayloadIndex(collectionName, {
      field_name: 'status',
      field_schema: 'keyword',
    });
    await client.createPayloadIndex(collectionName, {
      field_name: 'policyId',
      field_schema: 'keyword',
    });

    console.log(`✅ Qdrant 컬렉션 '${collectionName}' 생성 완료`);
  } else {
    console.log(`ℹ️  Qdrant 컬렉션 '${collectionName}' 이미 존재`);
  }
}

seedQdrant().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
