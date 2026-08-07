import { test, expect } from '@playwright/test'

test.describe('remake workbench responsive harness', () => {
  test('keeps the Waoo shell and disabled SceneDetect stage contained', async ({ page }) => {
    await page.setContent(`
      <main style="min-height:100vh;background:#f6f8f9;color:#1d252c">
        <header style="display:flex;justify-content:space-between;padding:28px 16px;border-bottom:1px solid #dce2e6"><h1>Remake</h1><button id="tasks">Tasks 1</button></header>
        <nav style="padding:14px 16px"><button>Project overview</button><button>Video analysis / shot review</button></nav>
        <section data-testid="remake-overview" style="padding:16px"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px"><div>Source video</div><div>Shots 0</div><div>Needs review 0</div></div></section>
        <section data-testid="scenedetect-stage-disabled" style="min-height:320px;background:#101317;color:#f3f4f6;display:grid;place-content:center;text-align:center"><strong>SceneDetect</strong><span>Available in Phase 6</span></section>
        <div id="drawer" hidden style="position:fixed;inset:0;background:rgba(13,19,23,.32)"><aside role="dialog" style="margin-left:auto;width:min(400px,92vw);height:100%;background:#fff">Tasks</aside></div>
      </main>`)
    await page.locator('#tasks').click()
    await page.locator('#drawer').evaluate((node) => { (node as HTMLElement).hidden = false })
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    expect(await page.locator('[data-testid="scenedetect-stage-disabled"]').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(16, 19, 23)')
  })
})
