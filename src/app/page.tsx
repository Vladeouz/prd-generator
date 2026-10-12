import { getDb } from '../core/db/client.ts';
import { listProjects } from '../projects/projects.ts';
import { HomeView } from './projects/home-view.tsx';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <HomeView projects={listProjects({ db: getDb() })} />;
}
