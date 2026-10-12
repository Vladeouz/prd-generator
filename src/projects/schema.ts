// Skema input proyek (FR-01), dipakai route handler dan form agar batasnya sama.
import { z } from 'zod';

export const NAME_MAX = 100;
export const IDEA_MAX = 4000;

export const createProjectSchema = z.object({
  name: z
    .string({ error: 'Nama proyek wajib diisi.' })
    .trim()
    .min(1, 'Nama proyek wajib diisi.')
    .max(NAME_MAX, `Nama proyek maksimal ${NAME_MAX} karakter.`),
  idea: z
    .string({ error: 'Ide wajib diisi.' })
    .trim()
    .min(1, 'Ide wajib diisi.')
    .max(IDEA_MAX, `Ide maksimal ${IDEA_MAX} karakter.`),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
