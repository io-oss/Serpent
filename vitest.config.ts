import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Electron on Linux must not load sharp's native backends; this also makes
    // direct `import sharp` in tests safe. Hooks are per-thread, so every test
    // worker runs this setup file.
    setupFiles: ['tests/setup/linux-sharp.ts'],
    // Windows CI runners are slower; the 5s vitest default flakes heavy
    // worker tests (schema chains, write fencing, model pipeline).
    testTimeout: 120_000,
    // Vitest forks Electron for these tests. Using every reported host CPU can
    // start dozens of Electron processes on developer machines and starve the
    // filesystem-heavy suite; keep concurrency bounded across the repo.
    maxWorkers: 4,
    include: ['tests/{unit,worker}/**/*.test.{ts,tsx}'],
    coverage: {
      enabled: false,
    },
  },
});
