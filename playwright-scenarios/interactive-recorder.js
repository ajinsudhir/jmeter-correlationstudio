// Interactive recorder for Correlation Studio's "Record Scenario
// Interactively..." Tools menu action.
//
// Unlike scenario-template.js (a fully-scripted, unattended replay written
// once and re-run every release), this opens a real browser for a person
// to click through BY HAND, right now, while the JMeter plugin sends
// transaction-boundary and text-assertion commands to this process's stdin
// as they click "Start/End Transaction" and "Start/End Text Assertion" in
// its own dialog. This file is launched as-is by the plugin — nothing
// here needs editing per scenario.
//
// Reads from stdin, one command per line:
//   START_TXN:<name>               - mark the start of a named transaction, right now
//   END_TXN:<name>                 - mark its end
//   ASSERT_TEXT_START:<text>       - mark the start of a text-assertion window
//   ASSERT_TEXT_END:<text>         - mark its end
//   CAPTURE_RENDER_TIMING:<label>  - read the CURRENT page's real browser
//                                    rendering metrics right now (reference
//                                    baseline only — see scenario-template.js's
//                                    header comment for why this isn't, and
//                                    can't be, part of the actual load test)
//   STOP                           - close the browser and finish (also
//                                    triggered automatically if the person
//                                    just closes the browser window instead)
//
// Writes to stdout, one event per line, so the plugin can build a timeline:
//   EVENT:READY:<epochMillis>
//   EVENT:START_TXN:<name>:<epochMillis>
//   EVENT:END_TXN:<name>:<epochMillis>
//   EVENT:ASSERT_TEXT_START:<text>:<epochMillis>
//   EVENT:ASSERT_TEXT_END:<text>:<epochMillis>
//   EVENT:RENDER_TIMING:<label>:<json>:<epochMillis>
//   EVENT:NETWORK_TIMING:<json>:<epochMillis>  - automatic, every request, no
//                               command needed (DNS/connect/SSL/TTFB/download
//                               breakdown, same as Chrome DevTools' Network
//                               tab, informational only)
//   EVENT:STOPPED:<epochMillis>:<harPath>
//
// Environment variables (set by the plugin):
//   HAR_OUTPUT_PATH   - absolute path to write the .har file to (required)
//   APP_BASE_URL      - initial URL to open (required)

const { chromium } = require('playwright');
const readline = require('readline');

async function main() {
    const harOutputPath = requireEnv('HAR_OUTPUT_PATH');
    const baseUrl = requireEnv('APP_BASE_URL');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        recordHar: { path: harOutputPath, content: 'embed' },
    });
    // Automatic — no command needed, unlike the other captures below. Mirrors
    // scenario-template.js's attachNetworkTimingCapture() exactly, including
    // deliberately NOT being async — see that file's comment for why an async
    // handler here can silently lose events to a later process.exit().
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
            console.error(`Could not capture network timing for ${request.url()}: ${err.message}`);
        }
    });
    const page = await context.newPage();
    // Tracks the navigation already reported on, across CAPTURE_RENDER_TIMING
    // commands in this session — see scenario-template.js's captureRenderTiming
    // for why this matters (detecting a repeat capture of the same underlying
    // page load, common for single-page apps with client-side/hash routing).
    let lastReportedNavigationStart = null;
    await page.goto(baseUrl);

    let stopped = false;
    const stop = async () => {
        if (stopped) {
            return;
        }
        stopped = true;
        try {
            await context.close(); // flushes the HAR to disk
        } catch (err) {
            // Browser may already be gone if the person closed it manually —
            // whatever was captured up to that point should still have been
            // flushed by that close; nothing more to do here.
        }
        try {
            await browser.close();
        } catch (err) {
            // Already closed.
        }
        console.log(`EVENT:STOPPED:${Date.now()}:${harOutputPath}`);
        process.exit(0);
    };

    // If the person just closes the browser window instead of clicking "Stop
    // Recording" in the plugin's dialog, treat that the same way rather than
    // waiting forever for a STOP command that will never come.
    browser.on('disconnected', () => {
        stop();
    });

    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('START_TXN:')) {
            const name = trimmed.substring('START_TXN:'.length);
            console.log(`EVENT:START_TXN:${name}:${Date.now()}`);
        } else if (trimmed.startsWith('END_TXN:')) {
            const name = trimmed.substring('END_TXN:'.length);
            console.log(`EVENT:END_TXN:${name}:${Date.now()}`);
        } else if (trimmed.startsWith('ASSERT_TEXT_START:')) {
            const text = trimmed.substring('ASSERT_TEXT_START:'.length);
            console.log(`EVENT:ASSERT_TEXT_START:${text}:${Date.now()}`);
        } else if (trimmed.startsWith('ASSERT_TEXT_END:')) {
            const text = trimmed.substring('ASSERT_TEXT_END:'.length);
            console.log(`EVENT:ASSERT_TEXT_END:${text}:${Date.now()}`);
        } else if (trimmed.startsWith('CAPTURE_RENDER_TIMING:')) {
            const label = trimmed.substring('CAPTURE_RENDER_TIMING:'.length);
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
                            + 'navigation as an earlier capture in this session \u2014 the page did not '
                            + 'actually reload/navigate since then (common for single-page apps with '
                            + 'client-side/hash routing). The numbers below describe the FIRST page load, '
                            + 'not this specific moment.');
                }
                lastReportedNavigationStart = metrics.navigationStartTime;

                const { navigationStartTime, ...displayMetrics } = metrics;
                console.log(`EVENT:RENDER_TIMING:${label}:${JSON.stringify(displayMetrics)}:${Date.now()}`);
            } catch (err) {
                console.error(`Could not capture render timing for "${label}": ${err.message}`);
            }
        } else if (trimmed === 'STOP') {
            stop();
        }
    });

    console.log(`EVENT:READY:${Date.now()}`);
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

main().catch((err) => {
    console.error('Interactive recorder failed:', err && err.stack ? err.stack : err);
    process.exit(1);
});
