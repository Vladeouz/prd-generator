import { notFound } from 'next/navigation';
import { getDb } from '../../../core/db/client.ts';
import { AppError } from '../../../core/errors.ts';
import { getProjectDetail } from '../../../projects/projects.ts';
import { ProjectView } from './project-view.tsx';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return <ProjectView project={getProjectDetail({ db: getDb() }, id)} />;
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
