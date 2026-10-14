// Definisi tahap yang tersedia di aplikasi; setiap task tahap menambahkan definisinya di sini.
import type { StageRegistry } from '../jobs/job-queue.ts';
import { review2Definition } from './review-2/definition.ts';
import { stage2Definition } from './stage-2/definition.ts';
import { stage3Definition } from './stage-3/definition.ts';
import { stage4Definition } from './stage-4/definition.ts';
import { stage5Definition } from './stage-5/definition.ts';
import { type Stage6Options, stage6Definition } from './stage-6/definition.ts';

/** `templateDir`: sumber `TEMPLATE_DIR` (bawaan: env), diganti di test dengan folder buatan. */
export function createStageRegistry(options: Stage6Options = {}): StageRegistry {
  return {
    stage2: stage2Definition() as StageRegistry['stage2'],
    stage3: stage3Definition() as StageRegistry['stage3'],
    stage4: stage4Definition() as StageRegistry['stage4'],
    stage5: stage5Definition() as StageRegistry['stage5'],
    stage6: stage6Definition(options) as StageRegistry['stage6'],
    review2: review2Definition() as StageRegistry['review2'],
  };
}
