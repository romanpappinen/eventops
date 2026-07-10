import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/integration/**/*.test.ts', 'tests/unit/**/*.test.ts'],
        globals: true,
        setupFiles: ['./tests/setup.ts'],
    },
});
