import { QdrantClient } from '@qdrant/js-client-rest';

function resolveVectorSize() {
  const explicit = process.env.QDRANT_VECTOR_SIZE;
  if (explicit) {
    const parsed = Number(explicit);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  if (model === 'text-embedding-3-large') return 3072;
  if (model === 'text-embedding-3-small') return 1536;

  return 1536;
}

async function seedQdrant() {
  const client = new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  });

  const collectionName = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === collectionName);

  if (!exists) {
    await client.createCollection(collectionName, {
      vectors: { size: resolveVectorSize(), distance: 'Cosine' },
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
