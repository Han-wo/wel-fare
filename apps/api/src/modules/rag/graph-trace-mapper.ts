import { policyNodeId } from './retrieval-helpers';

type TraceRecord = {
  get(key: string): unknown;
};

export function buildHousingAnnouncementGraph(records: TraceRecord[]) {
  return {
    nodes: records.flatMap((record) => {
      const announcement = (record.get('a') as { properties: Record<string, string> }).properties;
      const regions = ((record.get('regionNames') as string[]) ?? []).filter(Boolean);

      return [
        {
          id: policyNodeId(String(announcement.id)),
          label: announcement.name,
          kind: 'HousingAnnouncement',
        },
        ...regions.map((region) => ({
          id: `region:${region}`,
          label: region,
          kind: 'Region',
        })),
      ];
    }),
    edges: records.flatMap((record) => {
      const announcement = (record.get('a') as { properties: Record<string, string> }).properties;
      return ((record.get('regionNames') as string[]) ?? []).filter(Boolean).map((region) => ({
        id: `${policyNodeId(String(announcement.id))}->region:${region}:AVAILABLE_IN`,
        source: policyNodeId(String(announcement.id)),
        target: `region:${region}`,
        label: 'AVAILABLE_IN',
      }));
    }),
  };
}

export function buildHousingComplexGraph(records: TraceRecord[]) {
  return {
    nodes: records.flatMap((record) => {
      const complex = (record.get('h') as { properties: Record<string, unknown> }).properties;
      const regionName = record.get('regionName') as string;

      return [
        {
          id: policyNodeId(String(complex.id)),
          label: `${regionName} ${String(complex.sigungu ?? '')}`.trim(),
          kind: 'HousingComplex',
        },
        {
          id: `region:${regionName}`,
          label: regionName,
          kind: 'Region',
        },
      ];
    }),
    edges: records.map((record) => {
      const complex = (record.get('h') as { properties: Record<string, unknown> }).properties;
      const regionName = record.get('regionName') as string;
      return {
        id: `${policyNodeId(String(complex.id))}->region:${regionName}:LOCATED_IN`,
        source: policyNodeId(String(complex.id)),
        target: `region:${regionName}`,
        label: 'LOCATED_IN',
      };
    }),
  };
}

