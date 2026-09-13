import { test, expect } from '@playwright/test'
import { getExample } from '../src/data/examples'
import { chooseExample, menuAction } from './ui'

async function mockCamera(
  page: import('@playwright/test').Page,
  mode: 'live' | 'denied' | 'missing' | 'busy' | 'late' = 'live',
) {
  await page.addInitScript(
    ({ values, mode }) => {
      const state = {
        calls: [] as MediaStreamConstraints[],
        active: 0,
        stopped: 0,
        pending: [] as (() => void)[],
      }
      Object.assign(window, { cameraTest: state })
      const makeStream = () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1100
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, 1100, 1100)
        ctx.strokeStyle = '#111'
        for (let i = 0; i <= 9; i++) {
          ctx.lineWidth = i % 3 === 0 ? 5 : 2
          ctx.beginPath()
          ctx.moveTo(100 + i * 100, 100)
          ctx.lineTo(100 + i * 100, 1000)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(100, 100 + i * 100)
          ctx.lineTo(1000, 100 + i * 100)
          ctx.stroke()
        }
        ctx.fillStyle = '#111'
        ctx.font = 'bold 50px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        values.forEach((value, index) => {
          if (value) ctx.fillText(String(value), 150 + (index % 9) * 100, 150 + Math.floor(index / 9) * 100)
        })
        const stream = canvas.captureStream(15)
        const timer = setInterval(() => {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, 1, 1)
        }, 60)
        const track = stream.getVideoTracks()[0]
        state.active++
        const stop = track.stop.bind(track)
        let stopped = false
        track.stop = () => {
          if (!stopped) {
            stopped = true
            state.active--
            state.stopped++
            clearInterval(timer)
          }
          stop()
        }
        return stream
      }
      const mediaDevices = {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          state.calls.push(constraints)
          if (mode !== 'live' && mode !== 'late')
            return Promise.reject(
              new DOMException(
                'Test camera error',
                mode === 'denied'
                  ? 'NotAllowedError'
                  : mode === 'missing'
                    ? 'NotFoundError'
                    : 'NotReadableError',
              ),
            )
          if (mode === 'late')
            return new Promise<MediaStream>((resolve) => state.pending.push(() => resolve(makeStream())))
          return Promise.resolve(makeStream())
        },
        enumerateDevices: async () => [
          { kind: 'videoinput', deviceId: 'back', label: 'Задняя камера', groupId: 'one' },
          { kind: 'videoinput', deviceId: 'front', label: 'Передняя камера', groupId: 'two' },
        ],
      }
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
    },
    { values: getExample(9).givens, mode },
  )
}
async function cameraState(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          cameraTest: { active: number; stopped: number; calls: MediaStreamConstraints[] }
        }
      ).cameraTest,
  )
}

test('captures, retakes and solves a camera photograph without microphone or external requests', async ({
  page,
  baseURL,
}, testInfo) => {
  const errors: string[] = [],
    external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin)
      external.push(request.url())
  })
  await mockCamera(page)
  await page.goto('/')
  expect((await cameraState(page)).calls).toHaveLength(0)
  await page.getByRole('button', { name: 'Сделать фото', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сделать фото', exact: true })
  const shutter = dialog.getByRole('button', { name: 'Снять фото', exact: true })
  await expect(shutter).toBeEnabled()
  await page.getByLabel('Выбор камеры').selectOption('front')
  await expect(shutter).toBeEnabled()
  await expect.poll(async () => (await cameraState(page)).active).toBe(1)
  await dialog.screenshot({ path: `test-results/${testInfo.project.name}-camera.png` })
  await shutter.click()
  await expect(dialog.getByAltText('Снимок судоку с камеры')).toBeVisible()
  await expect.poll(async () => (await cameraState(page)).active).toBe(0)
  await dialog.getByRole('button', { name: 'Переснять', exact: true }).click()
  await expect(shutter).toBeEnabled()
  await shutter.click()
  await dialog.getByRole('button', { name: 'Использовать фото', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Распознать числа' })).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Распознать числа' }).click()
  await expect(
    page.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true }),
  ).toBeEnabled({ timeout: 60_000 })
  expect(
    await page
      .locator('.cell input')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
  ).toEqual(getExample(9).givens)
  await page.getByRole('button', { name: 'Я проверил(а) числа по фотографии', exact: true }).click()
  await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
  await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('SudokuMaster-9x9.png')
  const state = await cameraState(page)
  expect(state.active).toBe(0)
  expect(state.calls.every((call) => call.audio === false)).toBe(true)
  expect(state.calls.some((call) => typeof call.video === 'object' && 'deviceId' in call.video)).toBe(true)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

for (const [mode, message] of [
  ['denied', 'Доступ к камере не разрешён'],
  ['missing', 'Камера не найдена'],
  ['busy', 'Камера недоступна'],
] as const) {
  test(`handles a ${mode} camera and preserves the current puzzle`, async ({ page }) => {
    await mockCamera(page, mode)
    await page.goto('/')
    await chooseExample(page, 9)
    await menuAction(page, 'Сделать фото')
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('button', { name: 'Загрузить фото', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    expect(
      await page
        .locator('.cell input')
        .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value))),
    ).toEqual(getExample(9).givens)
    expect((await cameraState(page)).active).toBe(0)
  })
}

test('stops a late camera stream after the dialog has been closed', async ({ page }) => {
  await mockCamera(page, 'late')
  await page.goto('/')
  await page.getByRole('button', { name: 'Сделать фото', exact: true }).click()
  await expect(page.getByText('Ожидаем доступ к камере…', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(() =>
    (window as unknown as { cameraTest: { pending: (() => void)[] } }).cameraTest.pending.forEach((resolve) =>
      resolve(),
    ),
  )
  await expect.poll(async () => (await cameraState(page)).stopped).toBeGreaterThan(0)
  expect((await cameraState(page)).active).toBe(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('stops a live camera when closed or when leaving the page', async ({ page }) => {
  await mockCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Сделать фото', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Снять фото', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
  expect((await cameraState(page)).active).toBe(0)
  await page.getByRole('button', { name: 'Сделать фото', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Снять фото', exact: true })).toBeEnabled()
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect(page.getByRole('button', { name: 'Включить камеру', exact: true })).toBeVisible()
  expect((await cameraState(page)).active).toBe(0)
})

for (const scenario of ['insecure', 'unsupported'] as const) {
  test(`offers photo upload when camera access is ${scenario}`, async ({ page }) => {
    await page.addInitScript((scenario) => {
      if (scenario === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false })
      else Object.defineProperty(navigator, 'mediaDevices', { value: undefined })
    }, scenario)
    await page.goto('/')
    await page.getByRole('button', { name: 'Сделать фото', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(
      scenario === 'insecure' ? 'HTTPS' : 'не поддерживает съёмку',
    )
    await expect(page.getByRole('button', { name: 'Снять фото', exact: true })).toBeDisabled()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('dialog').getByRole('button', { name: 'Загрузить фото', exact: true }).click()
    await chooser
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}
