# Changelog and design notes

This is the project's running development log, newest entries first, kept verbatim from the original README. For an overview, see [README.md](README.md).

---

## Capture Render Timing Under Load: an empty Render Timings tab now explains why

Reported directly: Network Timings showed real data but the Render Timings tab was
empty, with nothing explaining why. That's actually expected, not a bug - unlike
network timing (automatic, every request, no call needed), render timing is opt-in:
it only appears for navigations the script explicitly calls `captureRenderTiming(page,
label)` or `captureRenderTimingAfterIdle(page, label)` after. A script with no such call
will always show this empty. The status message previously only explained the case
where *both* came back empty; this specific, more common case (network timing present,
render timing not) now gets its own clear explanation and points at adding the call in
the Script tab if render metrics are wanted too.

## Script tab: wrap a selection as a transaction, and a way to continue after declining the popup

Requested directly, from two concrete problems with the Script tab: declining the
one-time "Run it now?" popup was a dead end with no other way to continue once editing
was done, and grouping a block of recorded lines into a transaction meant positioning
the cursor and inserting `markTransactionStart`/`markTransactionEnd` separately by hand.

- **Continue to Generate .jmx\u2026** is a persistent button at the bottom of the Script
  tab, enabled once a script exists, doing exactly what confirming "Run it now?" does -
  available any time, not just in that one popup right after recording. It saves the
  script first, so an edit made but not explicitly saved isn't silently left behind
  (`PlaywrightRecorderDialog` reads the file from disk, not this editor's in-memory text).
- **Wrap Selected Lines as Transaction\u2026** reads the current text selection, snaps it
  to full line boundaries, and inserts both markers around it in one step - select the
  lines to group, click this, name the transaction, done. The existing Insert Transaction
  Start\u2026/End\u2026 buttons are unchanged, for inserting a single marker at the cursor
  without a pre-made selection.

## Two new scenario-template helpers: waitForNetworkIdle and captureRenderTimingAfterIdle

Requested directly: helper methods for Playwright's network-idle and page-rendering
capabilities, matching the existing `markTransactionStart`-style pattern rather than
requiring the raw Playwright API to be called directly.

- **`waitForNetworkIdle(page, timeoutMs?)`** - a thin, named wrapper around Playwright's
  own `page.waitForLoadState('networkidle')`.
- **`captureRenderTimingAfterIdle(page, label, timeoutMs?)`** - the common pairing in one
  call: waits for network idle, then calls the existing `captureRenderTiming(page,
  label)` immediately after.

**A real, pre-existing bug found while adding these:** `ScenarioTemplateSource.java` (the
Java copy of `scenario-template.js`, merged into every generated script) had silently
drifted out of sync with the actual template file - missing the `logStep` function
entirely, and missing the viewport/user-agent/console-error-capture setup added to the
`.js` file at some earlier point. Confirmed by direct, byte-for-byte comparison, not
suspected. Both constants have been regenerated directly from the current
`scenario-template.js` and verified to match it exactly; this was broken for every
script generated through this plugin until now, independent of the new helpers.

## Record a New Scenario: one guided flow instead of separate pop-ups

Requested directly: making the recording flow feel like a wizard rather than multiple
windows opening up. Tracing through it found two real, concrete bugs behind that
feeling - at both handoff points in the chain (Record Script \u2192 Record & Generate
.jmx, and that \u2192 Auto-Correlator), the previous dialog was never actually disposed
before the next one opened, so both genuinely stayed open on screen simultaneously,
often in different positions.

A small shared `WizardStep` helper now backs the whole chain:

- **`WizardStep.advanceTo(current, next)`** disposes the dialog on screen and opens the
  next one at that exact same location, used at every handoff instead of just calling
  `new SomeDialog(...).setVisible(true)`. At most one window from this flow is ever
  visible at a time, and it never jumps to a different screen position between steps.
- **A consistent breadcrumb header** (e.g. "Record a New Scenario \u203a Generate the
  .jmx") now appears at the top of every dialog in the chain, so they read as one
  continuous, named flow rather than unrelated pop-ups - wording changes depending on
  which path was taken (e.g. `PlaywrightRecorderDialog` says something different when
  reached directly from "Re-record Existing Script" vs. as a continuation from "Generate
  Playwright Script").
- The initial choice (previously a plain `JOptionPane` with three buttons) is now
  **`RecordScenarioChoiceDialog`**, a proper first screen using the same clickable-card
  style as the main launcher, for visual continuity rather than a generic system popup.

**Scoping note, for transparency:** this does not merge the three recording dialogs'
actual content into one physically embedded window - each is still a genuinely large,
independently built screen (roughly 500-625 lines each, one with its own background
process management, preference loading, and result reporting), and attempting a full
structural merge without being able to visually test Swing UI felt like a real risk of
breaking substantial, working functionality. What changed instead directly fixes the
concrete problem: the dialogs are no longer left open alongside each other, they're
visibly connected by a shared header, and the whole thing now reads and behaves like one
guided path from start to finish.

## Record New Scenario Script: an in-app editor, transaction-marker insertion, and AI enhancement

Requested directly: being able to open the recorded script in an editor and enhance it
with AI, rather than needing a separate text editor just to add the
`markTransactionStart`/`markTransactionEnd` calls the dialog's own confirm message asks
for as a "quick manual edit."

The dialog's output area is now a **Script** tab alongside the existing **Codegen
Output** log. Once a recording finishes, the Script tab loads with the actual saved
script, editable directly, and switches to it automatically so it's the first thing
seen:

- **Insert Transaction Start\u2026** / **Insert Transaction End\u2026** prompt once for a
  transaction name and insert `markTransactionStart('Name')` / `markTransactionEnd('Name')`
  at the cursor, instead of typing them by hand.
- **Save Script** writes the tab's current text back to the same file that was recorded
  to - the one "Record Scenario (Playwright)" and any later re-run both read from.
- **Enhance with AI** sends the script plus a free-text instruction (e.g. "wrap the
  login steps in a transaction called Login") to a locally configured AI CLI, and loads
  the result back into the tab for review before Save is used. **Undo AI Change**
  reverts to the script exactly as it was right before that edit, in case the result
  isn't wanted.

The AI command field and its mechanics match Insight Dashboard's existing Gemini CLI
integration exactly (same default command, same "any CLI that reads stdin and writes
stdout" design, same subprocess handling) - one local setup serves both plugins, and
nothing is sent anywhere except to the local process named in that field.

## Transaction Controllers now default to "Generate parent sample"

Requested directly. Every transaction a recording produces (via `markTransactionStart`/
`markTransactionEnd`, through `HarToJmxGenerator`'s shared, single code path used by
every recording mode) now has **Generate parent sample** checked by default, instead of
unchecked. Aggregate/Summary Report shows one row per transaction rather than one row
per individual request inside it - consistent with how Insight Dashboard already groups
its own per-transaction stats. Individual requests are still fully visible by expanding
the transaction's row in View Results Tree, so a failing request inside a transaction is
still traceable; only the rolled-up report view's default changes. It's still a
per-element checkbox in JMeter's own Transaction Controller GUI, so any one transaction
can be switched back by hand afterward.

## Fixed: generated GET requests duplicated every query-string parameter

Traced through a real, live-failing script across several screenshots - a generated
request was getting rejected with an actual **400 Bad Request** from the real server,
and the cause turned out to be in script generation itself, not anything downstream
(not an extraction bug, not a correlation bug): the outgoing request's query string had
every single parameter duplicated - `...&client_id=X&state=Y&...&client_id=X&state=Y&...`
- malformed enough that Keycloak rejected it outright.

**Root cause, confirmed directly in the generated `.jmx`:** for a GET-style recorded
request, `HarToJmxGenerator` was writing the same query-string parameters into **both**
the sampler's own Path field (as a literal `?param=value&...` string) and the separate
Arguments/Parameters table - and JMeter, when it actually builds the outgoing request,
appends the Arguments table onto whatever query string the Path already has. Two
representations of the identical data, both present, meant every parameter was sent
twice.

`ex.requestParams` (which feeds the Arguments table) is built from the HAR's own
already-parsed `queryString` entries - the exact same data as the query string already
embedded in the request's URL - so this was never two independent sources of data that
happened to collide; it was one source written into two places unconditionally. Fixed by
only keeping the query string in the Path when there's nothing parsed to also add via the
table (an empty `requestParams`, or a raw-bodied POST, where the Arguments table holds
only the body instead and the Path's own query string is the only place those params
live). Scripts already generated before this fix would need the affected samplers'
duplicated Path query strings removed by hand; new generations won't have the problem.

## A dedicated shortcut for Correlate a Script specifically

A second Tools menu entry (**SmartBlitz - Correlate a Script\u2026**) and a second
toolbar icon, alongside the existing JMeter Workbench ones - this opens
`CorrelatorDialog` directly, bypassing the Workbench launcher's card-
selection screen entirely, for anyone who wants instant access to this
one specific tool (the launcher's own "most commonly used" card) every
time rather than picking it from the launcher on each visit.

The new icon is a magnifying glass, code-drawn the same way as the
other icons in this project - distinct from the general-purpose gear
used for the Workbench launcher, and fitting given Correlate a Script's
actual job: analyzing a recording to find values that need correlating.
Both new toolbar buttons are inserted together, so they land grouped
right next to each other near JMeter's own icons.

## "Account numbers starting with 00" - number and sequence can now zero-pad

Reported directly from a screenshot: typing a start value like
`000001000000` into `sequence`'s parameters produced `1000000` in the
output, not `000001000000`. The actual cause: `sequence` stores and
outputs its value as a real number, and a number can never itself carry
leading zeros - `000001000000` and `1000000` are the same value the
moment either is parsed, no matter how many zeros were typed in front.

Fixed with an optional third parameter on both `sequence` and `number`:
a zero-pad width. `sequence(1000000,1,9)` now produces `001000000`,
`001000001`, `001000002`, ... (9 digits total, left-padded with
zeros) - and the same third parameter works on `number(MIN,MAX,WIDTH)`
for the same reason (e.g. zip-code-like values that need their own
leading zeros).

## Toolbar icon position fixed, and a gear icon for JMeter Workbench

Reported directly from a screenshot: the toolbar icon was appearing all
the way at the far right of the toolbar, after JMeter's own elapsed-
time/warning-count/thread-count status indicators, rather than near the
question-mark help icon and the rest of the toolbar's own icons. The
cause: plain `toolbar.add()` appends to the absolute end of the
toolbar's children - which, after JMeter's own icons, is a flexible
spacer that pushes those status indicators to the far right, with
anything appended after it landing even further right than that.

Fixed by finding the index right after the last button-like component
already in the toolbar (JMeter's own icons, or one of this author's
other plugins' toolbar buttons already inserted the same way) and
inserting there instead of at the end - landing grouped with the other
icons, before that spacer, rather than past it. Same fix applied to
all three plugins' toolbar buttons.

Also swapped JMeter Workbench's own icon from a toolbox silhouette to
a **gear**, as requested - built from `java.awt.geom.Area` operations
(a body disc, six rotated teeth added around its edge, a center hole
subtracted) rather than faking the center hole by filling it with a
guess at the button's actual background color, which could have looked
wrong against whatever theme this is actually rendered on.

## Test Data Generator: a table-based column editor, more GenRocket-style generator types

Requested directly: more configurability - select and add/remove
columns visually, more generator types and customization, closer to
what a dedicated tool like GenRocket offers.

**The column editor is now a table**, not hand-typed text: Name, a
Type dropdown (every supported generator), Parameters (free text,
format depends on the chosen type), and Null % (0 by default, an
independent "chance of blank" that applies regardless of type) - with
Add Column / Remove Selected buttons. Worth noting why this is actually
a different risk profile than the dynamic per-type settings UI
deliberately avoided when this tool first shipped: `JTable` with a
`DefaultCellEditor` wrapping a `JComboBox` for the Type column is a
standard, well-established Swing pattern already used elsewhere in this
project's own result tables - genuinely lower-risk than a settings
panel that reshapes its own layout depending on which type is picked,
which is what was actually being avoided before.

**Four new generator types**, pushing closer to GenRocket-style
customization:
- `weighted(value:weight,value:weight,...)` - proportional random pick,
  not uniform - `active:70,inactive:20,pending:10` comes out roughly
  70/20/10, not a third each like `list()` would
- `pattern(MASK)` - a mask-style generator (`9`=digit, `A`=uppercase,
  `a`=lowercase, `?`=alphanumeric, anything else literal, e.g.
  `AA-9999` \u2192 `QX-4821`) for formatted IDs and codes. Deliberately
  not true regex-to-string generation, which requires walking a regex
  automaton - a well-understood but genuinely non-trivial problem not
  worth the risk of getting subtly wrong when this mask syntax covers
  the same common cases far more simply
- `template(TEMPLATE)` - placeholder substitution, `{seq}` for the row
  number and `{rand:N}` for N random digits, e.g.
  `ORDER-{seq}-{rand:4}` \u2192 `ORDER-1-8273`
- `alphanumeric(LENGTH)` - a plain random alphanumeric string

**Null %** is a new, independent modifier on every column (not its own
type) - real-world data has missing values, and this generates that
directly rather than requiring a workaround.

Internally, each table row is still turned into the same
`name:type(params)|null(pct)` line format the original text-based
editor used, and handed to the same, already-tested
`TestDataGenerator.parseColumnLine()` - a clean bridge between the new
UI and the existing, validated parsing logic, rather than a second,
parallel way of building a column spec.

## The toolbar icon wasn't actually appearing

Reported directly: only the menu items were visible, no toolbar icons at
all. Two real, fixable causes, both classic Swing gotchas rather than
anything JMeter-specific:

1. `toolbar.add(button)` alone has no visible effect on a container
   that's already visible and already laid out - which the main toolbar
   is, well before this code ever runs. The button was genuinely being
   added to the component tree, but nothing ever told the toolbar to
   recompute its layout or redraw that region, so it stayed invisible.
   Fixed with an explicit `revalidate()` and `repaint()` right after
   adding it - the standard, necessary pair for dynamically modifying an
   already-shown Swing container.
2. As a second, defensive layer: the whole attempt now runs inside
   `SwingUtilities.invokeLater(...)` instead of synchronously during
   `getMenuItemsAtLocation()`, in case that method is ever called before
   JMeter's own main frame and toolbar are fully constructed - which
   would make `getMainToolbar()` return `null` and silently skip via
   the existing defensive guard. Deferring to the next event-processing
   cycle gives JMeter's own startup sequence more time to finish first.

Same two-part fix applied identically to all three plugins' toolbar
buttons (JMeter Workbench, MCP Bridge, and Insight Dashboard), since
all three used the same pattern and had the same bug.

## A new tool: Test Data Generator, in its own "Data" section

A fifth card in JMeter Workbench, alongside a new **Data** section -
deliberately separate from both Scripting (preparing the script itself)
and Execution (running the load test), since generating input data for
a script to consume is a genuinely different concern from either,
consistent with the same categorization rigor applied earlier ("page
load timing" landing under Execution, not Scripting).

**Test Data Generator** produces a CSV file of realistic test data -
names, emails, phone numbers, sequential IDs, random dates, random
picks from a list, UUIDs, and more - for use directly with JMeter's own
CSV Data Set Config, rather than hand-typing rows or sourcing
look-alike data from somewhere else first. Columns are defined with a
simple, line-based spec (`name:type` or `name:type(params)`, e.g.
`age:number(18,65)` or `status:list(active,inactive,pending)`) rather
than a dynamic per-type settings UI (add a column, pick a type from a
dropdown, a settings panel that reshapes itself depending on the
choice) - that kind of UI has a lot of Swing-layout surface area that
can't be interactively verified in this environment, while a parseable
text spec is both lower-risk to build correctly and a genuinely common
pattern for this kind of tool. A live preview shows the first 10 rows
before committing to writing the full file, and the generation engine
itself (`TestDataGenerator`) is fully self-contained - built-in name/
city/country word lists and `java.util.Random`, no external data-
generation library dependency this environment has no way to actually
resolve and compile-test.

## A toolbar shortcut, alongside the Tools menu item

Requested directly: a one-click way to open JMeter Workbench without
going through the Tools menu each time, the way JMeter's own built-in
actions (new, open, save, run) already work from the toolbar.

Checked first rather than assumed: JMeter has no official, documented
extension point for third-party toolbar buttons the way `MenuCreator`
is one for menu items - confirmed directly from a 2020 JMeter core pull
request whose own description still asks "ideally there should be an
API for plugin developers to add own buttons to the toolbar - is there
already?" The only way to do this at all is the same workaround a few
other published JMeter plugins already use (e.g. the "Validate Thread
Group(s)" plugin): reach into `GuiPackage.getInstance().getMainToolbar()`
- the actual, live toolbar instance - and append a button to it
directly. This is reading JMeter's own internal GUI object, not a
contract JMeter promises to keep stable across versions, so it's
wrapped defensively: if it ever breaks in a future JMeter release, the
Tools menu item keeps working regardless, since that's registered
through the real, guaranteed SPI.

The icon itself is drawn directly in code (a simple toolbox silhouette)
rather than loaded from an image file, for the same reason as this
plugin's branding bar: no actual image asset exists, and bundling/
loading one is something this environment has no way to actually
compile-test.

The same toolbar-shortcut approach was also added to this plugin's
sibling, MCP Bridge, since the request was for "Correlation Studio and
others."

## Launcher left itself open behind whatever tool you opened; renamed to "JMeter Workbench"

Reported directly from a screenshot: picking a card (e.g. Record a New
Scenario \u2192 Record Interactively) opened the chosen tool correctly,
but the launcher itself never closed - leaving two overlapping windows
on screen. The launcher now disposes itself the moment a card is
clicked, before the chosen tool opens, so only one window is ever
visible at a time; reopening the launcher later is just the Tools menu
again. One related fix: the "Record a New Scenario" sub-choice dialog
was parented to the launcher itself, which is now already disposed by
the time it opens - reparented to the still-valid JMeter main window
instead.

Also renamed what users actually see, from **Correlation Studio** to
**JMeter Workbench** (settled on after a few rounds of naming options) -
the old name undersold the tool once it grew to cover script recording
and comparison (both scripting concerns) alongside page-load timing
(an execution concern), not just correlation specifically. "Workbench"
also reads as exactly what the launcher actually is: a home base
opening into several related tools, not a single-purpose utility. This
is a display-name-only change: the underlying Java packages, class
names, and the `.jar` itself keep their original "correlationstudio"
naming, since renaming those is a much
larger, riskier undertaking than what was actually asked for, and isn't
visible to users anyway.

## Launcher: fixed right-side clipping, grouped into Scripting and Execution

Reported as the right side of the launcher's card grid being cut off.
The cause was the same root-cause bug class already fixed once in
Insight Dashboard's own chart panel: a plain `JPanel` placed inside a
`JScrollPane` doesn't track the viewport's actual width, so it reports
its own, uncapped preferred width instead - and the viewport just shows
the left portion of that, with the rest needing a horizontal scroll
nobody expects on a card grid. Fixed with the same small `Scrollable`
wrapper used there: the content now always matches the visible width
(no horizontal scrollbar possible) while staying free to scroll
vertically if a shorter window needs it.

Also reorganized the four cards into two labeled sections rather than
one flat 2x2 grid, which treated all four as the same kind of thing
when they aren't: **Scripting** (Correlate a Script, Record a New
Scenario, Compare Scripts or Recordings - all about preparing or
maintaining the script itself) and **Execution** (Check Page Load
Timing Under Load - a runtime/load-test concern, not a scripting one).

## Third and fourth simplification steps: plain-language labels, a real empty state

**Recording source labels** were format names (\"JTL (with response data
saved)\", \"HAR (browser recording)\") that assume the reader already
knows what a JTL or HAR file actually is. Relabeled to describe where
each one comes from instead - **\"From a JMeter test results file
(.jtl)\"** and **\"From a browser recording (.har)\"** - with a tooltip
on each explaining what it actually is and when you'd have one, plus a
short, always-visible **\"Which should I pick?\"** line right under the
radios: *already have a JMeter script you've run before \u2192 .jtl;
starting from a browser session \u2192 .har.*

**The results table was just blank** for a brand-new user who hadn't
analyzed anything yet - no different, visually, from "this found
nothing." It's now a clear, numbered 3-step guide (pick a recording,
pick your target script, click Analyze Recording) shown in that same
space until there's actually something to show, switching to the real
table the moment results exist. Correctly keys off the *analysis
results* themselves, not whatever the Filter field's search currently
matches - so filtering existing results down to zero still shows the
real (empty) table, not this getting-started guide repeating itself to
someone who's already past that stage.

This completes the four-step simplification pass described above: one
consolidated entry point, advanced features collapsed by default,
plain-language labels, and a real empty state - without touching the
underlying analyze/apply logic at all, which already worked and wasn't
part of what made this plugin hard to approach for the first time.

## Second simplification step: Advanced features collapsed by default

The Auto-Correlator's bottom section showed nine controls at once: the
core review/apply actions alongside built-in template scanning and
management, a manual value-trace tool, and an MCP server toggle for
AI-agent integration - none of which a first-time user needs for the
basic workflow of analyzing a recording and applying what it finds.

Reorganized into a core row (**Apply**, the fail-loudly option,
**Select All/None**, **Test Regex…**, **Close**) that's always
visible, with everything else - **Find Value…**, **Scan with Built-In
Templates**, **Correlation Rules…**, and the **MCP server** toggle -
tucked behind a collapsed **"\u25b6 Advanced"** section, the same
collapsible pattern already used elsewhere in this plugin. Every
button's own listener is unchanged; only the default visibility and
visual grouping changed.

## One consolidated entry point: Tools \u2192 SmartBlitz - JMeter Workbench...

First step of a simplification pass aimed at this plugin's eventual
public release. Previously, the Tools menu showed four separate
entries (Auto-Correlator, a 3-item Record Scenario submenu, Compare,
Render Timing) that a first-time user had to already understand the
distinction between before ever opening anything.

There's now just one: **SmartBlitz - JMeter Workbench...**, opening a home
screen with a card per tool, each stating what it's for and when to
reach for it in plain language rather than jargon. Every card opens the
exact same, already-working dialog the old menu item did - this change
only affects how the tools are *found*, not what any of them do.

This is deliberately the first of several planned simplification
changes, not a one-shot rewrite of the whole plugin: each existing
dialog (the Auto-Correlator especially, at nearly 1,800 lines) already
works, and a sweeping rewrite done without the ability to interactively
test a Swing UI carries real risk of landing in a broken state that
takes many rounds to untangle. Smaller, verified steps - the same
pattern that's worked well throughout this project's development - are
the more reliable path to an actually-simpler tool.

# Correlation Studio for JMeter

<img src="docs/logo.svg" alt="Correlation Studio logo" width="96" height="96" align="right"/>

A separate JMeter plugin (its own jar, registered in JMeter's **Tools**
menu — not tied to the Live Dashboard listener from the
other project), covering the full release-to-release script lifecycle:
auto-correlation, Playwright-based recording, comparing scripts/recordings
to see what changed, and capturing render timing under real load. The
**Auto-Correlator** — its original, and still core, feature — finds
values a response produces and a later request
reuses — session tokens, CSRF tokens, viewstate, IDs, etc. — and suggests
a Regular Expression Extractor + variable substitution for each, shown in
a table for you to review, edit, and approve before anything is written.

**This is heuristic, not guaranteed-correct** — real auto-correlation
never is, even in commercial tools. Review every candidate; nothing is
applied until you check its box and click Apply. A new `.jmx` is always
written (`<name>-correlated-<timestamp>.jmx`); your original file is never
modified in place.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
<!-- Add a JMeter-Plugins.org badge here once listed: https://jmeter-plugins.org/?search=jmeter-auto-correlator -->

## "Existing Extractors & Templates" now visible directly on the Auto-Correlator

Reported: opening the Auto-Correlator for an already-open project gave
no visibility at all into what's already correlated in it. Checking the
actual code found the feature already existed in full - its own scan
logic, a table showing which sampler produces each extractor and which
one(s) consume it, save-as-template buttons - but had been consolidated
into a separate **Correlation Rules…** dialog at some point, behind a
generically-named button, landing on a different default tab first, and
still requiring a manual "Scan Existing Extractors" click even after
getting there. In effect, a fully-built feature nobody could easily
reach.

Fixed by moving **Existing Extractors & Templates** back onto the main
Auto-Correlator dialog as its own, directly visible tab - alongside
Analyze Recording, not hidden behind another dialog - and having it
**auto-scan on open** whenever a target `.jmx` is already known (i.e. a
project is already open), so what's already correlated is ready the
moment you switch to that tab, with no manual scan click needed first.
The **Correlation Rules…** dialog still exists for managing built-in
templates; it no longer also embeds this tab, since a single `JPanel`
instance can't live in two containers at once in Swing, and the tab now
has its own clear home.

## Requirements

- Apache JMeter 5.6.3 (built/tested against this version; other 5.6.x
  versions are likely compatible but untested)
- Java 11+
- Node.js and Playwright (`npm install -D playwright && npx playwright
  install chromium`) — only needed for the recording/scenario features;
  the correlation and compare tools work without them

## Installation

**Via JMeter Plugins Manager** (once this plugin is listed there): Options
→ Plugins Manager → Available Plugins → search "Correlation Studio" → check
it → Apply Changes and Restart JMeter.

**Manual install:** download `jmeter-correlationstudio.jar` from this
project's [Releases](../../releases) page (or build it yourself — see
**Build**, below) and drop it into
`<your-jmeter-install>/lib/ext/`, then restart JMeter. A new **Tools**
menu entry appears: **SmartBlitz - JMeter Workbench...** - one entry opening a home
screen with a card for each tool (Correlate a Script, Record a New Scenario,
Compare Scripts or Recordings, Check Page Load Timing Under Load), rather than
four separate menu items to tell apart up front.

**File dialogs default to your test plan's folder:** every Browse button
across these dialogs opens in the current test plan's own directory —
the closest thing JMeter has to a "project folder" — rather than
wherever JMeter's own working directory happens to be. Falls back to the
platform's own default location if no test plan is open/saved yet.

## Built-in correlation templates for common frameworks/platforms

Available globally, with no project-specific setup needed first: **Scan
with Built-In Templates**, in the main dialog, checks the current
recording against factory-shipped rules for well-known frameworks and
platforms, rather than needing every common token rediscovered and
saved from scratch on every new project.

Covered today: ASP.NET WebForms (`__VIEWSTATE`,
`__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`), JavaServer Faces
(`javax.faces.ViewState` / `jakarta.faces.ViewState`), Django
(`csrfmiddlewaretoken`), Ruby on Rails (`authenticity_token`), Spring
Security (`_csrf`), Laravel (`_token`), a generic CSRF `<meta>` tag
pattern, Drupal (`form_build_id`, `form_token`), WordPress (`_wpnonce`),
Atlassian/Jira/Confluence (`atl_token`), SAP (`X-CSRF-Token` — a
response **header**, not a body value, confirmed directly rather than
assumed), Keycloak (`session_code`/`execution`/`tab_id`, pulled from the
login form's own action URL), ServiceNow (`sysparm_ck`), and SharePoint
(`__REQUESTDIGEST`).

**How it works:** since a built-in template has no way of knowing what
you named your own login/whatever sampler ahead of time, it checks its
pattern against every recorded exchange's response rather than one named
sampler the way a project-specific saved template does. A match becomes
a new row in the same candidate table Analyze Recording already
populates — reviewed, approved, and applied exactly the same way,
including the fail-loudly checkbox above. "Consuming Sampler(s)" isn't
auto-detected for these yet, unlike project-specific candidates — that
column is already editable, so fill it in by hand once you've reviewed
where the value actually gets reused.

**Deliberately a smaller, higher-confidence set rather than every
framework a commercial correlation-rules library might list** — each
entry above was checked against an authoritative or independently-
corroborated source before being included (not assumed from memory
alone), and every regex was validated against realistic sample content
for that framework before shipping. Shipping a wrong "built-in" pattern
as if it were verified would be worse than not shipping one at all.

## MCP server \u2014 let an AI agent drive Correlation Studio directly

**Start MCP Server**, at the bottom of Analyze Recording, opens a local MCP
(Model Context Protocol) server an agent like Claude Code, Codex, or
opencode can connect to and call directly, rather than you relaying
results back and forth by hand. Four tools are exposed, each wrapping an
already-built, already-tested piece of this plugin rather than anything
new: `list_candidates`, `scan_built_in_templates`, `apply_candidates`,
and `list_samplers`.

**What this deliberately doesn't do:** drive JMeter's actual test engine
to rerun a request and read a real response back \u2014 that's a
meaningfully bigger, riskier piece (actually executing samplers
programmatically and capturing results) that's out of scope for this
first version. These tools read and edit the test plan; they don't run
it.

**Transport:** Streamable HTTP, not stdio. Stdio assumes the connecting
tool launches the server itself as a fresh subprocess; that doesn't fit
here, since this "server" is the already-running JMeter GUI holding live
test-plan state, not something an agent spawns on demand. Point your MCP
client at `http://127.0.0.1:<port>/mcp` (the port is shown once started;
7331 by default, falling back to an OS-assigned port if that's taken).

**Security:** binds to 127.0.0.1 only \u2014 never reachable over the
network \u2014 with no authentication beyond that in this first version. Any
local process on the same machine could call it while it's running.
Stop it when you're done with a session rather than leaving it running,
the same as you would any local debug port.

**A limitation worth being direct about:** the message shapes here
(`initialize`, `tools/list`, `tools/call`, JSON-RPC error codes) were
checked carefully against the current MCP specification and several
independent server implementations before writing any of this. What
couldn't be verified the same way is an actual, live round-trip against
a real MCP client — that needs an actual agent actually connecting,
which isn't something to simulate convincingly. If something in the
handshake doesn't work on the first try with your particular client,
that's the most likely place to look.

## Generic JMeter tools moved to their own plugin

A generic, non-candidate-workflow tool set \u2014 `get_tree`,
`get_element_properties`, `add_element`, `modify_element`, `clone_element`,
`move_element`, `delete_element`, and a heuristic `analyze_dynamic_candidates`
scan \u2014 started out on this MCP server too, operating on JMeter's actual
live test-plan tree rather than the candidate workflow above. It's since
moved to its own, separate plugin,
[**MCP Bridge for JMeter**](https://github.com/ajinsudhir/jmeter-mcpbridge),
so it's usable on its own \u2014 independent of whether you use Correlation
Studio at all \u2014 based on whatever your own use case actually needs.
Install that plugin alongside this one for both tool sets together (each
runs its own MCP server, on different default ports so they don't
conflict), or on its own for just the generic set.

## Correlation Rules — built-in templates and saved/existing templates, in one place

**Correlation Rules…**, next to Scan with Built-In Templates, opens a
single dialog with two tabs, consolidating what used to be split across
this dialog's own second tab and a separate button:

- **Built-In Templates** — a two-panel layout: a grouped, collapsible
  list on the left (one row per framework, expandable to its individual
  tokens), a **Correlation rule settings** panel on the right showing
  whatever's currently selected (group name, rule count, how many are
  enabled). Click a group's checkbox to enable/disable every token in
  it at once; click an individual token's checkbox for finer control.
- **Existing Extractors & Templates** — the same panel that used to be
  this dialog's own second tab, moved here rather than duplicated: scan
  a target `.jmx` for extractors already present, save any as a
  reusable template, and manage the saved-templates library (scan with
  templates, apply checked, export/import). It's the exact same panel
  instance every time this dialog opens, so an in-progress scan's
  results survive closing and reopening it.

**Save state** (Built-In Templates tab) persists which groups are
enabled/disabled to disk, fixing a previously-documented gap — this
used to reset to everything-enabled every JMeter restart, since nothing
ever wrote the choice anywhere. **Process rules** runs the same scan as
the main dialog's own "Scan with Built-In Templates" button and closes
this dialog, for anyone who'd rather enable/disable and scan in one
motion.

**One honest thing the Built-In Templates tab does *not* do, on
purpose:** it has no Import/Export-custom-rule or Edit/Delete-custom-
rule buttons, because Correlation Studio has no custom-rule-authoring
concept the way some other correlation tools do — every rule listed
there is built-in and code-defined. **Export Group…** is the closest
honest equivalent: it exports a group's templates through the exact
same JSON format the Existing Extractors & Templates tab's own
Import/Export already use, so the result opens there as real,
already-editable project templates — bridging into a system that
genuinely exists, rather than a parallel one invented just to look
complete.

## Fail loudly on silent extraction failure

A regex extractor that finds nothing doesn't fail the sampler it's attached
to by default — it just sets the variable to its default value and moves
on, surfacing as a confusing failure several requests downstream instead
of right where the real problem is. Already-generated extractors set that
default to a distinctive `NOT_FOUND_<variableName>` sentinel; checking
**"Add fail-loudly assertions"** next to Apply Selected now also generates
a companion JSR223 Assertion (Groovy) right after each applied extractor,
checking the variable against that exact sentinel and failing the sampler
immediately if it's still there. The choice carries over automatically
when saving a candidate as a template, so **Apply Checked to Current
.jmx** respects it on the next release too, without needing to re-check
anything.

## Compare Scripts/Recordings — what changed in the app this release

**Tools → SmartBlitz - JMeter Workbench... → Compare Scripts or Recordings**, for the recurring question
every new release raises: *did the app actually change, and where?*
Compares two sources — any mix of `.jmx`, `.har`, or `.jtl` — and reports
**new requests**, **removed requests**, and **changed requests** (domain,
parameters, headers, body) between them. The common use: compare last
release's script (Source A) against this release's fresh HAR recording
(Source B) to see exactly what the app changed, before spending time
re-correlating anything.

Both sources are read through the same `RecordedExchange` representation
already used throughout this tool, regardless of which file type supplied
them — a `.jmx` is parsed by a new `JmxParser` (reading each
`HTTPSamplerProxy`'s domain/path/method/params/headers/body, resolving
`${server}`-style variable references against the Test Plan's own User
Defined Variables first — otherwise a script this tool generated itself
would show every single request as "domain changed" against a fresh HAR's
literal hostname, for no real reason). A `.har`/`.jtl` uses the existing
`HarParser`/`JtlParser`, same as everywhere else in this plugin.

**How requests are matched across the two sides:** by HTTP method + URL
path, in two passes. The first pass requires an exact match. The second
pass handles a common case the first one misses: comparing an
uncorrelated recording against an already-correlated script, where the
same logical request has a literal value on one side and a
`${variableName}` reference on the other (e.g. `/app123/...` vs
`/app${v_3}/...`) — since `${...}` is JMeter's own explicit,
unambiguous marker for "this part is a variable," any such reference on
either side is treated as a wildcard (matching anything within that one
path segment, never crossing a `/` boundary) rather than being compared
literally. Without this, the same request would otherwise show up as
both "added" and "removed" instead of "changed."

This still doesn't solve the more general case: if the same logical
endpoint embeds a changing literal ID directly in its path on *both*
sides (e.g. `/api/user/123/profile` vs `/api/user/456/profile`, neither
one a `${...}` reference), these won't match — they'll show as one
removed and one added instead of one changed. Smarter path normalization
(recognizing numeric/UUID segments as placeholders even without the
`${...}` marker) could address this, but risks false-positive matches if
built carelessly, so it's deliberately not attempted for that broader
case.

**Wildcard matching also applies one level down, to parameter and body
field names.** Correlation sometimes replaces only part of a name — e.g.
`latestVersion` becomes `latest${PLGN_CLUP_STATS_VERSION}` — and the same
reasoning as request-path matching applies: these are the same logical
field, renamed by correlation, not a coincidentally-unrelated removal and
addition. Shown as one `CHANGED` row (`latestVersion → latest${...}`)
instead of two separate ones. Every `${variableName}` reference shown
anywhere in the Compare dialog — URLs, parameter/header names, values,
body fields — is also highlighted in yellow, so it's visually obvious at
a glance which parts of something are correlation variables versus
literal text.

**Fixed: path/domain extraction no longer uses `java.net.URI`.** Its
constructor throws `URISyntaxException` on unencoded `{`/`}` characters —
which every `${variableName}` reference contains — and that exception
used to silently fall back to treating the *entire URL* (scheme, domain,
and all) as the "path," while the other side correctly got just its
path. Two completely different shapes that could never wildcard-match
each other, which meant the matching described above never actually
worked for a correlated request in practice. Path and domain extraction
now use plain string operations instead, which can't throw regardless of
what characters the URL contains.

**What counts as "changed," for a matched pair:**
- **Domain** — flagged directly (an environment or infrastructure change).
- **Parameters** — added/removed names reported as potentially
  significant; value-only changes (same param, different value) reported
  separately and labeled as "may be expected test-data variance," since
  those commonly differ for legitimate reasons release to release.
- **Headers** — added/removed names only, with a fixed list of volatile
  ones excluded from comparison entirely (`Cookie`, `Host`,
  `Content-Length`, `Connection`, `Date`, `User-Agent`,
  `X-Request-Id`/`X-Correlation-Id`, `If-None-Match`/`If-Modified-Since`)
  — these change on every single request by design and would otherwise
  drown out every real difference.
- **Body** — tries a structural field-by-field diff first: JSON (via the
  same flattening `MiniJson` already uses elsewhere in this plugin), then
  form-encoded `key=value&key2=value2` data if it isn't JSON — both just
  as diffable field-by-field as each other. Falls back to showing both
  raw bodies side by side only if neither parses on at least one side.

**Transactions tab — compares Transaction Controllers, not just individual
requests.** Groups requests by their enclosing Transaction Controller (via
`JmxParser`, which walks up from each sampler to find it) and reports
transactions present only on one side, plus — for transactions in both —
whether its request count changed and exactly which requests were added
or removed within it, reusing the same matching logic as the main
comparison, just scoped to each transaction. Only meaningful when at
least one source is a `.jmx` using Transaction Controllers; a raw
HAR/JTL has no grouping structure of its own, so it always shows zero
transactions on that side — stated plainly in the tab itself rather than
left to guess at silently.

**Shown as a real color-coded diff, not a bullet list of sentences.**
Selecting a changed request shows a table — one row per difference
(domain, parameter, header, or body field) with Before/After columns:
removed values in red with strikethrough, added values in green, and a
changed row (both old and new shown side by side) gets its own highlight
— the same visual language as a code diff in an IDE, rather than reading
through a paragraph describing what changed. The Added and Removed tabs'
detail panes are tinted the same green/red for consistency. If a body
differs but isn't valid JSON on either side, there's nothing structural
to diff — it falls back to showing both raw bodies side by side instead.

Validated end-to-end against a realistic release-comparison scenario
(domain change, added/removed endpoints, header/parameter/body field
differences, with volatile headers correctly excluded) before shipping.

## How it's registered

Unlike the Live Dashboard listener (a `Listener` GUI component), this
plugs into JMeter's own **Tools menu** via the `MenuCreator` SPI — the
same mechanism JMeter's built-in Tools entries (cURL Import, HTML Report)
use. Registered by a plain text file at
`META-INF/services/org.apache.jmeter.gui.plugin.MenuCreator` listing the
implementing class — functionally identical to what the `@AutoService`
annotation on JMeter's own classes auto-generates, just written by hand
instead of adding an annotation-processor dependency.

## Build

```bash
mvn clean package
```

Produces `target/jmeter-correlationstudio.jar`.

## Install

Copy the jar into `<JMETER_HOME>/lib/ext/`, then fully restart JMeter (not
just close a window — `lib/ext` is only scanned at startup). Look for
**Tools \u2192 SmartBlitz - JMeter Workbench... \u2192 Correlate a Script**

**Before applying: Scan with Templates (Suggestions).** Check one or more
saved templates and click **Scan with Templates (Suggestions)...** for a
dry-run report, without changing anything — the NeoLoad idea of running
your existing correlation rules against a script and seeing where they'd
land before committing. For each checked template it reports:
- Whether its producing sampler exists in the current `.jmx` by exact
  name; if not, the closest-named sampler(s) here (Levenshtein distance),
  so a rename or typo doesn't just silently fail.
- **How many times the regex actually matches**, if this session has real
  captured response data for that sampler (from having analyzed a
  JTL/HAR, or run the script here, in this dialog session) — a genuine
  count, not a guess. If no such data is available yet, it says so
  plainly rather than fabricating a number.
- Which of the template's previously-known consuming sampler(s) exist
  here by name, and which don't.

**Apply Checked to Current .jmx** remains the separate, deliberate step
that actually edits the script — scanning never modifies anything.

**Export/Import** — check templates and click **Export Checked...** to
write them to a `.json` file you pick, for sharing a correlation library
with teammates or across machines rather than everyone rediscovering the
same pattern independently. **Import...** reads that same file (or any
hand-written file in the same JSON shape) and merges it into your saved
templates. A name collision with an existing template is never silently
overwritten — the incoming one is renamed with a " (2)", " (3)", etc.
suffix instead, so nothing gets lost either way.

## Re-record Existing Script — automated re-scripting each release

For the recurring-release problem: same scenarios, new release every few
months, re-scripting and re-correlating from scratch each time.
**Tools → SmartBlitz - JMeter Workbench... → Record a New Scenario → Re-record Existing Script...** closes the loop:
run a fully-scripted, unattended Playwright scenario \u2192 it captures a
HAR recording of everything the browser actually does \u2192 a brand-new
`.jmx` is generated from that HAR \u2192 hand straight off into the
existing Auto-Correlator to scan/apply your saved templates against it.

**Remembers your values, per script.** App base URL, username, domain
allowlist, sampler-names CSV path, and HAR/`.jmx` output paths are
all saved keyed by the exact script path the moment you click **Record &
Generate Script**, and auto-filled next time you point this dialog at
that same script — whether by Browse or via hand-off from **Generate
Playwright Script**. Different scripts remember their own
values independently, since they commonly target different
environments. The **password is never remembered** — that field
always starts blank and has to be typed each run, even as a "test"
value. (If you'd already used this before the Rename Samplers field was
renamed from "Transaction names," that one remembered value resets once
— everything else carries over.)

### Why Playwright

Playwright's `browser.newContext({ recordHar: { path, content: 'embed' } })`
captures every request and response — response bodies included, which
correlation needs — with zero custom network instrumentation. This is
the one genuinely new piece added: `HarParser` already reads a HAR to find
correlation candidates against an *existing* `.jmx`; `HarToJmxGenerator` is
new, and turns a HAR into a *fresh* one in the first place.

### Prerequisites (once, not per scenario)

```
npm install -D playwright
npx playwright install chromium
```

Node.js and Playwright need to be installed on whichever machine runs the
recording — Playwright itself is JavaScript and can't run inside the
JMeter/Java process, so this plugin shells out to `node` as a child
process (the same subprocess-invocation pattern already used for the
Gemini CLI integration in the Custom Live Dashboard plugin).

### Writing a scenario script

Copy `playwright-scenarios/scenario-template.js` once per scenario (e.g.
`checkout.js`, `login.js`) and fill in the UI steps. Don't write the
selectors from scratch — run:

```
npx playwright codegen <your app's URL>
```

and click through the scenario once; Playwright generates the
`page.click()`/`page.fill()` lines for you to paste into the template's
"Perform the scenario" section.

The template reads `HAR_OUTPUT_PATH`, `APP_BASE_URL`, `LOGIN_USERNAME`,
and `LOGIN_PASSWORD` from environment variables — the plugin sets
these for exactly this one child process. **Never hardcode credentials in
the script, and never accept them as command-line arguments** (a CLI
argument list can appear in the OS's own process listing; an environment
variable scoped to one child process does not). The dialog's password
field is never written to disk, logged, or displayed again once entered.

The HAR is only flushed to disk on `context.close()` — the template
does this in a `finally` block, so a scenario that fails partway through
still saves whatever it captured up to that point, rather than losing it
entirely.

### What the generated `.jmx` looks like

One `HTTPSamplerProxy` per captured request, in recorded order, inside a
single Thread Group (1 user, 1 loop — a starting point to layer real
load onto, not a load profile itself). A shared Cookie Manager sits at
the thread-group level so cookies flow naturally from real server
responses; session cookies from request headers are deliberately **not**
copied in verbatim — hardcoding them from one capture would break the
moment a session expires, which is exactly what the correlation step
right after this exists to handle properly instead. Hop-by-hop /
auto-managed request headers (`Host`, `Content-Length`, `Connection`) are
excluded because JMeter sets these itself.

**The server name is parameterized, not hardcoded per sampler.** Whichever
domain appears most often across the requests that survive filtering
gets added as a single User Defined Variable (`server`) at the Test Plan
level, and every sampler on that domain references `${server}` instead
of the literal hostname — switching environments (staging → prod, this
quarter's temp URL → next quarter's) means editing one value, not every
sampler. A less common domain (a separate SSO/OAuth host, a CDN, etc.) is
left as a literal on whichever samplers actually hit it, since promoting
every distinct domain to its own variable would be more parameterization
than typically useful.

**Filtering, on by default:** a raw browser HAR is mostly images, fonts,
CSS/JS bundles, and analytics beacons — not requests you want in a
load test. Anything matching a static-asset extension
(`.png`/`.css`/`.js`/`.woff`/etc.) is always excluded. An optional
**domain allowlist** (comma-separated, e.g. `myapp.com,api.myapp.com`)
additionally restricts generation to just those domains — leave it
blank to keep every non-static-asset request regardless of domain.

**Optional Response Code Assertions.** Every recording dialog has an
**"Add Response Code Assertions"** checkbox (off by default). When
checked, each generated sampler with a known recorded response code gets
a real JMeter Response Assertion checking the replay's code equals that
same value — the standard, low-risk "did this behave the same way as
recorded" check. This works regardless of whether the originally
recorded code was itself a success or an expected error (e.g. a
legitimate "check if X exists" call that got a 404 on purpose) — the
point is catching a *different* result on replay, not judging whether
the original recording "should" have succeeded. Left unchecked, a script
has no explicit pass/fail signal beyond JMeter's own non-2xx-is-an-error
convention, same as before this existed.

**Text assertions, bracketed like transaction markers.** Same idea as
`markTransactionStart`/`markTransactionEnd`, but instead of grouping
requests under a Transaction Controller, `assertTextStart('expected
text')` / `assertTextEnd('expected text')` adds a real JMeter Response
Assertion (checking the response body *contains* that text) to every
request whose timestamp falls inside the window. Independent of
transaction grouping — a request can get both a Transaction Controller
and a text assertion, either one, or neither, depending on which
bracket(s) it happens to fall inside.

This works the same way in both recording paths:

- **Scripted scenarios** — call `assertTextStart(...)`/`assertTextEnd(...)`
  directly in `scenario-template.js`, exactly like the transaction
  markers. See the template's own comments and example for the exact
  convention.
- **Record Interactively** — an **"Expected text"** field plus matching
  **Start Text Assertion** / **End Text Assertion** buttons, right below
  the existing Transaction controls. Same workflow: type the expected
  text, click Start, perform the step, click End. If left open when you
  click **Stop Recording & Generate Script**, it's closed automatically
  using the stop time as its end, same as an unclosed transaction.

Both paths use the same underlying mechanism as transaction markers — a
timestamped `EVENT:ASSERT_TEXT_START:`/`EVENT:ASSERT_TEXT_END:` line,
parsed back out after the run (live, line-by-line, for the interactive
recorder; from the complete captured output, for a scripted run).

### Browser rendering timings — a one-time reference baseline, not a load-test metric

**This is fundamentally different from everything else this tool
measures, and worth understanding clearly before using it.** JMeter's
load test replays raw HTTP requests — there is no browser involved at
all during replay, so JMeter cannot measure (and this tool cannot make
it measure) rendering: parsing HTML, running JS, painting pixels.
Everything else in this README is about what the *server* does under
load. This feature is different: it captures what the *browser* actually
rendered, but only during the one-time recording session, from the one
real Chromium instance driving it — never during the load test itself,
and it never scales with virtual users.

Treat it as a reference point ("here's how fast this page actually
painted for one real user, independent of what the load test shows"),
not as a load-test result.

**Scripted scenarios** — call `await captureRenderTiming(page, 'Some
Label')` after a navigation has settled (after `waitForLoadState`, not
immediately after `goto()`, or the numbers will be incomplete). See
`scenario-template.js`'s example usage.

**Record Interactively** — a **Label** field and **Capture Render
Timing** button, right below the text-assertion controls. Click it
whenever the current page is a release-worth-checking one.

Both read the real browser's own Performance API: DOMContentLoaded, Load,
First Paint, First Contentful Paint, and Largest Contentful Paint. Shown
as a readable table in the dialog's log/output area after generation
completes — informational only, never written into the generated `.jmx`.

**A real limitation worth understanding, not a bug: single-page apps can
show identical values across multiple captures.** If your app uses
client-side/hash routing (a `#/some-view` URL is the giveaway), a "page
transition" — like submitting a login form and seeing a dashboard appear
— is often just an AJAX call plus a DOM update, with no actual
browser-level navigation involved at all. The browser's own Navigation
Timing API has nothing to report for that, because nothing it tracks
actually happened; `captureRenderTiming` ends up reading the *same*
original page-load entry both times, down to the exact decimal. This
isn't fixable from outside the app — there's no browser-native way to
time a transition that was never a real navigation. **Now detected and
flagged**: a repeat capture of the same underlying navigation prints a
clear `WARNING:` line in the output explaining this, rather than quietly
showing identical numbers that look like a bug.

**Fixed: a race condition that could silently drop every network timing
line when a scenario errors out.** `attachNetworkTimingCapture`'s
`requestfinished` handler was marked `async` even though
`request.timing()` itself is synchronous — unnecessary, and actively
harmful: an `async` handler runs as a deferred microtask, and if the
scenario throws and calls `process.exit()` before that microtask gets a
turn, the log line is lost entirely, with no error or indication anything
went wrong. Reproduced directly (an async handler's output never printed
before a synchronous `process.exit()`, while a plain synchronous
handler's did, every time) before fixing it by making the handler
synchronous, which runs immediately in the same tick as the event itself
— eliminating the gap a later exit could race ahead of.

**Every request's network-level timing is also captured automatically —
no call needed, unlike `captureRenderTiming`.** DNS Lookup, Initial
Connection, SSL, Waiting (TTFB), Content Download, for every HTTP request
the scenario makes, the same phases Chrome DevTools' Network tab shows.
Shown as a sortable table grouped by transaction in **Capture Render
Timing Under Load** below. These two recording dialogs capture the same
`EVENT:NETWORK_TIMING:` data into their raw output, but don't yet parse
it into a table of their own the way that one does.

### Capturing render timing while a real load test is running

**Tools → SmartBlitz - JMeter Workbench... → Check Page Load Timing Under Load**, for "what does the UI
actually experience while the server is under realistic load" — a
genuinely different question from either the load test's own
server-side numbers, or the one-time baseline above (captured with no
load at all).

**What this deliberately does NOT do:** run several concurrent
Playwright browsers to simulate multiple users. Each headless Chromium
instance is heavy — real CPU and memory, unlike JMeter's lightweight
threads — so N of them on one machine compete with *each other* for
resources. The render times that produces would partly reflect machine
contention between browser processes, not independent user experience,
and it's easy to misread one as the other.

**What it does instead:** starts your currently-open test plan's load
test via JMeter's own Start action — the exact same engine, same thread
groups, same everything, as if you'd clicked the toolbar Start button
yourself — waits a configurable delay for that load to actually ramp up,
then runs your scenario script **once**, through a single real browser,
while that load is still hitting the server. One real browser, measuring
against a server under genuinely realistic concurrent load, with no
browser-vs-browser resource contention confounding the result.

Results are shown in three tabs, not a wall of plain text:

- **Render Timings** — a sortable table, one row per `captureRenderTiming(...)`
  call: DOMContentLoaded, Load, First Paint, First Contentful Paint,
  Largest Contentful Paint.
- **Network Timings (per request)** — every HTTP request the scenario
  made, captured **automatically** (no call needed in the script) via
  `attachNetworkTimingCapture`: Stalled, DNS Lookup, Initial Connection,
  SSL, Waiting (TTFB), Content Download — the same phases Chrome
  DevTools' Network tab shows, computed from Playwright's own
  `request.timing()` data. Two DevTools phases aren't shown because
  Playwright's timing API doesn't expose what's needed to compute them at
  all: proxy negotiation, and "Request sent" as its own precise duration.
  Everything shown is computed from real values — nothing here is
  estimated or approximated.

  **Grouped by transaction, collapsible** — same pattern as Custom Live
  Dashboard's per-transaction rollup, not a flat list repeating the same
  transaction name on every row. If the script uses
  `markTransactionStart`/`End`, requests are matched to a transaction by
  timestamp (same mechanism `HarToJmxGenerator` already uses for `.jmx`
  grouping, just applied here for display) and shown under a header row
  — `\u25bc 02_Login (3 requests)` — giving the average of each phase
  across that transaction's requests; click the header to collapse it
  down to just that summary, or expand it back out to see each
  individual request underneath. Requests outside any marked window land
  in a `(no transaction)` group. Deliberately not sortable — sorting
  would scramble group headers and their children together, breaking the
  hierarchy a flat sort can't represent.
- **Scenario Output (raw)** — the script's actual console output, for
  troubleshooting when something fails.

The delay before capture matters: it needs to be at least as long as
your test plan's own thread ramp-up time, or the browser might run before
the load has actually built up. A **Stop Load Test** button is provided
since the load test's own duration is governed by your test plan's
configuration, not by this dialog — it may still be running after the
capture completes, by design.

### After generation

The dialog offers to open the Auto-Correlator immediately, pre-filled
with the new `.jmx`, so **Scan with Templates** and **Apply Checked
Templates** can run against it right away using whatever correlation
rules were saved from previous releases — the whole point of this
feature.

### A match was "found," but extracted nothing — a value at the end of its line

Reported and reproduced via Test Regex: `redirect_uri`'s auto-generated
regex was `&redirect_uri=(.*?)` — reported "1 match(es) found," but the
actual captured text was blank.

The cause: `buildRegex()` generates a regex by capturing the literal
text immediately before and after a value, so the lazy `(.*?)` has
something concrete to stop at. `redirect_uri` is the *last* query
parameter in that `Location` header line, so there's nothing after it
on that line at all — the trailing-context computation came back
empty, leaving a bare `(.*?)` with no boundary to anchor against
whatsoever. A lazy quantifier with nothing forcing it to expand matches
zero characters and reports success while extracting nothing — exactly
the blank match shown.

A trailing `$` anchor isn't a safe fix here: JMeter's `RegexExtractor`
runs without `MULTILINE` by default, so `$` only matches the very end
of the *entire* input, not the end of one line among several — it would
have made this regex match nothing at all rather than fixing it. Fixed
with a greedy, line-bounded capture group (`[^\r\n]*`) instead whenever
there's no trailing context to anchor against, which correctly grabs
the rest of the line with no anchor needed at all.

Existing candidates already generated before this fix still carry the
old, broken regex — re-run Analyze to get a freshly-built one.

### Tooltips stretching across the whole screen

Reported: the "Scenario name prefix" field's tooltip rendered as one
unbounded line stretching across the entire display, overlapping
whatever else was open. Plain-text tooltips have no width constraint
at all in Swing — a long one just keeps going. Audited every tooltip
across the plugin and wrapped each long, plain-text one in a
fixed-width `<html><body style='width: ...px'>` block (320-420px
depending on the tooltip's own length) so it wraps naturally instead.
A handful of tooltips already used `<html>` with explicit `<br>` line
breaks by design; those were left as they were, since they don't
exhibit this problem.

### A value correctly detected, but still not replaced: URL-encoding mismatch

Reported and reproduced: `state`'s candidate (correctly found, correct
regex, correct producing/consuming samplers) still left the literal
value sitting untouched in the generated `.jmx`.

The cause, confirmed by reading `HarToJmxGenerator` directly: a
candidate's value is captured from raw response text (a `Location`
header, an HTML page) exactly as it's sent over the wire — which is
often still URL-encoded, e.g. a trailing `=` appears as `%3D`. But a
sampler's own `Argument.value` in the generated `.jmx` is always built
from the HAR's own already-decoded `queryString` entries — so the
literal value actually sitting in that query parameter is the decoded
form. Searching for the still-encoded captured value inside decoded
XML text can never succeed, silently, regardless of how correct the
rest of the candidate was.

Fixed in both directions, in the two places this actually matters:
`JmxRewriter`'s replacement step now falls back to the URL-decoded form
of a value when the raw form doesn't match a given text node, and
`RecordedExchange.requestContains()` (the "is this value genuinely
reused later" check that decides whether a candidate gets reported at
all) does the same, so an encoding mismatch doesn't silently suppress
a real candidate before it's ever shown. A value with no `%XX`
sequences at all is returned unchanged, so this costs nothing extra
for the common, never-encoded case.

### state and redirect_uri: detected from the wrong occurrence, and truncated

Reported: in the authorization request
`/auth/realms/C360/protocol/openid-connect/auth?response_type=code&client_id=...
&state=...&redirect_uri=...`, `client_id` was correctly replaced, but `state`
was left completely literal, and `redirect_uri` was only partially replaced
(`${redirect_uri}://perf3.c360ip.us.cgi.com/...` — just the scheme word
swapped out, the rest of the URL left untouched). Two different bugs,
both in logic added earlier this session:

1. **`state` was being detected from the wrong, later occurrence.** The
   previous OAuth detector only recognized the callback shape
   (`code`+`state`+`session_state` together). But `state` is actually
   first produced *earlier* — in the Location header of the redirect
   that kicks off the whole flow, which has `response_type`+`client_id`
   +`state`+`redirect_uri`, with no `code=` key at all (only
   `response_type=code`, a different key entirely). Since replacement
   only checks exchanges *after* wherever a value was first produced,
   treating the later callback as `state`'s producer made every
   *earlier* occurrence — including this exact authorization request —
   structurally unreachable, no matter how correct the extracted value
   was. Broadened the detector to recognize `state` co-occurring with
   *any* of `code`/`client_id`/`response_type`/`redirect_uri`, so it
   now fires on both real shapes and finds `state` at its true,
   earliest appearance.
2. **`redirect_uri` was being extracted twice, inconsistently.** It was
   in the generic known-name dictionary, but that scanner's value
   pattern excludes `:` and `/` — so a URL value gets truncated to just
   its scheme (`https`), which is exactly the broken artifact reported.
   Removed `redirect_uri` from the generic dictionary entirely; it's
   now handled exclusively by the OAuth detector above, which already
   uses a value pattern that doesn't exclude URL characters.

### Remaining Keycloak login-form params, and a value-truncation bug for base64-padded values

Reported: `execution`, `tab_id`, and `client_data` — all carried in the
same `<form action="...">` URL as `session_code`/`client_id` (added in
an earlier fix) on the Keycloak login form — were still not detected.
Simply missing from the known-name dictionary; added alongside the
other Keycloak-specific names already there.

Separately, while checking `client_data`'s value (a base64-encoded
blob) a real, more general bug turned up: the generic name=value
scanner's value pattern excluded `=`, which silently truncates any
base64-padded value right before its padding — not hypothetical, since
an earlier-reported `state` value also ended in `=`. A truncated
extracted value produces a correspondingly broken `${variable}`
substitution wherever it's reused. Fixed by allowing `=` in the value
character class, matching what the OAuth2-callback detector's own
pattern already allowed correctly.

### Apply Selected silently applied nothing at all on a prefix-named recording

Reported and reproduced: "Apply Selected" reported `Extractors added: 0`,
`Values replaced: 0`, with every single candidate listed as "producing
sampler ... not found in this .jmx — skipped" — even though Analyze had
just found all of them correctly moments earlier.

This is the same root-cause bug class as the "testing a template
silently failed" one fixed earlier in this session, but here it showed
up in the far more serious place: the actual Apply path, not just the
"Scan with Templates" test. `JmxRewriter` matched a candidate's
producing (and consuming) sampler against the target `.jmx` by *exact*
`testname` string equality — correct only when a sampler's name is
literally `CorrelationEngine`'s own raw `"METHOD path #N"` label, the
default with no naming customization. The **Scenario name prefix**
feature (and a CSV sampler rename) renames samplers to something like
`"{prefix}_T{NN}_{marker} {NNN} {path}"`, which no longer equals that
raw label at all — so on any recording using that naming, Apply found
*nothing* to attach extractors to or replace values in, silently,
every time, regardless of whether Analyze's own candidates were
correct.

Fixed with the same path-based fallback used for the template-scan fix:
exact match is tried first and still wins for the default, unprefixed
case; when it fails, the last `/`-leading, whitespace-delimited token in
the search label is pulled out (present at the end of both the raw HAR
label and the prefix-scheme name, whatever comes before it) and matched
against the `.jmx`'s actual sampler names as a substring. Applies to
both the producing sampler (picks the first matching occurrence) and
every consuming sampler (collects all matches, since the same value can
legitimately need replacing in more than one place) — and to both
Apply Selected (`JmxRewriter.apply`) and Apply Checked for templates
(`JmxRewriter.applyTemplates`), since both had the identical bug. A
sampler with no path-like text in its name at all (e.g. fully
CSV-renamed, with nothing left resembling a URL) still correctly
reports "not found," since there's genuinely nothing reliable left to
match on in that case.

### OAuth2/OIDC authorization callback params (code, state, session_state) never detected

Reported: after running Analyze and applying correlations, a
`GET /login/oauth2/code/keycloak` request's own `code`, `state`, and
`session_state` query parameters were still literal, uncorrelated
values — even though other Keycloak-specific values (session IDs,
execution, tab_id) on the same recording were correctly detected and
extracted.

The cause: `code` and `state` simply weren't in the known-name
dictionary that the generic name=value scan checks against. They
weren't added casually, either — `code` and `state` alone are far too
common (an HTTP status field, a country/US-state field, a generic error
code) to add safely to a scan that fires on any isolated `name=value`
or `name:value` text found anywhere; doing that would have traded one
missed-correlation bug for a flood of unrelated false positives.

Instead, added a dedicated, narrow detector for the actual pattern:
a query string — most often embedded in a redirect's `Location` header,
since that's exactly how an OAuth2/OIDC authorization server hands the
browser back to the application — carrying `code` and `state` *together*.
Requiring both to co-occur in genuine query-string syntax (`?`/`&`
before the name, `=` rather than `:`) is specific enough to this one
real shape to avoid the broader risk entirely: it never fires against,
say, a JSON body's `"code": "ABC"` field, since that isn't query-string
syntax at all. When both are found, `code`, `state`, and `session_state`
(if present) are all registered as candidates, each still subject to
the existing "must actually be reused in a later request" filter before
being reported or applied.

### Two real bugs: a value embedded in a header never found, and template testing broken by custom sampler names

Reported: a manually-added Regular Expression Extractor (Response
Headers, extracting `client_id` out of a redirect's query string)
worked correctly when run directly in JMeter, but the Auto-Correlator
never found it automatically, and testing it as a manually-defined
template via "Scan with Templates (Suggestions)…" didn't detect it
either. Two separate, real bugs, both fixed:

1. **Analyze couldn't find a value embedded in a header's value.**
   `extractGenericPatterns()` (the generic "name=value" scan behind
   most OAuth/SSO-style correlation detection) only ever scanned the
   response *body* — never any header's *value*. A redirect's `Location`
   header carrying `client_id=…&session_code=…` in its query string was
   structurally invisible, since `extractNamedHeaders()` only fires
   when a header's own *name* (not value) is a known token name, and
   `Location` isn't. Now scanned the same way as the body. Also added
   `client_id`, `redirect_uri`, `code_challenge`, `code_verifier`,
   `authorization_code`, and `session_code` to the known-name
   dictionary — standard OAuth2/OIDC parameters exactly like the ones
   this project's own Keycloak-style scenario scripts hit.

2. **Testing a template against a real recording silently failed for
   any custom-named sampler.** `TemplateScanner`'s `findExchange()`
   matched a template's producing sampler against a recording's
   internal exchange label by *exact string equality* — correct only
   when a sampler's `.jmx` name happens to literally equal
   `HarParser`'s own raw `"METHOD path #N"` label, the default with no
   naming customization. The **Scenario name prefix** feature added
   earlier in this project renames samplers to
   `"{prefix}_T{NN}_{marker} {NNN} {path}"`, which no longer equals
   that raw label at all — so testing any template against a
   prefix-named recording silently reported "no captured response
   available," every time, regardless of whether the rule was actually
   correct. Same for a CSV-renamed sampler. Fixed with a path-based
   fallback: when the exact match fails, it matches on the longest URL
   path still found as a substring of the producing label, which the
   prefix scheme and most CSV renames still carry. A known remaining
   limitation: if the exact same endpoint is hit more than once in a
   recording, this can still match the wrong occurrence, since nothing
   else here disambiguates between them.

### Manually authoring a correlation rule, added into a template

Previously, every way to get a saved correlation rule went through
either scanning an existing .jmx's Regular Expression Extractors or
saving one of the Auto-Correlator's own automatically-found candidates
— `CorrelationRulesDialog`'s own doc comment even said outright that
there was "no custom-rule-authoring concept" here. That's the one real
gap this fills: a **New Correlation Rule…** button next to "Scan with
Templates (Suggestions)…" on the Existing Extractors & Templates tab
opens a form for the rule itself (producing sampler, variable name,
regex, replacement string, match number, from-headers/fail-loudly
flags, known consumers) plus a **Template** dropdown — pick an existing
template to add this rule alongside its others, or type a new name to
start one. A "template" here is exactly the existing project grouping
(`CorrelationTemplate.project`) saved rules already live under, not a
new, separate concept — this adds one more rule into it, the same way
scanning an existing .jmx or saving a found candidate always has.

The regex is validated before Save is allowed: it has to actually
compile, and it has to contain a capturing group (otherwise nothing
would ever be extracted) — the same kind of immediate feedback "Test
Regex…" already gives for a found candidate, just at authoring time.
"Test Regex…" is available inside this dialog too, for checking syntax
and group capture against pasted sample text.

Once saved, testing it is already-existing functionality working
exactly as it did before: **Scan with Templates (Suggestions)…** runs
it against the current recording and reports whether the producing
sampler was found, the actual match count against the real captured
response, and which consuming samplers were found — then **Apply
Checked to Current .jmx** adds the real extractor.

### Find Value: given a value, find where it came from and where it's used

New **Find Value…** button next to "Test Regex…" on the Analyze
Recording tab. Paste a dynamic value noticed some other way — dev
tools, a bug report, a teammate pointing at a field — and it searches
the whole last-analyzed recording for:
- every response whose **body** or any **header** (including repeated
  ones like multiple Set-Cookie lines) contains that exact value, and
- every request whose **URL**, **body**, a **param**, or a **header**
  contains it,

reporting which sampler and which specific field matched for each. A
literal substring search, not a regex — paste the value exactly as it
appeared. If both a producer and a consumer turn up, that's a genuine
correlation candidate worth turning into a Regular Expression Extractor
via Test Regex… or New Template… above. Opens pre-filled with whatever
is currently typed in the candidates table's own Filter field, as a
convenience when that's the value you were just looking at.

### Scenario name prefix: a naming convention for Transaction Controllers and samplers

Requested naming convention: a scenario prefix (e.g. `S01_Collector_Activity`)
carried through every Transaction Controller and every sampler, so a tree
reads like:

```
S01_Collector_Activity_T01_Launch
    S01_Collector_Activity_T01_Launch 001 /coll/home
    S01_Collector_Activity_T01_Launch 002 /coll/home/oauth2/authorization/keycloak
S01_Collector_Activity_T02_Login
    S01_Collector_Activity_T02_Login 001 /auth/realms/C360/login-actions/authenticate
    S01_Collector_Activity_T02_Login 002 /coll/home
```

New, optional "Scenario name prefix" field on the Record Scenario
(Playwright) dialog, remembered per-script same as the other optional
fields. When set:
- Each `markTransactionStart`/`End` block becomes a Transaction
  Controller named `{prefix}_T{NN}_{name}` — NN assigned in the order
  each distinct transaction name is first used in the recording, so a
  transaction that recurs later (e.g. a second Login) reuses the same
  number rather than getting a new one.
- Every sampler inside that controller is named
  `{that controller's full name} {NNN} {path}`, numbered 001, 002…
  resetting to 001 for each new controller.
- A sampler outside any marker (no matching transaction) is named
  `{prefix} {NNN} {path}` instead, with its own separate,
  continuously-incrementing counter.
- `{path}` is the CSV-mapped name when "Rename Samplers (CSV)" resolves
  one for that URL, otherwise the request's own URL path — the two
  features compose rather than one overriding the other.

Left blank (the default), every name is exactly what it was before this
feature existed — nothing changes for anyone not using it.

### Analyze taking minutes (or appearing stuck) on a large recording

Reported and reproduced: "Analyze" left running for several minutes
with no apparent progress on a real-world recording. Two compounding
causes, both fixed:

1. `extractJson()` flattened an entire JSON response body and registered
   *every single field* as a correlation candidate, with no cap. A bulk
   data response (a category list, product catalog, reference-data
   cache) can flatten to thousands of fields, and each one registered
   as a candidate meant one more full scan of every later exchange's
   request to check whether it gets reused — pure, avoidable cost from
   data nobody was ever going to correlate on. Fixed by capping generic
   (not dictionary-recognized) field extraction once a single response
   flattens past 200 fields — a response that large is essentially
   never a focused, token-bearing one. Dictionary-recognized token
   names (csrftoken, sessionid, viewstate, etc.) are still extracted
   regardless of response size, since those are exactly the ones worth
   finding.
2. `RecordedExchange.requestContains()` re-walked the URL, body, every
   param, and every header — issuing a separate `String.contains()`
   call for each — on *every single call*, even though a given
   exchange's request data never changes between calls. Since this is
   called once per (candidate, later-exchange) pair, that's tens of
   thousands of redundant map iterations for a large recording. Fixed
   by concatenating an exchange's full searchable request text once,
   cached on first use, so each call is a single `String.contains()`
   against already-prepared text.

Note for a run already stuck when the fix lands: there's currently no
way to cancel an in-progress Analyze from the dialog itself (Analyze
just disables itself while running) — stopping one early means closing
JMeter. Re-running Analyze after updating should be dramatically
faster on recordings like this.

### Self-healing a stale remembered .jmx/HAR path

A reported, reproduced case: the remembered ".jmx output file" for a
given script had somehow ended up holding a `.js` path instead (likely
a one-time copy-paste slip, since the script path and `.jmx` path
fields sit right next to each other), and kept reappearing every time
that exact script was used — a plain "remember whatever was typed last
time" lookup has no way to tell a wrong value from a right one, so it
kept reapplying it. Fixed at the actual source rather than requiring a
one-time manual fix on each affected machine: a remembered HAR/`.jmx`
path is now only trusted if it actually ends with the right extension.
A remembered value that doesn't is skipped entirely, leaving the field
empty — which means the auto-fill logic (deriving the correct path from
the script's own name) gets the chance to fill in a correct one instead
of a known-wrong value blocking it forever.

### Auto-Correlator handoff: recording file and source now pre-filled too

Opening the Auto-Correlator right after a successful recording (Record
Scenario or Record Interactively) already pre-filled the `.jmx` path,
but left "Recording file" blank and "Recording source" defaulted to
JTL — wrong for this exact handoff, since both of those recording flows
always produce a HAR, never a JTL. Both now get passed through: the
recording-source radio is set to HAR automatically, and the recording
file field is pre-filled with the path that was just generated —
nothing left to Browse-and-select-radio by hand for a file the dialog
opening it already knows the path of.

### Transient confirmation popups: don't just poll for visibility, race the underlying API response too

A reported, reproduced failure turned out to have a much more specific
cause than headless rendering: a "Submitted successfully" confirmation
is a popup that auto-dismisses after about 3 seconds. A plain
`locator.waitFor({ state: 'visible' })` polls the DOM rather than
watching continuously, so it can genuinely miss the toast's entire
window if it doesn't happen to check while it's up — worse here, since
unrelated broken components on the same page were repeatedly throwing
JS errors right around this moment (now visible via the console-error
capture above), which can delay how quickly the page responds to
Playwright's own DOM queries in the first place.

Fixed by racing the toast text against the underlying API response that
triggers it, using `page.waitForResponse()` registered *before* the
triggering click (it only catches a response if already listening when
it arrives) and `Promise.any()` — not `Promise.all()`, which would wait
for both to settle rather than either one, since a first draft of this
fix made exactly that mistake before being caught and corrected. The
network response fires independent of how busy the page's own
rendering is, so it can't be missed the way a fast-disappearing DOM
element can. See `scenario-template.js`'s own header comment for the
general pattern, applicable to any confirmation popup across any app,
not just this one.

### Headless-specific rendering differences: viewport, User-Agent, and visible console errors

Beyond the viewport fix above, two further, separate causes behind
"API calls succeed but specific UI elements never render" in headless
mode, found from two further rounds of a reported, reproduced failure:

- **User-Agent detection.** Headless Chromium reports `HeadlessChrome`
  in its own User-Agent string by default. Some apps detect this
  specifically and serve a degraded UI — hiding navigation chrome,
  skipping certain renders — regardless of viewport size.
  `scenario-template.js` now sets a plain desktop Chrome User-Agent.
- **No visibility into client-side JS errors.** Previously, if the
  app's own JavaScript threw a runtime error specifically under
  headless Chromium, there was no way to see it — only network timing
  was captured. `page.on('console', ...)` and `page.on('pageerror',
  ...)` now surface those live, labeled `[BROWSER CONSOLE ERROR]` /
  `[BROWSER PAGE ERROR]`, shown in the live current-step display the
  same as any other line (unlike `EVENT:NETWORK_TIMING`, these aren't
  frequent enough to need filtering out).

### Default sampler names: path only, no hostname

A sampler's auto-generated name (before any CSV override below applies)
is now just the method and path — `GET /coll/home #1`, not `GET
https://perf3.example.com/coll/home #1`. The hostname repeats
identically on every single row and adds nothing a reader doesn't
already know from the HTTP Request Defaults/server field, so dropping
it makes names shorter and the actual, distinguishing part (the path)
easier to read at a glance — this applies to every HAR-based path
(Playwright codegen, browser-exported HAR, the interactive recorder),
since they all go through the same parsing step. The CSV override's own
pattern matching is unaffected either way — it still matches against
each request's full, original URL, not this shortened display name.

### Keeping sampler names stable across releases

An optional **Rename Samplers (CSV)** field lets you supply known custom
sampler labels by URL pattern, so regenerated scripts keep the *same*
sampler names release over release — this matters because dashboards,
SLA baselines, and trend reports are usually keyed on these labels, and
those silently break the moment a script's auto-generated names shift.
This is a different, complementary mechanism from
`markTransactionStart`/`markTransactionEnd` (below): this renames an
*individual* sampler's own label; that groups *multiple* samplers under
a Transaction Controller. Both can be used on the same script. See
`playwright-scenarios/sampler-names-sample.csv` for the format:

```
pattern,sampler_name
/api/login,Login_POST
/api/search\?,Search_Query
"/api/items/\d{2,4}$",Item_Fetch
```

Two columns: a pattern and the sampler name to use when it matches.
The pattern is a regex (`java.util.regex`) matched against the request's
full URL — a plain fragment like `/api/login` works as-is, since none
of its characters are regex metacharacters; write a real regex (anchors,
character classes, quantifiers) for anything more specific, like matching
a numeric ID of varying length. If a pattern itself needs a literal comma
(a `{2,4}`-style quantifier, for instance), quote the whole field, as in
the last example above — otherwise the comma would be read as the
column separator.

Rules are tried in file order; the **first match wins**. Any request that
doesn't match anything keeps its auto-derived label, so a partial mapping
is fine — you don't need to name every single request. Multiple
requests matching the same rule intentionally get the **same** name
(e.g. "Search" hit three times during a scenario reports as three
identically-named samplers) — that's correct, not a collision: JMeter's
own Aggregate/Summary Report groups by sampler label, so this is exactly
what makes repeated calls to the same endpoint aggregate together
properly, rather than showing up as unrelated one-off samplers.

## Record Interactively — no scripting, live transaction marking and text assertions

**Tools → SmartBlitz - JMeter Workbench... → Record a New Scenario → Record Interactively...**, for when
you don't want to write or maintain any `.js` file at all, and want to
mark transaction boundaries (and text assertions) as you go rather than
defining them afterward.

Click **Start Recording** and a real (headed) browser opens. Click
through your scenario by hand — log in, navigate, submit forms,
whatever it actually is. Before and after each logical step, type a name
in the **Transaction name** field and click **Start Transaction** / **End
Transaction**; every request that happens in between gets grouped under
a Transaction Controller with that name in the generated script (JMeter's
own `TransactionController`, `TransactionController.parent = false` so
individual request rows stay visible in reports alongside one added
rollup row — a failure inside a transaction is still traceable to the
specific request that caused it, not just "the transaction failed").

Right below that, a separate **Expected text** field with matching
**Start Text Assertion** / **End Text Assertion** buttons works the same
way, but adds a Response Assertion (checking the response body contains
that text) to every request in between instead of grouping it — same
bracket pattern, independent effect. A request can fall inside both a
transaction window and a text-assertion window, either, or neither.

When you're done, click **Stop Recording & Generate Script**. If a
transaction or text-assertion window was left open, each is closed
automatically using the stop time as its end, so nothing is lost from
forgetting to click "End Transaction" or "End Text Assertion" on the last
step. Same downstream flow as the scripted recorder: a fresh `.jmx` is
generated (same static-asset/domain filtering, same optional Rename
Samplers CSV for renaming individual samplers by URL — independent of,
and in addition to, the Transaction Controllers and text assertions
created here), with an offer to open the Auto-Correlator immediately
afterward.

See the three-way comparison table under "Generate Playwright Script"
below for when to reach for this versus the other two recording paths.

**Auto-fills the recorder script field** so you don't need to Browse for
`interactive-recorder.js` every time — unlike a per-scenario script,
it's the same fixed file every session. Tries, in order: the path last
used successfully (remembered across JMeter restarts), then a sibling of
whichever `.jmx` is currently open in JMeter named
`interactive-recorder.js` (matching the common layout of keeping it
alongside the `.jmx` files it produces); leaves the field blank for a
manual Browse if neither is found.

**How it works under the hood:** unlike the scripted recorder (which runs
a script to completion and reads its output once), this keeps the Node
process alive for the whole session and talks to it over its stdin/stdout
— `START_TXN:<name>` / `END_TXN:<name>` commands sent as you click the
buttons, `EVENT:...` lines echoed back with the recorder's own timestamps
(avoiding any Java-vs-Node clock skew when matching markers to requests
later). `playwright-scenarios/interactive-recorder.js` is the counterpart
to `scenario-template.js` — but unlike that file, it's launched as-is
and never needs copying or editing.

Both the response **body** and **headers** are always available via a
**Test against: Response Body / Response Headers** toggle — a
cookie/session/CSRF value lives in a response header (`Set-Cookie`,
typically), never the body, so testing against the wrong one just burns
time on a regex that was never going to match anything meaningful there.
The candidate's own `fromHeaders` flag decides which one starts selected,
but switching and clicking **Apply to Candidate** corrects that flag if
it was wrong — this isn't just a preview toggle.

**Fixed:** every candidate detected from a `Set-Cookie` header was
incorrectly marked as body-sourced, which meant the regex-building step
searched for the value in the wrong text, didn't find it there (a session
cookie value doesn't normally appear in the HTML/JS body), and silently
fell back to a contextless `(.*?)` — which then matches practically
everything. Every cookie-derived candidate now correctly tests against,
and generates its extractor against, the response headers.

## Transaction names in scripted scenarios too

`scenario-template.js` now includes `markTransactionStart('Name')` /
`markTransactionEnd('Name')` helper functions — wrap any section of a
scripted scenario with them and every request in between gets grouped
under a real Transaction Controller in the generated `.jmx`, the same as
the live interactive recorder's Start/End Transaction buttons. Both paths
use the exact same underlying mechanism: a `console.log("EVENT:...")`
line with a timestamp, parsed back out after the run (live, line-by-line,
for the interactive recorder; from the complete captured output, for a
scripted run via **Re-record Existing Script**).

This does **not** work live during **Generate Playwright Script**,
though — `playwright codegen` is a pre-built external tool with no hook
for an outside process to inject "mark a transaction here" while it's
running. The practical path there: after codegen generates the script,
open it and wrap whichever sections you want with the same
`markTransactionStart`/`markTransactionEnd` (grouping) and/or
`assertTextStart`/`assertTextEnd` (assertion) calls by hand — a quick
edit, not something automated, but it only needs doing once per scenario
since the resulting script is exactly what gets re-run unattended every
release afterward.

**Fixed:** codegen's `--target javascript` output format is
version-dependent — some Playwright versions produce a plain IIFE
script (`(async () => { const browser = await chromium.launch(...); ...
})();`), others produce the `@playwright/test` form (`test('...', async
({ page }) => { ... });`). The extraction logic previously assumed only
the latter, so on an IIFE-producing install it grabbed the wrong
fragment entirely (codegen's own browser-launch boilerplate, not the
recorded actions). Both forms are now detected and handled, anchored on
markers that are part of codegen's own fixed boilerplate in each form
(`newPage()`/`context.close()` for the IIFE form) rather than generic
syntax matching.

**Fixed:** the merged script's own auto-inserted `await
page.goto(baseUrl)` line used to always run before the recording's own
first action — including before a `markTransactionStart('Launch')`
wrapping that same navigation. That meant *our* goto performed the real
page load, timestamped outside the marker's window, while the
recording's own goto right after did nothing (already on that page) —
silently leaving that transaction empty, which produces no Transaction
Controller at all rather than an obviously-wrong one. Now detected and
skipped: if the recording's own first real action (looking past any
leading `markTransactionStart`/`End` calls) is already a `page.goto(...)`,
the template's own redundant one is omitted entirely.

## Live progress during headless replay

A headless run has no visible browser to watch, so a slow or stuck step
was previously indistinguishable from the whole process having hung —
nothing surfaced until the run finished or timed out. **Record Scenario
(Playwright)** now shows an indeterminate progress bar plus the single
most recent line the script has logged, updated live as each line
arrives rather than only once the run completes. The architectural fix
was in `PlaywrightRunner`: output was previously batched into a string
only returned at the very end, regardless of how much a script logged —
now each line streams to the UI the moment it arrives.

Call `logStep('Doing X')` before any significant action in a scenario
script (`scenario-template.js` already does, and demonstrates the
convention) — whatever it last logged tells you exactly which action
the script is currently on, not just which named transaction. The
existing `EVENT:START_TXN`/`END_TXN`/`ASSERT_TEXT_*` markers are shown
too, reworded into plain text; `EVENT:NETWORK_TIMING` and
`EVENT:RENDER_TIMING` are deliberately left out of this one-line
summary (one fires per HTTP request — showing raw JSON from those would
flash past faster than anyone could read), though both remain fully
visible in the full output log below as always.

## Generate Playwright Script — codegen, driven from the tool, output is reusable

**Tools → SmartBlitz - JMeter Workbench... → Record a New Scenario → Generate Playwright Script...**, for
creating a scenario the *first* time: drives the real `playwright
codegen` tool (a real browser plus the Playwright Inspector — nothing
reimplemented) from a button here instead of a terminal, and once you
close the browser, **automatically merges what it recorded into a
proper, reusable `.js` file** following the `scenario-template.js`
convention. This is what makes recording-once actually pay off every
release afterward: the output isn't a one-off HAR, it's a script you can
check into a repo and re-run **unattended** via **Record Scenario
(Playwright)** next quarter, exactly like one you'd written and
maintained by hand — except you never had to write or copy-paste a
line of it. This automates every manual step from
`HOW-TO-RECORD-A-SCENARIO.md` (run codegen, copy the action lines,
remember to de-hardcode credentials).

Fill in the app's base URL, your test username/password (optional —
used only to find-and-replace anything you type during recording, since
codegen records literally what you type), a scenario name, and an output
folder. Click **Start Recording**; a real browser and the Playwright
Inspector open, click through the scenario normally, close the browser
when done. The merged script is written to `<folder>/<name>.js`, and
you're offered to open **Re-record Existing Script** immediately,
pre-filled with it, to also generate today's `.jmx` in the same sitting.

**Launchable from anywhere, not tied to wherever JMeter happens to be
started from.** A reported, reproduced failure traced back to exactly
this: neither `npx playwright codegen` (recording) nor a saved script's
own `require('playwright')` (re-running it later) were pinned to any
particular Playwright installation. The recording process inherited
whatever directory the JVM's own working directory happened to be —
unpredictable, varying by how JMeter itself gets launched — and a saved
script's `require('playwright')` resolves `node_modules` starting from
the script's own location on disk (confirmed against Node's actual
documented module resolution algorithm, not assumed), which is
whatever "Output folder" was chosen — essentially never anywhere near a
real `node_modules`.

Fixed with a dedicated installation this plugin manages itself, at
`~/.jmeter-correlationstudio/playwright-runner/`. A first-time (or
repair) **Install Playwright Browsers Now** step runs `npm install`
then `npx playwright install chromium` there once; every later
`codegen` launch is pinned to that same directory, and every saved
script's replay gets `NODE_PATH` pointed at its `node_modules` as a
fallback once Node's normal lookup fails to find anything near the
script itself. If a recording attempt's own output ever matches
Playwright's specific "Executable doesn't exist" message, a clear
repair button appears in the dialog itself instead of raw, hard-to-
parse stderr — click it, it fixes itself, then automatically retries
the recording that failed.

**Three recording paths now exist — here's when to reach for each:**

| | Generate Playwright Script | Re-record Existing Script | Record Interactively |
|---|---|---|---|
| Use it for | Creating a scenario the first time | Re-running an already-written scenario, unattended | A quick one-off, or when you want live transaction marking/text assertions |
| Produces a reusable `.js`? | Yes — that's the point | N/A (consumes one) | No — goes straight to HAR/`.jmx` |
| Repeat next release | Not needed — the script IS repeatable now | Just re-run it, no human needed | A person clicks through again |
| Transaction grouping | Manual edit after generating (`markTransactionStart`/`End`) | Yes, if the script uses `markTransactionStart`/`End` | Live, named, while recording |
| Text assertions | Manual edit after generating (`assertTextStart`/`End`) | Yes, if the script uses `assertTextStart`/`End` | Live, named, while recording |
| Credentials | Typed into the real browser; sanitized into the script afterward | Passed via env vars | Typed into the real browser |

All three ultimately feed the same `HarToJmxGenerator` and hand off into
the same `CorrelatorDialog` afterward — nothing about correlation,
templates, or the regex tester changes based on which one you used.

## Testing a regex before committing (NeoLoad-style)

Select a row in the candidates table and click **Test Regex...** to open a
live tester: the actual captured response the candidate was extracted
from is shown on top; below it, the regex, template, and match number are
editable, with every match re-evaluated live as you type. You get:
- **Match count** — 0 means this regex would fail against this
  response.
- **Every match listed**, with the one your current match number would
  actually select marked with `->`.
- A warning if the match number you've set doesn't exist (e.g. you set 3
  but the regex only matches twice).

Uses plain `java.util.regex` with no extra flags, deliberately mirroring
JMeter's own `RegexExtractor` default behavior exactly (e.g. `.` does not
match newlines unless the pattern itself uses `(?s)`) — what you see
passing here is what JMeter will actually do at runtime, not a more
permissive approximation. **Apply to Candidate** writes the edited
regex/template/match-number back into that row; **Cancel** discards the
edits. The main table also has a directly-editable **Match #** column for
quick tweaks without opening the tester at all.

**Fixed: could freeze on a large response.** A minified JSON response
with no natural line breaks, displayed in a line-wrapped text area, could
hang the UI for a long time while Swing computed wrap points across one
giant unbroken line — a known Swing performance issue, not a problem
with any particular regex or response. The displayed preview is now
capped (200,000 characters, with a note if truncated); **matching itself
always runs against the complete, untruncated response** regardless, so
nothing about correctness changes, only what gets rendered on screen. The
results list is capped the same way (500 entries) for the same reason, in
case a generic pattern genuinely matches thousands of times — the one
match your current match number would actually select is always shown
in full, even if it falls past that cap, and the summary's total count
is always accurate regardless of how many are rendered.

## Feeding it real response data

### Option A: JTL (from a JMeter run)

The default JTL only has metadata (timings, response codes) — the actual
values you need to correlate only exist in response bodies and full
request details, which need to be explicitly turned on:

```bash
jmeter -n -t test.jmx -l results.jtl \
  -Jjmeter.save.saveservice.output_format=xml \
  -Jjmeter.save.saveservice.response_data=true \
  -Jjmeter.save.saveservice.samplerData=true \
  -Jjmeter.save.saveservice.requestHeaders=true \
  -Jjmeter.save.saveservice.responseHeaders=true
```

Point the dialog at that `results.jtl`, select "JTL" and analyze.

### Option B: HAR (browser recording)

Chrome DevTools \u2192 Network tab \u2192 record your flow \u2192 right-click any
request \u2192 "Save all as HAR with content". Point the dialog at that file,
select "HAR" and analyze.

**Important caveat specific to HAR:** browser recordings are far more
granular than a JMeter test plan (every image/CSS/JS/analytics request
gets captured too), and HAR entries won't generally have labels matching
your actual sampler names. Candidates found this way are still useful for
identifying which tokens need correlating and getting a starting regex —
but the Apply step can only rewrite a producing/consuming sampler it can
find by exact `testname` match in your `.jmx`. Anything it can't match is
skipped and listed in the "Items needing a look" summary after applying,
rather than failing silently.

**Fixed a real hang:** forcing only the outer Thread Group's loop count to 1
isn't enough — a **Runtime Controller** nested anywhere inside runs its
children repeatedly for a *configured duration*, completely independent of
loop count, and a Thread Group's own optional Scheduler/Duration setting is
a third, separate way a "single-user smoke test" could keep running far
longer than intended. All three are now neutralized: every `LoopController`
anywhere in the tree (not just the one directly on each Thread Group) is
forced to 1 loop, every `RunTime` (Runtime Controller) anywhere is forced
to 1 second, and each Thread Group's Scheduler is turned off. A 90-second
hard timeout wraps the whole run regardless, forcibly stopping the test if
something else not accounted for is still keeping it going — whatever was
captured before the timeout is still in the temp JTL, reported in the
error message, if you want to inspect it manually.

**Fixed: no way to stop it, and the Stop button was disabled.** JMeter's
own Start/Stop toolbar has no visibility into an engine instance created
this way — it's a separate `StandardJMeterEngine` this plugin spins up
itself, not the one behind JMeter's normal "Run" flow. There's now a
**Stop** button inside the dialog itself, right next to "Run Script Once,"
enabled only while a run is in progress, that calls `engine.stopTest(true)`
on the actual running instance.

**Fixed: JMeter sets no timeout on HTTP samplers by default**, so an
unresponsive backend could block a socket read indefinitely — which
also explains why the 90-second backstop timeout didn't save you: a
cooperative `stopTest()` can't unstick a thread already blocked inside a
raw socket read. Every sampler's connect/response timeouts are now capped
(10s / 15s) for this smoke-test run regardless of what the script
originally had configured, since a bounded probe is exactly what's wanted
here.

**Added: a live log**, showing each request as it completes —
timestamp, success/fail, response code, label, elapsed time, and a short
response-body preview. If it looks stalled, the request immediately after
the last line shown is the one currently running.

### Option C: No recording at all — run the script once

A hand-built script (samplers configured directly from API docs, never
actually executed) has nothing to correlate against — the dynamic values
only exist in real responses, never in the static script itself. Click
**"Run Script Once to Capture Responses..."** next to the target `.jmx`
field instead of choosing a recording file.

This actually **executes your test plan** — forced down to a single thread
and a single loop per thread group (via `SearchByClass` over the loaded
tree, same approach JMeter's own engine uses internally), with full
response/request data captured to a temporary JTL — then feeds that
straight into the same analysis as Option A.

**This sends real requests to whatever the script is configured to hit.**
It is gated behind an explicit confirmation dialog (defaulted to Cancel)
every time — nothing runs automatically. Only use this against a
test/staging environment, or one you're certain is safe to hit once. If
your script has side effects (creates an order, sends an email, charges a
card, etc.), that side effect will actually happen.


**Saving as you apply, not as a separate step.** Clicking **Apply
Selected** prompts once, before anything is written: a checkbox for
"Also save approved candidates as templates" (checked by default) and a
**Project (new or existing)** combo, pre-populated with every project
name already in use so picking one is a selection, not retyping it
exactly. There used to be a separate "Save Selected as Templates…"
button doing the same job from a different trigger, needing its own,
easy-to-forget project field set beforehand in a different tab \u2014 the
two actions are now one, asked for at the one moment a correlation
actually gets decided. Each template's name still defaults to its
variable name; a collision with an existing template is never silently
overwritten \u2014 renamed with a " (2)", " (3)", etc. suffix instead,
same as Import. Rename anything afterward in the saved-templates table
in Correlation Rules's Existing Extractors & Templates tab.

**Categorized by project.** The saved-templates table has its own
**Project** column (directly editable, for re-categorizing something
already saved), and a **"Filter by project"** dropdown above it narrows
the table to just one project at a time \u2014 useful once you have more
than a handful across multiple applications. Different applications
commonly need entirely different correlation rule sets, so this keeps
them apart rather than one flat pool.
One thing worth knowing: a checked row's checked-state is remembered
regardless of the current filter, so checking rows, then switching the
filter to a different project, then clicking Apply/Scan/Export can still
include a checked row you can no longer see. Check **Select All** (or
verify visually) after changing the filter if you want to be sure only
what's currently visible gets acted on.

## Existing Extractors & Templates (inside Correlation Rules)

This used to be the main dialog's own second tab; it's now a tab inside
**Correlation Rules…** instead, alongside Built-In Templates, so every
kind of rule/template management lives in one place. It's for two
related things:

**1. See what's already there.** Click **Scan Existing Extractors** (uses
the same target `.jmx` set back in the main dialog) to find every
`RegexExtractor` already present — whether you added it by hand
previously, or this tool did in an earlier session. For each one it shows:
- **Producing Sampler** — found by walking up from the extractor to its
  own `hashTree` container, then to that container's preceding sibling
  (the sampler it's attached to).
- **Consuming Sampler(s)** — found by searching the whole document for
  literal `${variableName}` text, then walking up from each match to the
  nearest ancestor element with a `testname` attribute (which, in
  practice, is always the enclosing sampler — JMeter's unnamed nested
  config nodes like `elementProp`/`stringProp` never carry one).
- Its regex, template, match number, and whether it reads from headers.

**2. Save any of them as a named, reusable template**, for a known
application you'll build more scripts against. Check a row, give it a
**Template Name** (e.g. "MyApp — Login CSRF"), click **Save Checked as
Templates**. Saved templates persist to
`<user.home>/.jmeter-auto-correlator/templates.json`, so they're still
there next time you open the dialog — even in a different JMeter
session, working on a different script for the same app.

**Applying a saved template to a (possibly brand-new) script:** check it
in the saved-templates table and click **Apply Checked to Current .jmx**.
This reliably inserts the `RegexExtractor` onto any producing sampler it
can find by exact `testname` match. **It deliberately does NOT attempt the
consuming-side literal-value replacement** that analyzing a fresh
recording does — a template has no known captured value to search for
in a script that's never actually produced one, so guessing here would
risk a silently wrong edit. Instead, the previously-known consuming
sampler(s) are reported in a summary dialog as a checklist, so you can add
`${variableName}` to the matching field(s) yourself, on whichever of
those samplers actually exist in the new script.

**Current matching is exact-name-only** — a template applies cleanly
when the new script's samplers share the same names as the one it was
scanned from (e.g. copied from a shared base script, or the same script
evolved over time). It won't fuzzy-match differently-named samplers even
if they're functionally the same request.

## How detection works

For each response, in order, it looks for:
- **Set-Cookie headers** — every cookie name=value pair.
- **HTML hidden `<input>` fields** — plus any non-hidden field whose
  name matches the known-token dictionary below, since some frameworks
  don't mark theirs `hidden`.
- **JSON response bodies** — fully parsed and flattened (dot-path
  keys), not just regex-matched, so nested structures are covered
  correctly.
- **A dictionary-driven scan** for common dynamic-field names embedded in
  inline script or plain text (`var token = "..."`, `key: "value"` inside
  a `<script>` config blob, etc.) — only fires for names in the
  dictionary, to keep noise down.
- **Custom response headers** matching the dictionary (e.g. a bespoke
  `X-Csrf-Token` header).

Known-token dictionary (matched independent of separator style —
`csrf_token`/`csrf-token`/`csrfToken` all match the same entry):
`csrf_token`, `authenticity_token`, `xsrf_token`, `x-csrf-token`,
`__RequestVerificationToken`, `__VIEWSTATE`, `__EVENTVALIDATION`,
`__EVENTTARGET`, `JSESSIONID`, `PHPSESSID`, `ASPSESSIONID`,
`ASP.NET_SessionId`, `access_token`, `id_token`, `refresh_token`, `nonce`,
`oauth_token`, `api_key`, `authToken`, `token`, `csrfmiddlewaretoken`,
`security_token`, `session_token`, `request_id`, `correlation_id`,
`transaction_id`.

A value is only kept as a candidate if it's **actually found again** in a
later exchange's request (URL, params, body, or headers) — values that are
never reused aren't useful correlations and are dropped, which also
suppresses most false positives from the dictionary scan.

## Regex generation

For each candidate, it takes the literal text immediately before and after
the value in the source response (same line only, so the generated regex
never needs multiline/dotall flags), escapes any regex metacharacters in
that context, and builds `escapedBefore(.*?)escapedAfter` — the same basic
strategy most correlation tools use as their default. **Edit the regex
column before applying** if the surrounding context is more ambiguous than
usual (e.g. the same literal text appears multiple times in that
response) — the match number defaults to 1 (first match).

## Variable naming

Derived from where the value was found (a JSON key, a hidden field's
`name` attribute, a cookie name, etc.), sanitized into a valid JMeter
variable name, with `_2`, `_3`, ... appended on any collision. **Edit the
Variable Name column** before applying if you'd prefer something else —
this is exactly what feeds both the `RegexExtractor.refname` and the
`${...}` substitution written into consuming samplers.

## What "Apply" actually does

Parses the target `.jmx` as plain XML (not through JMeter's live
tree/GUI model — a deliberate choice to keep this to well-understood,
generic DOM manipulation rather than needing to correctly drive JMeter's
internal tree-model and GUI-refresh APIs). For each approved candidate:

1. Finds the producing sampler by exact `testname` match, and inserts a
   `RegexExtractor` as a child of it (in its own `hashTree`), with
   `useHeaders` set based on whether the value came from a header/cookie
   or the response body, `match_number=1`, and a distinctive default value
   (`NOT_FOUND_<varName>`) so a failed extraction is obvious in results
   rather than silently substituting an empty string.
2. Finds every sampler matching the consuming label(s) and replaces the
   literal captured value with `${variableName}` wherever it's a
   substring of any text node in that sampler's own subtree.
3. Writes the result to a new file and reports exactly how many extractors
   were added, how many replacements were made, and lists anything it
   couldn't apply (with a reason) rather than failing the whole batch.

After applying, **open the new `.jmx` and review it** — check the
inserted extractors' scope/position, and re-run your script to confirm
the regex actually matches and the substitution didn't break anything.
This tool gets you most of the way; it doesn't replace reading the result.
