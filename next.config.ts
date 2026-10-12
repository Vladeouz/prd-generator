import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tanpa ini `next dev` membuat AGENTS.md di root; aturan kerja agent ada di CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
