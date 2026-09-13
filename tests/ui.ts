import type { Page } from '@playwright/test'

export async function menuAction(page: Page, name: string) {
  await page.getByText('Ещё', { exact: true }).click()
  await page.getByRole('button', { name, exact: true }).click()
}
export async function chooseExample(page: Page, size: 9 | 16) {
  await menuAction(page, size === 9 ? '9 × 9 Классика' : '16 × 16 Из журнала')
}
export async function setSpeed(page: Page, speed: 'fast' | 'normal' | 'slow') {
  await menuAction(page, 'Настройки решения')
  await page.getByLabel('Скорость решения').selectOption(speed)
  await page.getByRole('button', { name: 'Закрыть: Настройки решения', exact: true }).click()
}
