import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/live/**/*.live.test.ts'],
        globals: true,
        setupFiles: ['./tests/live/setup.ts'],
        testTimeout: 20000,
        hookTimeout: 20000,
        fileParallelism: false,
    },
});
