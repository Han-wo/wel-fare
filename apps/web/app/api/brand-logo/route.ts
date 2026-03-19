import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const logoPath = path.resolve(process.cwd(), '../api/src/common/asset/welFareFull.png');

export async function GET() {
  const file = await readFile(logoPath);

  return new Response(file, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
