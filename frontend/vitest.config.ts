import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The app's Vite config is a function, so call it to get a plain config to
 * merge. Both projects inherit it via `extends: true` — the storybook project
 * needs the React plugin and its dependency pre-bundling, without which React
 * resolves to CommonJS in the browser and no story can import.
 */
const appViteConfig = viteConfig({ command: 'serve', mode: 'test' })

/**
 * Two inner tiers, beneath the Playwright acceptance suite in `e2e/`.
 *
 * `unit` runs services — plain functions, no React, no DOM — in node, because
 * business logic that needs a browser to be tested is business logic that has
 * leaked into the view.
 *
 * `storybook` runs stories in real Chromium. It is the integration tier, and it
 * is deliberately not jsdom: a simulated DOM would let a component pass here and
 * fail in `e2e/`, which is the one thing this pyramid exists to prevent.
 *
 * Neither project may reach into `e2e/` — Playwright owns those specs, and a
 * Playwright spec collected by Vitest fails in a confusing way.
 */
export default mergeConfig(
  appViteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.spec.ts'],
          },
        },
        {
          extends: true,
          plugins: [
            storybookTest({
              configDir: path.join(here, '.storybook'),
              storybookScript: 'npm run storybook -- --no-open',
            }),
          ],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
