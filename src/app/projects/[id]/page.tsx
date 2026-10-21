import { notFound } from 'next/navigation';
import { getDb } from '../../../core/db/client.ts';
import { AppError } from '../../../core/errors.ts';
import { getProjectDetail, getStageUsage } from '../../../projects/projects.ts';
import { stageEstimate } from '../../../projects/usage.ts';
import { featureDraft } from '../../../stages/stage-4/features.ts';
import { stage7Progress } from '../../../stages/stage-7b/job.ts';
import { templateStatus } from '../../template-status.ts';
import { ProjectView } from './project-view.tsx';
import type { Stage7Steps } from './stage7-section.tsx';

export const dynamic = 'force-dynamic';

/** Langkah tahap 7 yang sudah valid, untuk keterangan melanjutkan di layar tahap 7. */
function stage7Steps(context: { db: ReturnType<typeof getDb>; projectId: string }): Stage7Steps {
  const { list, phases, missing } = stage7Progress(context);
  return {
    list: list !== null,
    phasesDone: phases.length - missing.length,
    phasesTotal: phases.length,
  };
}

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
        stage7Steps={stage7Steps({ db, projectId: id })}
        template={await templateStatus()}
        estimates={{
          stage6: stageEstimate({ db }, 'stage6'),
          // Tahap 7: 7a + 7b per fase tahap 4 (D-11).
          stage7: stageEstimate({ db }, 'stage7', featureDraft(db, id)?.phases.length),
        }}
      />
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
