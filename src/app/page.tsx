import { getDb } from '../core/db/client.ts';
import { listProjects } from '../projects/projects.ts';
import { HomeView } from './projects/home-view.tsx';
import { templateStatus } from './template-status.ts';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return <HomeView projects={listProjects({ db: getDb() })} template={await templateStatus()} />;
}
