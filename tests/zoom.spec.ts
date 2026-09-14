import { test, expect } from '@playwright/test'
import { chooseExample, menuAction } from './ui'

test.describe('mouse wheel scrolling', () => {
  test.use({ isMobile: false, hasTouch: false })

  test('keeps controls fixed while scrolling the grid and photo, including fullscreen', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 640 })
    await page.goto('./')
    await page.getByLabel('Загрузить фотографию судоку').setInputFiles('tests/fixtures/blue16.png')
    const recognize = page.getByRole('button', { name: 'Распознать числа', exact: true })
    await expect(recognize).toBeEnabled({ timeout: 30000 })
    await recognize.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 })
    for (let i = 0; i < 4; i++)
      await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()

    const viewport = page.locator('.grid-viewport')
    const controls = page.locator('.board-heading, .board-scale, .board-meta, .cell-tools')
    const positions = () =>
      controls.evaluateAll((elements) =>
        elements.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
    const outerScroll = () =>
      page.evaluate(() => [window.scrollY, document.querySelector('.workspace')!.scrollTop])
    for (const fullscreen of [false, true]) {
      if (fullscreen) await page.getByRole('button', { name: 'Увеличить поле', exact: true }).click()
      const before = await positions()
      const region = (await viewport.boundingBox())!
      expect(region.height).toBeGreaterThan(150)
      for (const photo of [false, true]) {
        const toggle = page.locator('.photo-toggle')
        if ((await toggle.getAttribute('aria-pressed')) !== String(photo)) await toggle.click()
        await page.mouse.move(region.x + region.width / 2, region.y + region.height / 2)
        await page.mouse.wheel(0, 1800)
        await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
        await expect(page.locator('[data-cell-id="255"]')).toBeInViewport({ ratio: 1 })
        await page.mouse.wheel(0, 1800)
        // End the native wheel gesture before switching views and reversing direction.
        await page.waitForTimeout(300)
        expect(await positions()).toEqual(before)
        expect(await outerScroll()).toEqual([0, 0])
        await expect(toggle).toBeInViewport({ ratio: 1 })
        const scroll = await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop])
        await toggle.click()
        expect(await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(scroll)
        expect(await positions()).toEqual(before)
        await page.screenshot({
          path: info.outputPath(
            `scrolled-${fullscreen ? 'fullscreen' : 'normal'}-${photo ? 'photo' : 'grid'}.png`,
          ),
        })
        await page.mouse.move(region.x + region.width / 2, region.y + region.height / 2)
        await page.mouse.wheel(0, -1800)
        await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0)
      }
    }
  })

  for (const width of [1440, 390]) {
    test(`keeps composite navigation fixed at the scroll edges at width ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('./')
      await menuAction(page, 'Составное · 8 полей')
      const select = page.getByLabel('Выбрать поле', { exact: true })
      await select.selectOption('all')
      const viewport = page.locator('.grid-viewport')
      const panel = page.locator('.board-panel')
      for (const fullscreen of [false, true]) {
        if (fullscreen) await page.getByRole('button', { name: 'Увеличить поле', exact: true }).click()
        const bounds = (await viewport.boundingBox())!
        expect(bounds.height).toBeGreaterThan(100)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(
          width < 1024 ? (await page.locator('.workflow-dock').boundingBox())!.y : 844,
        )
        const before = await panel.boundingBox()
        await page.mouse.move(bounds.x + 100, bounds.y + 40)
        await page.mouse.wheel(0, 400)
        await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
        await viewport.evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await page.mouse.wheel(0, 500)
        expect(
          await page.evaluate(() => [window.scrollY, document.querySelector('.workspace')!.scrollTop]),
        ).toEqual([0, 0])
        expect(await panel.boundingBox()).toEqual(before)
        await expect(select).toBeInViewport({ ratio: 1 })
        await select.selectOption('7')
        await expect(page.locator('.cell')).toHaveCount(81)
        await select.selectOption('all')
      }
    })
  }
})

for (const width of [1440, 390]) {
  test(`keeps digits in a focused board proportional to the cells at width ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await menuAction(page, 'Составное · 8 полей')
    await page.getByLabel('Выбрать поле', { exact: true }).selectOption('1')

    const readable = async (twoDigits = false) => {
      const metrics = await page.locator('.cell input').evaluateAll(
        (inputs, twoDigits) =>
          inputs.map((input) => {
            const style = getComputedStyle(input)
            const context = document.createElement('canvas').getContext('2d')!
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
            return {
              width: input.clientWidth,
              height: input.clientHeight,
              font: parseFloat(style.fontSize),
              textWidth: context.measureText(twoDigits ? '16' : '8').width,
            }
          }),
        twoDigits,
      )
      for (const cell of metrics) {
        expect(cell.font).toBeGreaterThanOrEqual(cell.width * 0.6)
        expect(cell.font).toBeLessThanOrEqual(cell.height)
        expect(cell.textWidth).toBeLessThanOrEqual(cell.width)
      }
    }

    await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await readable()
    await page.screenshot({ path: info.outputPath('focused-50-percent.png'), fullPage: true })
    await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await readable()
    await page.getByRole('button', { name: 'Масштаб 25%, сбросить до 100%', exact: true }).click()
    await readable()
    await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
    await readable()
    for (let i = 0; i < 4; i++)
      await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    await readable()
    await chooseExample(page, 16)
    await readable(true)
    await page.getByRole('button', { name: 'Увеличить поле', exact: true }).click()
    await readable(true)
    await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click()
    await readable(true)
  })
}

for (const height of [640, 900]) {
  test(`uses the desktop panel for zoom before adding horizontal scrolling at height ${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height })
    await page.goto('./')
    await chooseExample(page, 16)
    const grid = page.locator('.sudoku-grid')
    const viewport = page.locator('.grid-viewport')
    const original = (await grid.boundingBox())!
    for (let i = 0; i < 2; i++)
      await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    const enlarged = (await grid.boundingBox())!
    expect(enlarged.width / original.width).toBeCloseTo(1.5, 2)
    const region = (await viewport.boundingBox())!
    expect(enlarged.x).toBeGreaterThanOrEqual(region.x)
    expect(enlarged.x + enlarged.width).toBeLessThanOrEqual(region.x + region.width + 1)
    expect(await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    expect(await viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await page.screenshot({ path: info.outputPath('desktop-150-percent.png'), fullPage: true })

    for (let i = 0; i < 2; i++)
      await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    expect((await grid.boundingBox())!.width / original.width).toBeCloseTo(2, 2)
    const overflow = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)
    if (original.width * 2 > region.width + 1) {
      expect(overflow).toBeGreaterThan(0)
      await viewport.evaluate((el) => el.scrollTo(el.scrollWidth, 0))
      const last = (await page.locator('[data-cell-id="15"]').boundingBox())!
      expect(last.x + last.width).toBeLessThanOrEqual(region.x + region.width + 1)
    } else expect(overflow).toBeLessThanOrEqual(1)
    expect(await viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.getByRole('button', { name: 'Масштаб 200%, сбросить до 100%', exact: true }).click()
    await page.getByRole('button', { name: 'Увеличить поле', exact: true }).click()
    const fullSize = (await grid.boundingBox())!.width
    await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click()
    expect((await grid.boundingBox())!.width / fullSize).toBeCloseTo(1.25, 2)
    expect(await viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Уменьшить поле', exact: true }).click()
    await page.getByRole('button', { name: 'Масштаб 125%, сбросить до 100%', exact: true }).click()
    expect((await grid.boundingBox())!.width).toBeCloseTo(original.width, 1)
  })
}
