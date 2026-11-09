## SmartBlitz JMeter Workbench (Correlation Studio) v1.0.0

First public release.

- **Auto-Correlator.** Finds values that one response produces and a later request reuses (session tokens, CSRF tokens, viewstate, IDs), and suggests a Regular Expression Extractor plus variable substitution for each. Review, edit and approve in a table. A new `.jmx` is always written; your original is never modified. Heuristic, not guaranteed: review every candidate.
- **Templates.** Save extractors as reusable templates and apply them on the next release. Built-in templates cover common frameworks and platforms; scan a script for existing extractors, create your own rules, export and import.
- **Compare Scripts / Recordings.** Diff any mix of `.jmx`, `.har` and `.jtl` to see added, removed and changed requests with field-level before and after. Typical use: last release's script against this release's fresh recording.
- **Record a New Scenario.** One guided flow with three paths: generate a Playwright script from scratch, re-record an existing script that follows the scenario template, or record interactively. Produces a HAR and a `.jmx`.
- **Capture Render Timing Under Load.** Starts your load test, then replays the scenario once in a real browser while the load is active. Reports DOMContentLoaded, Load, First Paint, First and Largest Contentful Paint per transaction, plus per-request network timings (DNS, connect, SSL, TTFB, download).
- **Test Data Generator.** Table-based column editor with names, emails, phones, dates, UUIDs, sequences and numbers (zero-padded if needed), lists, weighted values, patterns and templates. Preview, then generate a CSV.
- **Fail loudly.** Optional assertions so a correlation that silently extracts nothing fails the test instead of passing quietly.

### Install
Download `jmeter-correlationstudio.jar`, copy it into `<JMETER_HOME>/lib/ext/`, restart JMeter. Requires JMeter 5.6.3 and Java 11+.
