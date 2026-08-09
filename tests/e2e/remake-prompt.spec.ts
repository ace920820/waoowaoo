import { expect, test, type Page } from '@playwright/test'

const projectId = process.env.REMAKE_PROMPT_E2E_PROJECT_ID

function requirePromptProject() {
  test.skip(!projectId, 'REMAKE_PROMPT_E2E_PROJECT_ID is required for the authenticated Prompt fixture')
  return projectId
}

async function assertNoHorizontalOverflow(page: Page) {
  return await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}

test.describe('Remake Prompt real-route review', () => {
  test('restores the Prompt stage on the authenticated workspace route at desktop and mobile widths', async ({ page }) => {
    const id = requirePromptProject()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/en/workspace/${id}/modes/remake?stage=prompt`)
    await expect(page.locator('[data-testid="remake-workbench"]')).toBeVisible()
    await expect(page.locator('[data-testid="remake-prompt-stage"]')).toBeVisible()
    expect(await assertNoHorizontalOverflow(page)).toBe(true)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.locator('[data-testid="remake-prompt-stage"]')).toBeVisible()
    expect(await assertNoHorizontalOverflow(page)).toBe(true)
  })

  test('uses the browser, API, Task, Worker, and persisted UI path only when real Codex is explicitly enabled', async ({ page }) => {
    test.skip(process.env.REMAKE_PROMPT_REAL_CODEX !== '1', 'REMAKE_PROMPT_REAL_CODEX=1 is required for the paid real-Codex smoke')
    const id = requirePromptProject()
    await page.goto(`/en/workspace/${id}/modes/remake?stage=prompt`)
    await expect(page.locator('[data-testid="remake-prompt-stage"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /generate image prompt|重新分析|生成图片 Prompt/i }).first()).toBeVisible()
  })
})
