import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

// A button that is still sliding in, like one inside a drawer that just opened.
// Playwright's click waits until it stops moving (~450 ms of real time).
function renderMovingButton() {
  document.body.innerHTML = '<button style="transition: transform 450ms">Save</button>'
  const button = document.querySelector('button')
  button.style.transform = 'translateX(0px)'
  getComputedStyle(button).transform
  button.style.transform = 'translateX(200px)'
  return button
}

test('click keeps a frozen clock still', async () => {
  renderMovingButton()

  const before = Date.now()
  await page.getByRole('button').click()
  const advanced = Date.now() - before

  expect(advanced).toBe(0)
})

test('keyboard keeps a frozen clock still', async () => {
  const button = renderMovingButton()
  button.focus()

  const before = Date.now()
  await userEvent.keyboard('{Enter}')
  const advanced = Date.now() - before

  expect(advanced).toBe(0)
})

test('a pending setTimeout does not fire during a click', async () => {
  let fired = false
  setTimeout(() => {
    fired = true
  }, 300)

  renderMovingButton()
  await page.getByRole('button').click()

  expect(fired).toBe(false)
})
