import { test, expect } from '@playwright/test'

const PROJECT_REF = process.env.E2E_PROJECT_REF
if (!PROJECT_REF) throw new Error('E2E_PROJECT_REF must be set')

test('Sidebar does not show hidden features', async ({ page }) => {
  await page.goto(`/project/${PROJECT_REF}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(5000)

  // These should NOT appear anywhere on the page as sidebar links
  const hidden = ['Edge Functions', 'Advisors', 'Observability', 'Logs', 'Integrations']
  for (const label of hidden) {
    const link = page.getByRole('link', { name: label, exact: true })
    await expect(link).toHaveCount(0, { timeout: 2000 })
  }

  // These SHOULD appear as sidebar links
  const visible = [
    'Table Editor',
    'SQL Editor',
    'Database',
    'Authentication',
    'Storage',
    'Realtime',
    'Agents',
    'Knowledge Bases',
    'Sources',
    'Workflows',
    'Runs',
    'Project Settings',
  ]
  for (const label of visible) {
    await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible({ timeout: 5000 })
  }
})

test('Settings sub-nav does not show hidden settings', async ({ page }) => {
  await page.goto(`/project/${PROJECT_REF}/settings/general`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)

  // Hidden settings
  const hidden = [
    'Compute and Disk',
    'Infrastructure',
    'Log Drains',
    'Add-ons',
    'Subscription',
    'Usage',
  ]
  for (const label of hidden) {
    const link = page.getByRole('link', { name: label, exact: true })
    await expect(link).toHaveCount(0, { timeout: 2000 })
  }

  // Visible settings
  const visible = ['General', 'API Keys']
  for (const label of visible) {
    await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible({ timeout: 5000 })
  }
})

test('Branding shows Powabase in page title', async ({ page }) => {
  // Navigate to a project page where the title is set by our layouts
  await page.goto(`/project/${PROJECT_REF}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)

  const title = await page.title()
  expect(title).toContain('Powabase')
})
