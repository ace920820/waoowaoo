import { expect, test, type Page } from '@playwright/test'

const projectId = process.env.REMAKE_PROMPT_E2E_PROJECT_ID

function requirePromptProject() {
  test.skip(!projectId, 'REMAKE_PROMPT_E2E_PROJECT_ID is required for the authenticated Prompt fixture')
  return projectId as string
}

function requireReviewFixture() {
  test.skip(process.env.REMAKE_PROMPT_E2E_REVIEW_FIXTURE !== '1', 'REMAKE_PROMPT_E2E_REVIEW_FIXTURE=1 is required for a project seeded with image and video Prompt histories')
}

async function openPromptStage(page: Page, id: string) {
  await page.goto(`/en/workspace/${id}/modes/remake?stage=prompt`)
  await expect(page.locator('[data-testid="remake-workbench"]')).toBeVisible()
  await expect(page.locator('[data-testid="remake-prompt-stage"]')).toBeVisible()
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

test.describe('Remake Prompt real-route review', () => {
  test('restores the authenticated Prompt workspace without desktop or mobile overflow', async ({ page }) => {
    const id = requirePromptProject()
    await page.setViewportSize({ width: 1440, height: 900 })
    await openPromptStage(page, id)
    await assertNoHorizontalOverflow(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.locator('[data-testid="remake-prompt-stage"]')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('submits one selected image slot and one whole-video action without cross-target payloads', async ({ page }) => {
    const id = requirePromptProject()
    await openPromptStage(page, id)
    const submissions: Array<Record<string, unknown>> = []
    await page.route(`**/api/remake-projects/${id}/prompts/analyze`, async (route) => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ taskId: 'prompt-task', status: 'queued' }) })
    })

    const imagePanels = page.locator('article.prompt-frame')
    await expect(imagePanels).toHaveCount(3)
    const startPanel = imagePanels.filter({ hasText: /^START/ })
    await startPanel.getByRole('button', { name: /generate image prompt|analyze image|分析图片 Prompt/i }).click()
    await expect.poll(() => submissions.length).toBe(1)
    expect(submissions[0]).toMatchObject({ kind: 'image', slot: 'start' })
    expect(submissions[0]).toHaveProperty('shotId')
    expect(submissions[0]).not.toHaveProperty('stableShotIds')

    await page.getByRole('button', { name: /analyze video|整段视频分析/i }).first().click()
    await expect.poll(() => submissions.length).toBe(2)
    expect(submissions[1]).toMatchObject({ kind: 'video' })
    expect(submissions[1]).not.toHaveProperty('shotId')
    expect(submissions[1]).not.toHaveProperty('slot')
  })

  test('keeps image slots independent while reviewing, comparing, editing, adopting, and retrying histories', async ({ page }) => {
    const id = requirePromptProject()
    requireReviewFixture()
    await openPromptStage(page, id)

    const panels = page.locator('article.prompt-frame')
    await expect(panels).toHaveCount(3)
    const startPanel = panels.filter({ hasText: /^START/ })
    const middlePanel = panels.filter({ hasText: /^MIDDLE/ })
    await expect(startPanel.getByText(/latest v\d+/i)).toBeVisible()
    await expect(middlePanel.getByText(/latest v\d+/i)).toBeVisible()

    await startPanel.getByText(/version history/i).click()
    const compareButtons = startPanel.getByRole('button', { name: /^compare$/i })
    await expect(compareButtons).toHaveCount(2)
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await expect(startPanel.getByLabel(/compare/i)).toBeVisible()
    await expect(middlePanel.getByLabel(/compare/i)).toHaveCount(0)

    await startPanel.getByRole('button', { name: /^edit$/i }).click()
    const editor = startPanel.getByRole('textbox', { name: /integrated prompt/i })
    await editor.fill('A reviewed replacement prompt')
    await startPanel.getByRole('button', { name: /save as new version/i }).click()
    await expect(startPanel.getByText(/pending review/i)).toBeVisible()
    await expect(middlePanel.getByText(/A reviewed replacement prompt/i)).toHaveCount(0)
    await startPanel.getByRole('button', { name: /approve and adopt/i }).click()
    await expect(startPanel.getByText(/adopted v\d+/i)).toBeVisible()

    await page.getByRole('button', { name: /analyze video|整段视频分析/i }).first().click()
    await expect(page.getByText(/queued|running/i).first()).toBeVisible()
    await expect(startPanel.getByText(/adopted v\d+/i)).toBeVisible()

    const video = page.locator('article').filter({ hasText: /video prompt/i }).last()
    await video.getByRole('button', { name: /version history/i }).click()
    await expect(video.getByRole('button', { name: /^compare$/i })).toHaveCount(2)
  })

  test('uses the browser, API, Task, Worker, and persisted UI path only when real Codex is explicitly enabled', async ({ page }) => {
    test.skip(process.env.REMAKE_PROMPT_REAL_CODEX !== '1', 'REMAKE_PROMPT_REAL_CODEX=1 is required for the paid real-Codex smoke')
    const id = requirePromptProject()
    await openPromptStage(page, id)
    await expect(page.getByRole('button', { name: /generate image prompt|analyze image|分析图片 Prompt/i }).first()).toBeVisible()
  })
})
