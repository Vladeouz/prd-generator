import { notFound } from 'next/navigation';
import { getDb } from '../../../core/db/client.ts';
import { AppError } from '../../../core/errors.ts';
import { getProjectDetail, getStageUsage } from '../../../projects/projects.ts';
import { stageEstimate } from '../../../projects/usage.ts';
import { templateStatus } from '../../template-status.ts';
import { ProjectView } from './project-view.tsx';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tahap?: string | string[] }>;
};

export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tahap } = await searchParams;
  const db = getDb();
  try {
    return (
      <ProjectView
        project={getProjectDetail({ db }, id)}
        usage={getStageUsage({ db }, id)}
        stage={typeof tahap === 'string' ? tahap : undefined}
        template={await templateStatus()}
        estimates={{
          stage6: stageEstimate({ db }, 'stage6'),
          stage7: stageEstimate({ db }, 'stage7'),
        }}
      />
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
