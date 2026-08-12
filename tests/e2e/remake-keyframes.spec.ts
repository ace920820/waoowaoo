import { expect, test, type Page } from '@playwright/test'

const projectId = process.env.REMAKE_KEYFRAME_E2E_PROJECT_ID
const sessionToken = process.env.REMAKE_KEYFRAME_E2E_SESSION_TOKEN
const startTrackId = process.env.REMAKE_KEYFRAME_E2E_START_TRACK_ID
const originalFrames = (process.env.REMAKE_KEYFRAME_E2E_ORIGINAL_MEDIA_IDS || '').split(',').filter(Boolean)
const baseUrl = process.env.REMAKE_KEYFRAME_E2E_BASE_URL || ''

function requireFixture() {
  test.skip(!projectId || !sessionToken || !startTrackId, 'The isolated Remake keyframe fixture is required')
  return { projectId: projectId as string, sessionToken: sessionToken as string, startTrackId: startTrackId as string }
}

async function authenticate(page: Page, token: string) {
  await page.context().addCookies([{ name: 'next-auth.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
}

async function openStage(page: Page, stage: 'prompt' | 'storyboard' | 'video') {
  const fixture = requireFixture()
  await authenticate(page, fixture.sessionToken)
  await page.goto(`${baseUrl}/en/workspace/${fixture.projectId}?stage=${stage}`)
  await expect(page.locator('[data-testid="remake-workbench"]')).toBeVisible()
  const stageTestId =
    stage === 'prompt'
      ? 'remake-prompt-stage'
      : stage === 'storyboard'
        ? 'remake-storyboard-stage'
        : 'remake-video-stage'
  await expect(page.getByTestId(stageTestId)).toBeVisible()
  return fixture
}

async function assertNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

test.describe('Remake keyframe real-route acceptance', () => {
  test('keeps Prompt, Storyboard, and Video freely reachable; Prompt handoff navigates only', async ({ page }) => {
    const fixture = await openStage(page, 'prompt')
    await expect(page.getByTestId('remake-prompt-stage')).toBeVisible()
    await expect(page.getByTestId('remake-enter-storyboard')).toBeVisible()
    await page.getByRole('button', { name: /进入分镜/i }).click()
    await expect(page.getByTestId('remake-storyboard-stage')).toBeVisible()
    await page.goto(`${baseUrl}/en/workspace/${fixture.projectId}?stage=video`)
    await expect(page.getByTestId('remake-video-stage')).toBeVisible()
  })

  test('persists explicit legal selection while keeping unavailable slots and original frame identities intact', async ({ page }) => {
    const fixture = await openStage(page, 'storyboard')
    const original = await page.request.get(`${baseUrl}/api/projects/${fixture.projectId}/data`)
    const before = await original.json()
    const frames = before.remake.shots[0].keyframes
    expect([frames.start.mediaId, frames.middle.mediaId, frames.end.mediaId]).toEqual(originalFrames)
    const middle = page.getByText(/图片 Prompt 尚未批准/i)
    await expect(middle).toBeVisible()
    await expect(page.locator('input[type="checkbox"]').nth(1)).toBeDisabled()
    const start = page.locator('input[type="checkbox"]').first()
    await expect(start).not.toBeChecked()
    await start.check()
    await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/projects/${fixture.projectId}/data`)).json()).remake.shots[0].keyframeGeneration.tracks[0].selectedForGeneration).toBe(true)
    await page.reload()
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked()
    const after = await (await page.request.get(`${baseUrl}/api/projects/${fixture.projectId}/data`)).json()
    expect([after.remake.shots[0].keyframes.start.mediaId, after.remake.shots[0].keyframes.middle.mediaId, after.remake.shots[0].keyframes.end.mediaId]).toEqual(originalFrames)
  })

  test('keeps preview/comparison non-mutating and exposes the Phase 8 Video execution boundary', async ({ page }) => {
    const fixture = await openStage(page, 'storyboard')
    const adoptedBefore = await page.request.get(`${baseUrl}/api/remake-projects/${fixture.projectId}/keyframes/tracks/${fixture.startTrackId}`)
    const historyBefore = await adoptedBefore.json()
    await page.locator('[role="radio"]').first().click()
    await expect(page.getByLabel('候选比较')).toHaveCount(0)
    const historyAfter = await (await page.request.get(`${baseUrl}/api/remake-projects/${fixture.projectId}/keyframes/tracks/${fixture.startTrackId}`)).json()
    expect(historyAfter.track.adoptedCandidateId).toBe(historyBefore.track.adoptedCandidateId)

    const videoRequests: string[] = []
    page.on('request', (request) => { if (/video|vgen/i.test(request.url()) && request.method() !== 'GET') videoRequests.push(request.url()) })
    await page.goto(`${baseUrl}/en/workspace/${fixture.projectId}?stage=video`)
    const stage = page.getByTestId('remake-video-stage')
    await expect(stage).toHaveAttribute('data-video-submission-disabled', 'true')
    await expect(page.getByRole('button', { name: /视频生成.*Phase 9/i })).toBeDisabled()
    await expect(page.getByText(/主画面参考.*采用的新画面/i)).toBeVisible()
    await expect(page.getByText(/辅助动作参考.*原始三帧动作表/i)).toBeVisible()
    expect(videoRequests).toEqual([])
  })

  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`${viewport.name} preserves focus, long text, and page bounds`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openStage(page, 'storyboard')
      await expect(page.getByText(/deliberately long state text/i).first()).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(page.locator(':focus')).toBeVisible()
      await assertNoPageOverflow(page)
      await page.goto(`${page.url().replace('storyboard', 'video')}`)
      await assertNoPageOverflow(page)
    })
  }
})
