// Unit tests of the modules taken out of legacy.js (ADR-0008): `npm test`. Kept apart from vite.config.js,
// whose root is src/ and whose output goes next to it.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
