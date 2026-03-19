import { getSidoName } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import { policyNodeId } from './retrieval-helpers';

type TraceRecord = {
  get(key: string): unknown;
};

export function buildOntologyMatchTrace(input: {
  traceId: string;
  profile: UserProfileType;
  age: number;
  lifeStage: string;
  targetGroups: string[];
  records: TraceRecord[];
  totalCount: number;
}) {
  const criteriaNodes: Array<{ id: string; label: string; kind: string }> = [
    { id: `profile:${input.traceId}`, label: '사용자 프로필', kind: 'profile' },
    {
      id: `criteria:${input.traceId}:lifeStage:${input.lifeStage}`,
      label: input.lifeStage,
      kind: 'LifeStage',
    },
  ];
  const criteriaEdges: Array<{ id: string; source: string; target: string; label: string }> = [
    {
      id: `profile:${input.traceId}->criteria:${input.traceId}:lifeStage:${input.lifeStage}:HAS_LIFE_STAGE`,
      source: `profile:${input.traceId}`,
      target: `criteria:${input.traceId}:lifeStage:${input.lifeStage}`,
      label: 'HAS_LIFE_STAGE',
    },
  ];

  if (input.profile.sidoCode) {
    criteriaNodes.push({
      id: `criteria:${input.traceId}:region:${input.profile.sidoCode}`,
      label: getSidoName(input.profile.sidoCode),
      kind: 'Region',
    });
    criteriaEdges.push({
      id: `profile:${input.traceId}->criteria:${input.traceId}:region:${input.profile.sidoCode}:IN_REGION`,
      source: `profile:${input.traceId}`,
      target: `criteria:${input.traceId}:region:${input.profile.sidoCode}`,
      label: 'IN_REGION',
    });
  }

  for (const group of input.targetGroups) {
    criteriaNodes.push({
      id: `criteria:${input.traceId}:group:${group}`,
      label: group,
      kind: 'TargetGroup',
    });
    criteriaEdges.push({
      id: `profile:${input.traceId}->criteria:${input.traceId}:group:${group}:HAS_GROUP`,
      source: `profile:${input.traceId}`,
      target: `criteria:${input.traceId}:group:${group}`,
      label: 'HAS_GROUP',
    });
  }

  const policyNodes: Array<{ id: string; label: string; kind: string; score: number }> = [];
  const policyEdges: Array<{ id: string; source: string; target: string; label: string }> = [];
  const topPolicies: Array<{ id: string; name: string; score: number }> = [];

  for (const record of input.records.slice(0, 12)) {
    const policyId = record.get('policyId') as string;
    const policyName = record.get('policyName') as string;
    const matchedLifeStages = (record.get('lifeStages') as string[]).filter(Boolean);
    const matchedRegions = (record.get('regions') as string[]).filter(Boolean);
    const matchedGroups = (record.get('targetGroups') as string[]).filter(Boolean);
    const matchScore = Number(record.get('matchScore') as number);

    topPolicies.push({ id: policyId, name: policyName, score: matchScore });
    policyNodes.push({
      id: policyNodeId(policyId),
      label: policyName,
      kind: 'Policy',
      score: matchScore,
    });

    for (const value of matchedLifeStages) {
      policyEdges.push({
        id: `criteria:${input.traceId}:lifeStage:${value}->${policyNodeId(policyId)}:TARGETS_LIFE_STAGE`,
        source: `criteria:${input.traceId}:lifeStage:${value}`,
        target: policyNodeId(policyId),
        label: 'TARGETS_LIFE_STAGE',
      });
    }

    for (const value of matchedRegions) {
      const regionId = `criteria:${input.traceId}:region:${input.profile.sidoCode ?? value}`;
      policyEdges.push({
        id: `${regionId}->${policyNodeId(policyId)}:AVAILABLE_IN`,
        source: regionId,
        target: policyNodeId(policyId),
        label: 'AVAILABLE_IN',
      });
    }

    for (const value of matchedGroups) {
      policyEdges.push({
        id: `criteria:${input.traceId}:group:${value}->${policyNodeId(policyId)}:TARGETS_GROUP`,
        source: `criteria:${input.traceId}:group:${value}`,
        target: policyNodeId(policyId),
        label: 'TARGETS_GROUP',
      });
    }
  }

  return {
    title: 'Neo4j 프로필 그래프 매칭',
    detail: `${input.age}세 · ${input.lifeStage} 기준으로 ${input.totalCount}개 정책 후보를 추렸습니다.`,
    nodes: [...criteriaNodes, ...policyNodes],
    edges: [...criteriaEdges, ...policyEdges],
    payload: {
      topPolicies,
      lifeStage: input.lifeStage,
      targetGroups: input.targetGroups,
      region: input.profile.sidoCode ? getSidoName(input.profile.sidoCode) : null,
    },
  };
}

export function buildPolicyExpansionTrace(input: {
  records: TraceRecord[];
  relatedNames: string[];
}) {
  const traceNodes: Array<{ id: string; label: string; kind: string }> = [];
  const traceEdges: Array<{ id: string; source: string; target: string; label: string }> = [];

  for (const record of input.records) {
    const id = record.get('id') as string;
    const name = record.get('name') as string;
    const lifeStages = (record.get('lifeStages') as string[]).filter(Boolean);
    const targetGroups = (record.get('targetGroups') as string[]).filter(Boolean);
    const themes = (record.get('themes') as string[]).filter(Boolean);
    const regions = (record.get('regions') as string[]).filter(Boolean);

    traceNodes.push({ id: policyNodeId(id), label: name, kind: 'Policy' });
    for (const value of lifeStages) {
      traceNodes.push({ id: `lifeStage:${value}`, label: value, kind: 'LifeStage' });
      traceEdges.push({
        id: `${policyNodeId(id)}->lifeStage:${value}:TARGETS_LIFE_STAGE`,
        source: policyNodeId(id),
        target: `lifeStage:${value}`,
        label: 'TARGETS_LIFE_STAGE',
      });
    }
    for (const value of targetGroups) {
      traceNodes.push({ id: `targetGroup:${value}`, label: value, kind: 'TargetGroup' });
      traceEdges.push({
        id: `${policyNodeId(id)}->targetGroup:${value}:TARGETS_GROUP`,
        source: policyNodeId(id),
        target: `targetGroup:${value}`,
        label: 'TARGETS_GROUP',
      });
    }
    for (const value of themes) {
      traceNodes.push({ id: `theme:${value}`, label: value, kind: 'Theme' });
      traceEdges.push({
        id: `${policyNodeId(id)}->theme:${value}:HAS_THEME`,
        source: policyNodeId(id),
        target: `theme:${value}`,
        label: 'HAS_THEME',
      });
    }
    for (const value of regions) {
      traceNodes.push({ id: `region:${value}`, label: value, kind: 'Region' });
      traceEdges.push({
        id: `${policyNodeId(id)}->region:${value}:AVAILABLE_IN`,
        source: policyNodeId(id),
        target: `region:${value}`,
        label: 'AVAILABLE_IN',
      });
    }
  }

  return {
    title: 'Neo4j 정책 관계 확장',
    detail: `${input.records.length}개 정책 노드에서 생애주기·대상·주제·지역 관계를 펼쳤습니다.`,
    nodes: traceNodes,
    edges: traceEdges,
    payload: { relatedPolicies: input.relatedNames },
  };
}
