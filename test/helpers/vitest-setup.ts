// `setupFiles` unit dan integration test (vitest.config.ts, vitest.int.config.ts): berjalan di setiap
// worker sebelum file test dimuat.
import { clearClaudeProfileEnv } from './claude-profile-env.ts';

clearClaudeProfileEnv();
