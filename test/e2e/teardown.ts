import { removeDir } from './environment.ts';

export default function teardown() {
  if (process.env.PRD_E2E_DIR) removeDir(process.env.PRD_E2E_DIR);
}
