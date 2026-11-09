// Scenario template for Correlation Studio's "Record Scenario
// (Playwright)..." Tools menu action.
//
// Copy this file once per scenario (e.g. checkout.js, login.js) and fill in
// the UI steps for that scenario. The plugin invokes this script as a plain
// Node process — nothing here depends on the Playwright Test Runner — and
// reads these environment variables, which the plugin sets for you (never
// hardcode real values here, and never accept them as command-line
// arguments: an argument list can show up in the OS process listing;
// environment variables set just for this one child process do not):
//
//   HAR_OUTPUT_PATH   - absolute path to write the .har file to (required)
//   APP_BASE_URL      - the application's base URL for this release (required)
//   LOGIN_USERNAME    - test account username (optional, if this scenario logs in)
//   LOGIN_PASSWORD    - test account password (optional, if this scenario logs in)
//
// Tip: don't write the UI steps from scratch. Run:
//   npx playwright codegen <your app's URL>
// and click through the scenario once — Playwright generates the
// corresponding page.click()/page.fill() lines for you. Paste those into
// the "Perform the scenario" section below and adjust as needed. Or use the
// "Record New Scenario Script..." Tools menu action, which drives codegen
// and does this merge for you automatically.
//
// Optional: wrap a logical step with markTransactionStart('Name') /
// markTransactionEnd('Name') to group its requests under a named Transaction
// Controller in the generated .jmx — every request between the two calls is
// grouped, by timestamp. This mirrors the same EVENT: protocol the live
// interactive recorder uses, just triggered by explicit calls here instead
// of button clicks, so both paths produce transaction grouping the same way.
//
// Optional: wrap a step with assertTextStart('Expected Text') /
// assertTextEnd('Expected Text') to add a Response Assertion (checking the
// response body contains that text) to every request between the two calls
// — same bracket pattern as markTransactionStart/End, just adding an
// assertion to what falls inside instead of grouping it. Nest these inside
// (or alongside) a markTransactionStart/End pair freely; each pair is
// independent, so a request can get both a Transaction Controller and a
// text assertion, either, or neither.
//
// Optional: after a navigation settles, call
// await captureRenderTiming(page, 'Some Label') to capture that page's
// actual browser rendering metrics (DOMContentLoaded, First Paint, First
// Contentful Paint, Largest Contentful Paint) from the real browser driving
// this recording. IMPORTANT — this is informational only, a one-time
// baseline from this single recording session: it is NOT part of the
// generated .jmx and does not scale with load, since the actual load test
// replays raw HTTP requests with no browser involved at all. Shown as a
// separate report after generation, alongside (not inside) the HAR/.jmx
// output.
//
// "After a navigation settles" means waited-for, not assumed — call
// await waitForNetworkIdle(page) first, a named wrapper around Playwright's
// own page.waitForLoadState('networkidle'). Or skip the two-call version and
// use await captureRenderTimingAfterIdle(page, 'Some Label') instead, which
// does both in one call. If a specific page polls in the background forever
// (so network idle never arrives and this would just time out), call
// page.waitForLoadState('load') directly instead — these helpers exist for
// the common case, not to hide Playwright's own lower-level API.
//
// Automatic, no call needed: every request's own network-level timing
// breakdown (DNS lookup, initial connection, SSL, waiting/TTFB, content
// download — the same phases Chrome DevTools' Network tab shows) is
// captured for the whole scenario and shown per-transaction afterward.
// Same informational-only caveat as render timing above: real browser,
// one session, not something the load test itself measures. Note two
// DevTools phases Playwright's Resource Timing API doesn't expose at all —
// proxy negotiation, and "Request sent" as its own precise duration — so
// those aren't shown; everything else is computed from real values, not
// estimated.
//
// A note on confirmation popups/toasts that auto-dismiss after a few
// seconds: a plain locator.waitFor({ state: 'visible' }) can genuinely miss
// one entirely, since it polls the DOM rather than watching continuously -
// if the toast appears and fully disappears between two polling checks
// (more likely if anything else on the page is briefly busy, e.g. a
// different component's own rendering work), the wait can time out even
// though the operation plainly succeeded. Where the toast is triggered by
// an API call, waiting for that response instead (page.waitForResponse(),
// registered BEFORE the triggering click, not after) is far more robust -
// it fires at the network layer regardless of how busy the page's own
// rendering is. Racing the two with Promise.any() - not Promise.all(),
// which would wait for both to settle rather than either one - lets
// whichever signal arrives first unblock the script:
//
//   const responsePromise = page.waitForResponse(r => r.url().includes('/api/submit'));
//   await page.click('#submit');
//   await Promise.any([page.locator('text=Saved').waitFor({ state: 'visible' }), responsePromise]);
//
// Call logStep('Doing X') before each significant action (navigation,
// click, fill, a long wait). The Java side shows the most recent one live
// while the scenario is running, in both "Record Scenario (Playwright)..."
// and "Record New Scenario Script...". This matters specifically in
// headless mode: with no visible browser and nothing logged between
// actions, a single slow or stuck step is indistinguishable from the whole
// process having hung - the live step display turns that into "here's
// exactly which action it's currently on."
//
// Prerequisites on the machine running this (once, not per scenario):
//   npm install -D playwright
//   npx playwright install chromium

const { chromium } = require('playwright');

async function main() {
    const harOutputPath = requireEnv('HAR_OUTPUT_PATH');
    const baseUrl = requireEnv('APP_BASE_URL');
    const username = process.env.LOGIN_USERNAME || '';
    const password = process.env.LOGIN_PASSWORD || '';

    const browser = await chromium.launch({ headless: true });
    // content: 'embed' stores response bodies inline in the HAR file itself —
    // required for correlation, which needs to see the actual response text,
    // not just headers/timing. (For a plain .har path this is already the
    // default, but setting it explicitly avoids depending on that default.)
    const context = await browser.newContext({
        recordHar: { path: harOutputPath, content: 'embed' },
        // Headless Chromium defaults to 800x600 unless set explicitly - a
        // responsive app can collapse or hide navigation elements (a logo,
        // a menu flyout) at that size that a normal, larger browser window
        // would show without issue.
        viewport: { width: 1920, height: 1080 },
        // Chromium's headless mode reports "HeadlessChrome" in its own
        // User-Agent string by default - some apps detect this specifically
        // and serve a degraded or different UI (hiding navigation chrome,
        // skipping certain renders) regardless of viewport size. Confirmed
        // as a second, separate cause behind reported, reproduced failures
        // where API/network calls succeeded but specific UI elements never
        // rendered - a plain desktop Chrome UA avoids it entirely.
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    // Automatic — no explicit call needed per request, unlike captureRenderTiming.
    // Captures every request's network-level timing breakdown (DNS, connect, SSL,
    // waiting/TTFB, content download) for the whole scenario, grouped back into
    // transactions afterward by timestamp (same mechanism as markTransactionStart/End).
    attachNetworkTimingCapture(context);

    try {
        const page = await context.newPage();
        // Captures client-side JS errors as they happen - without this,
        // there is no visibility into whether the app's own JavaScript is
        // throwing a runtime error specifically in headless mode, which can
        // explain network/API calls succeeding while specific UI elements
        // never render.
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.error(`[BROWSER CONSOLE ERROR] ${msg.text()}`);
            }
        });
        page.on('pageerror', (err) => {
            console.error(`[BROWSER PAGE ERROR] ${err.message}`);
        });

        // ---- Perform the scenario: replace this section per scenario ----
        logStep(`Navigating to ${baseUrl}`);
        await page.goto(baseUrl);
        await captureRenderTiming(page, 'Homepage'); // optional — see header comment

        if (username && password) {
            // Example login flow — replace selectors with your app's actual ones,
            // or better, paste them from `npx playwright codegen` output.
            markTransactionStart('Login');
            assertTextStart('Welcome');
            logStep('Filling in login credentials');
            await page.fill('#username', username);
            await page.fill('#password', password);
            logStep('Clicking login button');
            await page.click('#login-button');
            logStep('Waiting for page to settle after login');
            await page.waitForLoadState('networkidle');
            assertTextEnd('Welcome');
            markTransactionEnd('Login');
        }

        // Example scenario steps — replace with the actual scenario:
        // markTransactionStart('Checkout');
        // await page.click('text=Start Checkout');
        // await page.fill('#quantity', '2');
        // await page.click('#submit-order');
        // await page.waitForLoadState('networkidle');
        // assertTextStart('Order Confirmed');
        // await page.waitForLoadState('networkidle');
        // assertTextEnd('Order Confirmed');
        // markTransactionEnd('Checkout');
        // ---- End of scenario-specific section ----

    } finally {
        // CRITICAL: the HAR is only flushed to disk on context.close(), and only
        // if it's actually reached — that's why this is in a finally block. If
        // the scenario throws partway through, whatever was captured up to that
        // point is still saved, rather than lost entirely.
        await context.close();
        await browser.close();
    }
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

// Mirrors interactive-recorder.js's EVENT: protocol so both paths produce
// transaction grouping the same way in HarToJmxGenerator. Every request whose
// timestamp falls between a start/end pair is grouped under a Transaction
// Controller named accordingly — wrap as many, or as few, logical steps as
// you want; anything left unwrapped just stays ungrouped, same as today.
function markTransactionStart(name) {
    console.log(`EVENT:START_TXN:${name}:${Date.now()}`);
}

function markTransactionEnd(name) {
    console.log(`EVENT:END_TXN:${name}:${Date.now()}`);
}

// Same bracket idea as markTransactionStart/End, but adds a Response
// Assertion (checking the response body contains expectedText) to every
// request in the window instead of grouping it under a Transaction
// Controller. Keep expectedText free of colons and newlines — it's carried
// through this same simple EVENT: line format.
function assertTextStart(expectedText) {
    console.log(`EVENT:ASSERT_TEXT_START:${expectedText}:${Date.now()}`);
}

function assertTextEnd(expectedText) {
    console.log(`EVENT:ASSERT_TEXT_END:${expectedText}:${Date.now()}`);
}

// See the header comment above for why this exists. Plain console.log, not
// another EVENT: line - this is meant for a person watching progress, not
// for TransactionMarker/TextAssertionMarker to parse.
function logStep(message) {
    console.log(`[STEP] ${message}`);
}

// Thin, named wrapper around Playwright's own page.waitForLoadState('networkidle') -
// resolves once there have been no new network requests for at least 500ms (that
// threshold is Playwright's own, not something chosen here). Call this before
// captureRenderTiming(page, label) so the metrics it reads reflect a page that has
// actually finished loading, not a snapshot taken mid-request. timeoutMs is optional;
// Playwright's own default (30s) applies if omitted.
async function waitForNetworkIdle(page, timeoutMs) {
    await page.waitForLoadState('networkidle', timeoutMs ? { timeout: timeoutMs } : undefined);
}

// Convenience: waitForNetworkIdle(page) immediately followed by
// captureRenderTiming(page, label) — the common pairing, in one call instead of two.
async function captureRenderTimingAfterIdle(page, label, timeoutMs) {
    await waitForNetworkIdle(page, timeoutMs);
    await captureRenderTiming(page, label);
}

// Tracks the navigation this process has already reported on, across calls, so a
// repeat capture of the SAME underlying page load (see the warning below) can be
// detected and flagged rather than silently shown as if it were a fresh one.
let lastReportedNavigationStart = null;

// Reads the real browser's own Performance API for the CURRENT page — call this
// right after a navigation has settled (e.g. after waitForLoadState('load') or
// 'networkidle'), not immediately after goto(), or these numbers will be
// incomplete. One-time baseline only — see the header comment above for why
// this isn't, and can't be, part of the actual load test.
//
// IMPORTANT limitation for single-page apps (anything using client-side/hash
// routing, e.g. a "#/some-view" URL): a "page transition" that doesn't trigger
// an actual browser-level navigation — just an AJAX call plus a DOM update —
// has no corresponding Navigation Timing entry at all. In that case this will
// keep reading the SAME navigation entry as an earlier capture (same
// DOMContentLoaded/Load/paint values, because it genuinely is the same
// underlying page load), not fresh data for that specific step. This is a
// real constraint of the browser's own Performance API, not a bug here — it
// can't measure a transition that was never a real navigation to begin with.
// Detected and flagged below so it's visible rather than silently misleading.
async function captureRenderTiming(page, label) {
    try {
        const metrics = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0] || {};
            const paintEntries = performance.getEntriesByType('paint');
            const firstPaint = paintEntries.find((e) => e.name === 'first-paint');
            const firstContentfulPaint = paintEntries.find((e) => e.name === 'first-contentful-paint');
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
            const largestContentfulPaint = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1] : null;
            return {
                navigationStartTime: nav.startTime != null ? nav.startTime : null,
                domContentLoaded: nav.domContentLoadedEventEnd || null,
                loadEvent: nav.loadEventEnd || null,
                firstPaint: firstPaint ? firstPaint.startTime : null,
                firstContentfulPaint: firstContentfulPaint ? firstContentfulPaint.startTime : null,
                largestContentfulPaint: largestContentfulPaint ? largestContentfulPaint.startTime : null,
            };
        });

        if (lastReportedNavigationStart !== null && metrics.navigationStartTime === lastReportedNavigationStart) {
            console.error(`WARNING: captureRenderTiming("${label}") is reading the SAME browser `
                    + 'navigation as an earlier capture in this run \u2014 this page did not actually '
                    + 'reload/navigate since then (common for single-page apps with client-side/hash '
                    + 'routing). The numbers below describe the FIRST page load, not this specific step.');
        }
        lastReportedNavigationStart = metrics.navigationStartTime;

        // navigationStartTime was only for the check above — not part of what gets shown.
        const { navigationStartTime, ...displayMetrics } = metrics;
        console.log(`EVENT:RENDER_TIMING:${label}:${JSON.stringify(displayMetrics)}:${Date.now()}`);
    } catch (err) {
        // Non-fatal — a page that navigates away immediately, or a browser context
        // that doesn't support one of these entry types, shouldn't fail the whole
        // scenario over an optional, informational measurement.
        console.error(`Could not capture render timing for "${label}": ${err.message}`);
    }
}

// Attaches a context-wide listener capturing every request's own network-level
// timing breakdown throughout the whole scenario — automatic, no per-request call
// needed, unlike captureRenderTiming. Each request.timing() field is relative to
// that request's own startTime, -1 if that phase didn't happen (e.g. DNS/connect
// are -1 for a request reusing an already-open connection) — passed through as-is
// so the Java side computes the same DevTools-style phase durations consistently
// in one place rather than duplicating that math here and there.
function attachNetworkTimingCapture(context) {
    // Deliberately NOT async: request.timing() is itself synchronous (returns a
    // plain object, not a Promise), so there is no need to defer this at all —
    // and doing so is actively harmful. An async handler here runs as a
    // microtask that Node schedules for "later," and if the scenario errors
    // out and calls process.exit() before that microtask gets a turn, the log
    // line is silently lost entirely — confirmed by direct reproduction, not
    // just suspected. A plain synchronous handler runs immediately, in the
    // same tick as the event itself, so there is no gap for an exit to race
    // ahead of it.
    context.on('requestfinished', (request) => {
        try {
            const timing = request.timing();
            const payload = {
                url: request.url(),
                method: request.method(),
                startTime: timing.startTime,
                domainLookupStart: timing.domainLookupStart,
                domainLookupEnd: timing.domainLookupEnd,
                connectStart: timing.connectStart,
                secureConnectionStart: timing.secureConnectionStart,
                connectEnd: timing.connectEnd,
                requestStart: timing.requestStart,
                responseStart: timing.responseStart,
                responseEnd: timing.responseEnd,
            };
            console.log(`EVENT:NETWORK_TIMING:${JSON.stringify(payload)}:${Date.now()}`);
        } catch (err) {
            // Non-fatal — a request that fails/aborts before timing is available
            // shouldn't fail the whole scenario over an optional measurement.
            console.error(`Could not capture network timing for ${request.url()}: ${err.message}`);
        }
    });
}

main().catch((err) => {
    console.error('Scenario failed:', err && err.stack ? err.stack : err);
    process.exit(1);
});
