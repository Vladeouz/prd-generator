import { getSettings } from '../../../template/settings.ts';

export const dynamic = 'force-dynamic';

/** `GET /api/settings` → `{ templateDir, templateCommit, claudeAvailable }` (PRD bagian 5). */
export async function GET() {
  const { templateDir, templateCommit, claudeAvailable } = await getSettings();
  return Response.json({ templateDir, templateCommit, claudeAvailable });
}
