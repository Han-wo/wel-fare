import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Policy } from '../../modules/policies/entities/policy.entity';
import { PolicyRequirement } from '../../modules/policies/entities/policy-requirement.entity';

export interface RelationalPolicyRequirementInput {
  reqType: string;
  operator?: string;
  minValue?: number | null;
  maxValue?: number | null;
  valueList?: string[] | null;
  description?: string | null;
}

export interface RelationalPolicyUpsertInput {
  externalId: string;
  source: string;
  name: string;
  category: string;
  subcategory?: string | null;
  provider?: string | null;
  summary?: string | null;
  content?: string | null;
  targetSummary?: string | null;
  benefitAmount?: number | null;
  benefitType?: string | null;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  status?: string;
  applyUrl?: string | null;
  contact?: string | null;
  sidoCodes?: string[] | null;
  tags?: string[] | null;
  rawData?: Record<string, unknown> | null;
  qdrantPointId?: string | null;
  neo4jNodeId?: string | null;
  syncedAt?: Date;
  requirements?: RelationalPolicyRequirementInput[];
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

async function ensureDataSource() {
  if (AppDataSource.isInitialized) return;
  await AppDataSource.initialize();
}

export async function syncPoliciesToPostgres(inputs: RelationalPolicyUpsertInput[]) {
  if (inputs.length === 0) return;

  await ensureDataSource();

  const policyRepo = AppDataSource.getRepository(Policy);
  const requirementRepo = AppDataSource.getRepository(PolicyRequirement);
  const externalIds = uniq(inputs.map((input) => input.externalId));

  const existingPolicies = externalIds.length
    ? await policyRepo.find({
        select: {
          id: true,
          externalId: true,
        },
        where: { externalId: In(externalIds) },
      })
    : [];

  const existingByExternalId = new Map(
    existingPolicies
      .filter((policy) => policy.externalId)
      .map((policy) => [policy.externalId as string, policy.id]),
  );

  const entities = inputs.map((input) =>
    policyRepo.create({
      id: existingByExternalId.get(input.externalId),
      externalId: input.externalId,
      source: input.source,
      name: input.name,
      category: input.category,
      subcategory: input.subcategory ?? null,
      provider: input.provider ?? null,
      summary: input.summary ?? null,
      content: input.content ?? null,
      targetSummary: input.targetSummary ?? null,
      benefitAmount: input.benefitAmount ?? null,
      benefitType: input.benefitType ?? null,
      applicationStart: input.applicationStart ?? null,
      applicationEnd: input.applicationEnd ?? null,
      status: input.status ?? 'ACTIVE',
      applyUrl: input.applyUrl ?? null,
      contact: input.contact ?? null,
      sidoCodes: uniq(input.sidoCodes ?? []) || null,
      tags: uniq(input.tags ?? []) || null,
      rawData: input.rawData ?? null,
      qdrantPointId: input.qdrantPointId ?? null,
      neo4jNodeId: input.neo4jNodeId ?? null,
      syncedAt: input.syncedAt ?? new Date(),
    }),
  );

  const savedPolicies = await policyRepo.save(entities, { chunk: 100 });
  const savedByExternalId = new Map(
    savedPolicies
      .filter((policy) => policy.externalId)
      .map((policy) => [policy.externalId as string, policy.id]),
  );
  const savedPolicyIds = savedPolicies.map((policy) => policy.id);

  if (savedPolicyIds.length > 0) {
    await requirementRepo
      .createQueryBuilder()
      .delete()
      .from(PolicyRequirement)
      .where('"policyId" IN (:...policyIds) OR "policy_id" IN (:...policyIds)', { policyIds: savedPolicyIds })
      .execute();
  }

  const requirementEntities = inputs.flatMap((input) => {
    const policyId = savedByExternalId.get(input.externalId);
    if (!policyId) return [];

    return (input.requirements ?? []).map((requirement) =>
      requirementRepo.create({
        policyId,
        policy: { id: policyId } as Policy,
        reqType: requirement.reqType,
        operator: requirement.operator ?? null,
        minValue: requirement.minValue ?? null,
        maxValue: requirement.maxValue ?? null,
        valueList: uniq(requirement.valueList ?? []) || null,
        description: requirement.description ?? null,
      }),
    );
  });

  if (requirementEntities.length > 0) {
    await requirementRepo.save(requirementEntities, { chunk: 200 });
  }
}

export async function closePolicySyncDataSource() {
  if (!AppDataSource.isInitialized) return;
  await AppDataSource.destroy();
}
