import * as fs from 'fs';
import * as path from 'path';

export const SEED_CYPHER_PATH = path.join(__dirname, 'seed-graph.cypher');

export function getSeedCypher(): string {
  return fs.readFileSync(SEED_CYPHER_PATH, 'utf-8');
}
