import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { chooseExample, menuAction, setSpeed } from './ui'

const values = (page: Page) =>
  page
    .locator('.cell input')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))

// Editing a built-in example enters the same confirmation flow as manual input.
async function editFirstGiven(page: Page) {
  const cell = page.locator('.cell input').first()
  const value = await cell.inputValue()
  await cell.fill(value ? '' : '1')
  await cell.fill(value)
}

async function watchSolver(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & { solverReplies: unknown[] }
    target.solverReplies = []
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (String(url).includes('solver.worker'))
          this.addEventListener('message', (event) => target.solverReplies.push(event.data))
      }
    }
  })
}

async function expectUnrevealed(page: Page, givens: string[]) {
  expect(await values(page)).toEqual(givens)
  await expect(page.getByRole('button', { name: 'Сохранить решение', exact: true })).toHaveCount(0)
  await expect(page.locator('.cell.latest, .cell.guess, .is-solved')).toHaveCount(0)
  expect(
    await page.evaluate(() => {
      const replies = (
        window as typeof window & { solverReplies: { events?: unknown[]; result?: { values?: unknown } }[] }
      ).solverReplies
      return replies.length > 0 && replies.every((reply) => !reply.events?.length && !reply.result?.values)
    }),
  ).toBe(true)
}

for (const example of [9, 16, 'eight'] as const) {
  test(`checks uniqueness without revealing any digits for ${example}`, async ({ page }, info) => {
    await page.goto('./')
    if (example === 'eight') {
      await menuAction(page, 'Составное · 8 полей')
      await page.getByLabel('Выбрать поле', { exact: true }).selectOption('all')
    } else await chooseExample(page, example)
    await editFirstGiven(page)
    await setSpeed(page, 'slow')
    const givens = await values(page)
    await watchSolver(page)
    await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
    await expect(page.getByText('Корректное судоку', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('У задачи ровно одно решение.', { exact: true })).toBeVisible()
    await expect(page.locator('.solve-status')).toHaveCSS('background-color', 'rgb(237, 249, 240)')
    await expect(page.getByRole('button', { name: 'Я заполнил числа', exact: true })).toHaveCount(0)
    await expectUnrevealed(page, givens)
    await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeEnabled()
    if (example === 9) {
      await page.screenshot({ path: info.outputPath('check-result.png'), fullPage: true })
      await setSpeed(page, 'fast')
      await page.getByRole('button', { name: 'Решить судоку', exact: true }).click()
      await expect(page.getByText('Судоку решено!', { exact: true })).toBeVisible()
    }
  })
}

for (const digit of ['1', '5']) {
  test(`reports no solution for ${digit === '5' ? 'conflicting' : 'inconsistent'} givens and clears the status after an edit`, async ({
    page,
  }) => {
    await page.goto('./')
    await chooseExample(page, 9)
    const cell = page.getByLabel('Строка 1, столбец 3', { exact: true })
    await cell.fill(digit)
    const givens = await values(page)
    await watchSolver(page)
    await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
    const title = digit === '5' ? 'В исходных числах есть конфликт' : 'У этой задачи нет решения'
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    await expect(page.locator('.solve-status')).toHaveCSS('background-color', 'rgb(255, 241, 242)')
    await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
    await expectUnrevealed(page, givens)
    await cell.fill('')
    await expect(page.getByText(title, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
    await expect(page.getByText('Корректное судоку', { exact: true })).toBeVisible()
  })
}

test('reports multiple solutions without exposing one of them', async ({ page }) => {
  await page.goto('./')
  await menuAction(page, 'Ввести вручную')
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).fill('1')
  const givens = await values(page)
  await watchSolver(page)
  await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
  await expect(page.getByText('Есть несколько решений', { exact: true })).toBeVisible()
  await expect(page.locator('.solve-status')).toHaveCSS('background-color', 'rgb(255, 248, 217)')
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeEnabled()
  await expect(page.getByText('У задачи несколько решений.', { exact: true })).toBeVisible()
  await expectUnrevealed(page, givens)
})

test('keeps a timed-out check inconclusive and resumes or cancels without revealing digits', async ({
  page,
}) => {
  await page.context().route('**/solver.worker.ts*', async (route) => {
    const response = await route.fetch()
    const clock = `{
      const realNow = performance.now.bind(performance);
      let simulateBudget = true, tick = 0;
      Object.defineProperty(performance, 'now', {value: () => simulateBudget ? (tick += 16000) : realNow()});
      self.addEventListener('message', event => { if (event.data.type === 'continue') simulateBudget = false; });
    }\n`
    await route.fulfill({ response, body: clock + (await response.text()) })
  })
  await page.goto('./')
  await chooseExample(page, 9)
  await editFirstGiven(page)
  const givens = await values(page)
  await watchSolver(page)
  await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
  await expect(page.getByText('Проверка не завершена', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
  await expectUnrevealed(page, givens)
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(page.getByText('Корректное судоку', { exact: true })).toBeVisible()
  await expectUnrevealed(page, givens)
  await editFirstGiven(page)
  await page.getByRole('button', { name: 'Я заполнил числа', exact: true }).click()
  await expect(page.getByText('Проверка не завершена', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Остановить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Я заполнил числа', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
  await chooseExample(page, 16)
  await expect(page.getByText('Корректное судоку', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Проверка не завершена', { exact: true })).toHaveCount(0)
})

test('waits for manual confirmation and does not offer a separate check action', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Проверить судоку', exact: true })).toHaveCount(0)
  await menuAction(page, 'Ввести вручную')
  const confirm = page.getByRole('button', { name: 'Я заполнил числа', exact: true })
  const solve = page.getByRole('button', { name: 'Решить судоку', exact: true })
  await expect(confirm).toBeDisabled()
  await watchSolver(page)
  await page.getByLabel('Строка 1, столбец 1', { exact: true }).fill('1')
  await expect(confirm).toBeEnabled()
  await expect(solve).toBeDisabled()
  expect(
    await page.evaluate(() => (window as typeof window & { solverReplies: unknown[] }).solverReplies),
  ).toEqual([])
  await confirm.click()
  await expect(page.getByText('Есть несколько решений', { exact: true })).toBeVisible()
  await expect(solve).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Проверить судоку', exact: true })).toHaveCount(0)
})

test('can retry an automatic check after a worker failure', async ({ page }) => {
  await page.context().route(
    '**/solver.worker.ts*',
    (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: "self.onmessage = () => self.postMessage({type: 'error'});",
      }),
    { times: 1 },
  )
  await page.goto('./')
  await chooseExample(page, 9)
  await editFirstGiven(page)
  const confirm = page.getByRole('button', { name: 'Я заполнил числа', exact: true })
  await confirm.click()
  await expect(page.getByText('Не удалось проверить судоку', { exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Решить судоку', exact: true })).toBeDisabled()
  await confirm.click()
  await expect(page.getByText('Корректное судоку', { exact: true })).toBeVisible()
})
