import { test, expect } from '@playwright/test'

test.describe('SceneDetect real-route review stage', () => {
  test('loads the authenticated production route without constructing a duplicate editor', async ({ page }) => {
    const projectId = process.env.SCENEDETECT_E2E_PROJECT_ID
    test.skip(!projectId, 'SCENEDETECT_E2E_PROJECT_ID is required for the authenticated fixture')
    await page.goto(`/en/workspace/${projectId}/modes/remake?stage=scenedetect`)
    await expect(page.locator('[data-testid="remake-workbench"]')).toBeVisible()
    await expect(page.locator('[data-testid="scenedetect-embedded-app"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect(await page.locator('[data-testid="scenedetect-embedded-app"] .min-h-screen').count()).toBe(1)
  })
})
