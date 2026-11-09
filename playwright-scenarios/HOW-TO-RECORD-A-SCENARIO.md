# How to create a scenario script by browsing the UI

You don't write the `page.click()` / `page.fill()` lines by hand.
Playwright has a tool called **codegen** that opens a real browser,
watches what you click and type, and writes the corresponding code for
you in real time. This guide walks through generating one scenario
script from scratch, start to finish.

## One-time setup (skip if you've already done this once)

Open Command Prompt in a folder where you want to keep your scenario
scripts (e.g. `C:\Perf\playwright-scenarios`), and run:

```cmd
npm init -y
npm install -D playwright
npx playwright install chromium
```

`npm init -y` just creates a minimal `package.json` so `npm install`
has somewhere to put things — you only need this once per folder, not
once per scenario.

## Step 1: Record the UI actions

Run this, with your application's actual URL:

```cmd
npx playwright codegen https://your-app-url.com
```

Two windows open:
- A real Chromium browser, pointed at your app.
- A **Playwright Inspector** window, showing generated code that fills
  in live as you interact with the browser.

Click through the scenario exactly as a real user would — log in,
navigate, fill out the form, submit, whatever the scenario actually is.
Watch the Inspector panel: every click and every field you type into
turns into a line like `await page.fill('#username', 'yourtestuser');`
or `await page.click('text=Add to Cart');` as you go.

When you're done with the scenario, close the browser window. Codegen
stops and the Inspector has the full generated code.

**Tip — save directly to a file instead of copying by hand:**

```cmd
npx playwright codegen -o generated-checkout.js https://your-app-url.com
```

This writes the generated code straight to `generated-checkout.js` when
you close the browser, so there's no copy-paste step at all.

## Step 2: Pull the action lines into your scenario template

Open `generated-checkout.js`. It'll look roughly like this (Playwright's
own Test Runner format, which we're not using directly):

```js
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://your-app-url.com/');
  await page.fill('#username', 'yourtestuser');
  await page.fill('#password', 'yourtestpassword');
  await page.click('#login-button');
  await page.click('text=Start Checkout');
  await page.fill('#quantity', '2');
  await page.click('#submit-order');
});
```

You want **only the `await page....` action lines** — not the
`import`/`test(...)` wrapper around them, since our template already
provides that wrapper (env vars, HAR recording, cleanup).

1. Copy `scenario-template.js` to a new file named after this scenario,
   e.g. `checkout.js`.
2. Open both `checkout.js` and `generated-checkout.js` side by side.
3. In `checkout.js`, find this section:
   ```js
   // ---- Perform the scenario: replace this section per scenario ----
   await page.goto(baseUrl);
   ...
   // ---- End of scenario-specific section ----
   ```
4. Paste the action lines from `generated-checkout.js` in between,
   **skipping the first `await page.goto(...)` line** if codegen
   generated one too — the template already has its own.

## Step 3: Replace hardcoded credentials — important, easy to miss

Codegen recorded exactly what you typed. If you typed a real test
username and password while recording, they're sitting in the
generated file **as literal text**:

```js
await page.fill('#username', 'yourtestuser');     // <- codegen's raw output
await page.fill('#password', 'yourtestpassword');
```

Replace those two literal values with the template's own `username`
and `password` variables (already read from environment variables at
the top of the file), so nothing is hardcoded:

```js
await page.fill('#username', username);
await page.fill('#password', password);
```

Check the rest of the pasted lines too, for anything else you typed
that shouldn't be hardcoded (an order ID, a real email address you
used for testing, etc.).

## Step 4: Test it directly before using it in the plugin

Run it by hand first, with the required environment variables set, so
you can see any problems directly rather than through the plugin's
dialog:

**Command Prompt:**
```cmd
set HAR_OUTPUT_PATH=C:\Perf\test.har
set APP_BASE_URL=https://your-app-url.com
set LOGIN_USERNAME=yourtestuser
set LOGIN_PASSWORD=yourtestpassword
node checkout.js
```

**PowerShell:**
```powershell
$env:HAR_OUTPUT_PATH="C:\Perf\test.har"
$env:APP_BASE_URL="https://your-app-url.com"
$env:LOGIN_USERNAME="yourtestuser"
$env:LOGIN_PASSWORD="yourtestpassword"
node checkout.js
```

If it exits with no errors and `test.har` appears at that path, the
script is ready to use in the "Record Scenario (Playwright)..." dialog
in JMeter. If it errors out, the message usually names the exact
selector that couldn't be found — the app either hasn't finished
loading yet at that point (add `await page.waitForLoadState('networkidle');`
before the failing line) or the element's selector needs adjusting.

## Common issues

- **"Timeout waiting for selector"** — the page hadn't finished loading
  when that line ran. Add `await page.waitForLoadState('networkidle');`
  right after the navigation or click that leads to that page.
- **Codegen recorded something too specific** (e.g. a CSS selector tied
  to a random generated ID) — swap it for a more stable one Playwright
  can also generate for you: `page.getByRole('button', { name: 'Submit' })`
  or `page.getByText('Submit Order')` are usually more durable across
  releases than an auto-generated CSS path.
- **Nothing happens / browser closes immediately** — check you closed
  the *codegen* browser window deliberately when done; closing it early
  cuts the recording short.
