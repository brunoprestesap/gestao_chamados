import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  fullyParallel: false, // serial por padrão (fluxos dependentes)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // serial para evitar conflito no banco
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000,
        env: {
          ...process.env,
          // Desabilitar LDAP durante testes E2E para usar apenas autenticação local
          LDAP_URL: '',
          LDAP_BASE_DN: '',
          LDAP_BIND_DN: '',
          LDAP_BIND_PASSWORD: '',
        },
      },
});
