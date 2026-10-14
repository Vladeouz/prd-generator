// Definisi tahap yang tersedia di aplikasi; setiap task tahap menambahkan definisinya di sini.
import type { StageRegistry } from '../jobs/job-queue.ts';
import { stage2Definition } from './stage-2/definition.ts';
import { stage3Definition } from './stage-3/definition.ts';
import { stage4Definition } from './stage-4/definition.ts';

export function createStageRegistry(): StageRegistry {
  return {
    stage2: stage2Definition() as StageRegistry['stage2'],
    stage3: stage3Definition() as StageRegistry['stage3'],
    stage4: stage4Definition() as StageRegistry['stage4'],
  };
}
