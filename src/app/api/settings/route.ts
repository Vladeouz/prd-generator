import { getSettings } from '../../../template/settings.ts';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/settings` → `{ templateDir, templateCommit, claudeAvailable, claudeProfiles }` (PRD
 * bagian 5, D-14).
 */
export async function GET() {
  const { templateDir, templateCommit, claudeAvailable, claudeProfiles } = await getSettings();
  return Response.json({ templateDir, templateCommit, claudeAvailable, claudeProfiles });
}
