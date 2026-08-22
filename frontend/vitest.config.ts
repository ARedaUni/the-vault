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
 * Three inner tiers, beneath the Playwright acceptance suite in `e2e/`.
 * The boundaries between them are documented in docs/testing-strategy.md;
 * the short version is that a spec lives at the lowest tier that can prove it.
 *
 * `unit` runs services — plain functions, no React, no DOM — in node, because
 * business logic that needs a browser to be tested is business logic that has
 * leaked into the view.
 *
 * `storybook` runs stories in real Chromium: one component, its props, its
 * rendering decisions.
 *
 * `browser` runs the app itself in real Chromium, with MSW answering the
 * network. This is where app behaviour per API response belongs — loading,
 * failure, retry, empty — because none of it needs a dev server, a navigation
 * or a real media fetch. Playwright is reserved for the handful of journeys
 * that do.
 *
 * None of them is jsdom, and none of them ever will be: a simulated DOM lets a
 * component pass in a fast tier and fail in `e2e/`, which is the one thing this
 * structure exists to prevent.
 *
 * No project may reach into `e2e/` — Playwright owns those specs, and a
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
          test: {
            name: 'browser',
            include: ['src/**/*.test.{ts,tsx}'],
            setupFiles: [
              './src/test/setup.browser.ts',
              './src/test/msw.browser.setup.ts',
            ],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{ browser: 'chromium' }],
            },
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
