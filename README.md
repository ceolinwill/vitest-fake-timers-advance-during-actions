# Vitest 5.1 browser actions advance fake timers for their whole duration

Since Vitest 5.1.0 (vitest-dev/vitest#11242), every locator action in Browser Mode advances fake timers by 50 ms every 50 ms of real time while the action runs, even when the element already exists. A test that freezes the clock with `vi.useFakeTimers()` can no longer keep it frozen across `await locator.click()`: the fake clock moves by however long the click takes in real time. When the click waits for Playwright's actionability checks (here, a button that is still sliding in with a 450 ms CSS transition), the clock moves by roughly a second, and a pending `setTimeout` the test never advanced fires during the click. How far it moves depends on the machine's speed and load, so the same test can pass on one run and fail on the next. `userEvent.keyboard` on the focused element leaves the clock alone. There is no way to opt out per test or per action.

## Reproduction

Requires Node.js 20+.

```sh
npm install   # also runs `playwright install chromium`
npm test
```

[`test/frozen-clock.test.js`](test/frozen-clock.test.js) fakes `setTimeout`, `clearTimeout` and `Date`, renders a plain `<button>` whose `transform` has just started a 450 ms transition, and:

1. records `Date.now()` around `await page.getByRole('button').click()` and expects 0 ms;
2. records `Date.now()` around `await userEvent.keyboard('{Enter}')` on the focused button and expects 0 ms;
3. schedules `setTimeout(() => { fired = true }, 300)`, clicks the button, and expects `fired` to still be `false`.

Output on 5.1.0 (paths shortened, screenshot lines removed):

```
 RUN  v5.1.0 /path/to/repro

 ❯ |chromium| test/frozen-clock.test.js (3 tests | 2 failed) 2406ms
   × click keeps a frozen clock still 1356ms
   × a pending setTimeout does not fire during a click 1021ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |chromium| test/frozen-clock.test.js > click keeps a frozen clock still
AssertionError: expected 1200 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1200

 ❯ test/frozen-clock.test.js:31:20

Trace:
  step   locator              start  duration  location
  click  getByRole('button')  +10ms    1226ms  test/frozen-clock.test.js:28:34

 FAIL  |chromium| test/frozen-clock.test.js > a pending setTimeout does not fire during a click
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ test/frozen-clock.test.js:54:17

Trace:
  step   locator              start  duration  location
  click  getByRole('button')   +0ms     962ms  test/frozen-clock.test.js:52:34

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

The first test's number changes from run to run. Three consecutive runs on the same idle machine gave 950, 900 and 1200 ms. Ten clicks in a row on a button that isn't moving gave `50,0,0,0,0,0,0,0,0,0`, so on a fast, idle machine a static element mostly hides the problem.

### On 5.0.5

Switch both packages to 5.0.5 and all three tests pass:

```sh
npm install -D vitest@5.0.5 @vitest/browser-playwright@5.0.5
npm test
```

```
 RUN  v5.0.5 /path/to/repro

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Expected

With fake timers enabled, an action on an element that already exists and only waits for Playwright's actionability checks doesn't move the fake clock, as on 5.0.5. The test decides when time passes.

## Actual

`Action.#run` in `packages/browser/src/client/tester/action.ts` wraps every provider command in `advanceFakeTimersWhilePending`, which runs `vi.advanceTimersByTime(50)` on a real 50 ms interval until the command settles. Its only condition is `vi.isFakeTimers()`, so there is no per-test or per-action opt-out. The same wrapper is applied in `packages/browser/src/client/tester/context.ts` for `userEvent.pointer` and `userEvent.type`. `userEvent.keyboard` isn't wrapped, which is why test 2 passes.

## Environment

- vitest 5.1.0, @vitest/browser-playwright 5.1.0, playwright 1.65.0 (Chromium, headless)
- Node.js 24.22.0, npm 11.19.1
- macOS 27.2, Apple M4 Max
