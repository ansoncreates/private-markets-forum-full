# The Private Markets Forum — Brand Foundation

The rules and parts that make one report page look like the next one. Extracted from the
2026 Technology Summit report, generalised so a new page is assembly rather than design.

Three folders. The system lives in one of them; the other two consume it.

| File | What it is |
|---|---|
| `Brand Foundations/brand.css` | The entire system as tokens + component classes. Link this; never fork it per page. |
| `Brand Foundations/brand.js` | Smooth scrolling, nav behaviour, chart tooltips. One `<script>` at the end of `<body>`. |
| `Brand Foundations/fonts.css` + `fonts/` | The two faces, self-hosted (Zodiak variable WOFF2; Inter variable WOFF2, subset to Latin + punctuation, every OpenType feature kept). Every page links it — homepage, web reports and PDF views; nothing loads a font from a CDN. |
| `Brand Foundations/BRAND-FOUNDATION.md` | This document. |
| `Components/components.html` | Living reference — every element rendered on every surface. Copy markup from here. |
| `Components/page-template.html` | Empty skeleton with the nav wired and one of each section type. |
| `Components/chart-variant-preview.html` | Chart variants side by side, for picking a form. |
| `Reports/infrastructure-at-the-edge-of-scale.html` | Worked example one: the Private Credit Infrastructure survey, built by linking `brand.css`. |
| `Reports/report-2026.html` | Worked example two: the 2026 Technology Summit report (self-contained but for `fonts.css`). |
| `index.html` + `Home/` | The homepage — the Table view (§10) and the Rack view (§10.1). Links `fonts.css`; its own CSS/JS under `Home/`. |
| `HOMEPAGE-VINYL-BRIEF.md` · `RACK-VIEW-BRIEF.md` | The two views' full technical specs. |

**Quick start**

A page in `Components/` or `Reports/` sits one level below the system, so both links
step up and across. The `%20` is the space in the folder name.

```html
<link rel="stylesheet" href="../Brand%20Foundations/fonts.css">
<link rel="stylesheet" href="../Brand%20Foundations/brand.css">
<!-- sections -->
<script src="../Brand%20Foundations/brand.js"></script>
```

A page saved anywhere else re-points these two paths at `Brand Foundations/` and nothing
else changes — the system is never copied, only linked.

Then: paste the `<symbol id="pmf-logo">` sprite once, give every section an `id`, and add one
nav `<a>` per id in reading order. That is the whole setup.

---

## 1. Backgrounds

Four plates. **The plate is an argument about the content, not decoration** — pick it by what
the section is doing, then everything else follows.

| Plate | CSS | Use it when |
|---|---|---|
| **White** | `background: var(--c-white)` | The section is narrative — the general idea, the summary, the running argument. Prose column, navy ink. |
| **Cream** | `background: var(--c-cream)` | Supporting or framing material that must sit apart from the narrative without escalating: context sections, sponsor walls, colophon. |
| **Radial navy** | `radial-gradient(130% 130% at 50% 0%, var(--c-navy) 0%, var(--c-navy) 62.8%, var(--c-blue) 100%)` | The section *is* the argument — the opening claim and the closing one. Hero and "in practice". White ink, ice pills. |
| **Edge-lit navy** | `linear-gradient(180deg, #fff 0%, var(--c-ice) 2%, var(--c-blue) 4%, var(--c-navy) 6%, var(--c-navy) 94%, var(--c-blue) 96%, var(--c-ice) 98%, #fff 100%)` | A layer divider. The lit top and bottom edges act as a chapter break between light sections. |

### The decision rule

- **General idea → the brighter shade.** Anything explaining, narrating or listing goes on
  white (primary) or cream (secondary). Ink is `--c-navy`; boxes are outlines or cream fills.
- **Insight → the gradient, plus box highlights.** Anything that lands a conclusion — a layer
  divider, the hero claim, the closing statement — goes on a navy gradient, and inside it the
  points are carried by **filled boxes**: `.stack__item` for the four layers, `.callout` /
  `.insight__aside` for a point raised about a layer, `.force-card` for a driver.
- A gradient section never runs prose-only. If there is no box, it is not an insight section —
  put it on white.

Both gradients are proportional (percent stops, `130%` radii), so they scale with the section
and never need per-breakpoint tuning.

---

## 2. Colour

### Brand

| Token | Hex | Role |
|---|---|---|
| `--c-navy` | `#090C2A` | Primary ink on light (and on a callout's cream plate), plate fill on dark, **table header**, the callout fill on a cream section |
| `--c-blue` | `#0D1DCC` | Accent: nav hover, gradient outer edge, "Inaugural summit" pill |
| `--c-ice` | `#C8DFF3` | Eyebrow pills, table total row, "Other" series on dark |
| `--c-cream` | `#F6F4F2` | Secondary surface, table zebra, stat tile fill, logo tiles |
| `--c-slate` | `#464850` | Force-card fill, dashed rules, "Other" series on light |
| `--c-white` | `#FFFFFF` | Primary surface, ink on dark plates |

Opacity-derived roles: `--c-text-muted` `rgba(255,255,255,.5)` (muted ink on dark),
`--c-pill-text-dark` `rgba(9,12,42,.8)`, `--c-pill-text-light` `rgba(255,255,255,.8)`,
`.stack__item--muted` `opacity:.2` (out-of-focus layers).

### Contrast (measured)

| Ink | on cream | on white | on navy |
|---|---|---|---|
| Navy `#090C2A` | 17.44:1 | 19.13:1 | — |
| Blue `#0D1DCC` | 9.27:1 | 10.17:1 | 1.88:1 ✗ |
| Slate `#464850` | 8.31:1 | 9.12:1 | 2.10:1 ✗ |
| White | — | — | 19.13:1 |
| Ice `#C8DFF3` | 1.25:1 ✗ | 1.37:1 ✗ | 13.94:1 |

**Blue is a light-surface colour only.** On navy it fails text contrast — use white or ice.

### Data series

Brand blue is one hue, so the chart palette is that hue family fanned across hue *and*
lightness, then validated rather than eyeballed:

```
node scripts/validate_palette.js "#133EEC,#0091CE,#005886" --mode light --surface "#F6F4F2" --pairs all
node scripts/validate_palette.js "#1C4DFB,#009EDB,#006690" --mode dark  --surface "#090C2A" --pairs all
```

| Slot | Light plates | Navy plates |
|---|---|---|
| Series 1 | `#133EEC` | `#1C4DFB` |
| Series 2 | `#0091CE` | `#009EDB` |
| Series 3 | `#005886` | `#006690` |
| Other (4th+) | `#464850` slate | `#C8DFF3` ice |

Both sets pass all six checks **all-pairs**: lightness band, chroma floor, CVD separation
(worst 16.0 light / 16.6 dark, target ≥ 8), normal-vision floor (17.4 / 18.2, floor 15) and
≥ 3:1 against their surface.

- **Three series is the cap.** A fourth folds into "Other", or the chart becomes small
  multiples. Never generate a new hue.
- Assign slots in fixed order and by entity — filtering a series never repaints the others.
- The dark set is *selected*, not an automatic lightening. `.on-dark` swaps the tokens.
- Sequential/ordinal magnitude uses one hue, `--data-s1` … `--data-s7` (`#E3EBFC` → `#090C2A`).

---

## 3. Text styles

Two families: **Zodiak** (display serif) for anything titular, **Inter** for everything else —
both self-hosted (`fonts.css`), never from a font CDN: a render-blocking stylesheet on two
third-party origins held every report's first paint, and the same files now serve every page
from one cache.
Every size is fluid between a 375px and a 1440px viewport via one engine:

```css
--fluid: clamp(0px, (100vw - 375px) / 1065, 1px);
--fs-title: calc(40px + 24 * var(--fluid));   /* 40 → 64 */
```

| Style | Token / value | Mobile → desktop | Where |
|---|---|---|---|
| Display | `--fs-title` / `--lh-title` | 40/46 → 64/70, −2%, capitalize | Hero, layer divider titles |
| Section title | `--fs-intro-title` / `--lh-intro-title` | 28/34 → 44/50, −3%, capitalize | Every section heading, insight titles — runs the full reading column, **two lines at most** (see below) |
| Action title | `--fs-action-title` | 24 → 28 / 32 fixed, −2% | Numbered actions |
| Label | `--fs-label` / `--lh-label` | 24/32 fixed, −2% | Layer labels, callout labels, chart titles |
| Photo caption | `.figure__caption b` / `.figure__credit` | 18/26 (16/24 on a phone), −1.5% / 12/18 at 80%, fixed | A photograph's caption and its credit line — a caption, not a heading |
| Standfirst | `--fs-lead` / `--lh-lead` | 18/28 → 20/32 | One per section, above the body |
| Body | 16/24 fixed, −.016em | 14/22 below 600px — every heading, subheading and run of body copy steps down 2px on a phone | All prose |
| Small | 14/20 fixed, −.018em | same both ends | Card bodies, table cells, credits |
| Eyebrow pill | 12/18, `--track-caps`, uppercase, Semi Bold | fixed | `.pill--md` — every section eyebrow |
| Hero pill | `--fs-pill` | 10 → 12 | Hero only |
| Footnote | 12/18, −.022em | fixed | Colophon note, chart source |
| Index | `--fs-index` / `--lh-index` | 24/32 → 48/54, −3% | Layer numerals, stat values |

Uppercase micro-labels (pills, table headers, stat labels) all track from `--track-caps` (.08em).
Keep it tight — widely spaced caps read as filler.

Rules: one standfirst per section; body never goes below 14px; titles are `text-wrap: pretty`
(left-aligned) or `balance` (centred); numbers use `font-variant-numeric: tabular-nums`.
A single-sentence heading or subheading carries no full stop. An `h3` insight title under a
section's `h2` (the infrastructure report) takes the action-title size, not the section's.

**Titles fill the column and hold to two lines.** A section or insight title has no measure
of its own any more — it runs the whole reading column (960 at 1440) at 44px, which sets
every title in both reports in one or two lines rather than three or four short ones with the
column empty beside them. Where a title still runs to three on a wide measure (≥560px —
a long title in a narrower window), `copyfit.js` steps its size down 2px at a time, leading with
it, to at most 8px, and marks it (`data-fit="2 lines: 40px"`); phones and tablets wrap as they
must. Titles keep `text-wrap: pretty` and their last two words glued, so none ends on a
single word.

**Copy fitting.** No hyphens, no orphans, no short last line — on the site and on the sheets.
Body copy wraps greedily (`text-wrap: wrap`), so every line runs out to the measure and a
paragraph reads exactly as wide as the table beside it; headings keep `pretty`. The pages glue
each run's last two words with a no-break space and hold hyphenated compounds
(`<span class="nb">end-to-end</span>`) on one line (`.build/fitlib.py`, idempotent). Then
`copyfit.js` — loaded after `brand.js`, inline in report-2026 — takes any paragraph whose last
line is under **30% of the measure** and settles it the way a typesetter would, cheapest move
first: tracking by up to .015em tighter or .01em looser, then up to .08em of word space (a
space never leaves 68–132% of itself, and the full word-space move never rides with the full
tracking move); a run of three lines or more that will not settle gives up measure 2% at a
time, to 88%; a two-line run balances; `pretty` is the last resort. It runs once the faces have
loaded and again after a resize, measuring every candidate on a hidden clone, and marks what
it did on the element (`data-fit="-0.01em"`, `"94% measure"`, `"balance"`). The PDF build runs
the same script and bakes its result into the sheets as inline styles, so the viewer and the
printed file need no script.

---

## 4. Spacing & layout

**Inline padding is the same everywhere — 20px mobile, 112px desktop** (`--pad-inline`),
including the nav bar. Nothing on the page is inset differently.

| Token | Mobile → desktop | Use |
|---|---|---|
| `--pad-inline` | 20 → 112 | Every section and the nav |
| `--pad-top` | 64 → 96 | Standard section top |
| `--pad-bottom` | 20 → 96 | Standard section bottom |
| `--pad-layer-block` | 129 → 112 | Layer dividers (taller on mobile by design) |
| `--pad-closing-block` | 64 → 48 | Colophon |
| `--gap-prose` | 16 | Eyebrow → title → copy; chip → title; label → copy in a callout or aside is 24 |
| `--gap-para` | 16 | Paragraph → paragraph in every run of copy |
| `--gap-heading` | 16 → 20 | Title → subtitle (hero and layer dividers); eyebrow → title on a divider is 20 → 24 |
| `--gap-forces` / `--gap-layer` | 40 → 56 | Block → block inside a section |
| `--gap-actions` | 40 → 64 | Intro · card · card · figure |
| `--gap-insights` | 40 → 96 | Insight card → insight card; inside a card, header · block · block · aside part by 32 |
| `--gap-grid` | 20 | Every card grid, both axes |
| `--content-max` | 1216px | Full-width blocks (grids, figures, nav) |
| `--measure-prose` | 335 → 960 | Reading column, centred — two-thirds of a 1440 viewport. Tables, charts, callouts and source lines marked `.is-narrow` take exactly the same width at every viewport, so a table is as wide as the paragraph above it on a phone, a tablet and a desktop alike |
| `--measure-layer-subtitle` | 335 → 598 | Centred copy under a layer-divider title (the dark, numbered section) — keeps the original measure. (The old title measures — `--measure-intro-title`, `--measure-forces-title/-note`, `--measure-insight-title` — are gone: titles take the column.) |

**Phones (<600px).** Every heading, subheading and run of body copy is 2px smaller than
its ramp's foot, leading following (title 38/44, section 30/36, lead 16/26, body 14/22,
labels 22/30, small 12/18). Tables fit the screen: headers wrap, cells 12/16 with 8/6 padding,
a figure still never breaks; nothing scrolls sideways.

**Tablets (600–899px).** The reading measure is 400–566px and a table takes exactly that
width, so its headers give up nowrap and every cell 4px of padding (10/12) to fit inside it;
the type stays at 14/20.

Grids step **1 → 2 (≥600px) → 4 (≥900px)** columns. Stacked cards collapse shared borders with
`margin-top:-1px`. Figures are full `--content-max`, prose stays in `--measure-prose`.

---

## 5. Elements

| Element | Class | What it is | Where it belongs |
|---|---|---|---|
| Nav bar | `.nav` | Fixed, reveals on scroll, mobile panel | Every page |
| Pill | `.pill` + `.pill--ice / --cream / --blue` + `.pill--md` | Eyebrow chip, 4px radius | One per section, above the title |
| Layer boxes | `.stack__list` / `.stack__item` | The four-layer stack; `--pending` = dashed (unbuilt), `--muted` = 0.2 opacity | Hero and every layer divider |
| Callout | `.callout` (`.insight__aside`) | **Cream plate with navy ink** on a white section (navy was too loud there); navy plate, white ink on a cream section (`.forces`), where cream would vanish; ice tint, white ink on navy (`.on-dark`). Label + body pinned apart | **Every point raised inside a layer**, and pulled-out interview quotes |
| Insight card | `.insight` | Number plate, title, two eyebrow blocks, callout | Insight sections |
| Force card | `.force-card` | Slate plate, index + title over body | Driver grids |
| Action card | `.action-card` | Ice number plate, title, body | "In practice" |
| Figure | `.figure` + `--on-light / --on-dark` | Photograph (`.figure__img`, filling the plate's box, cropped about `--focus`) — or the dashed placeholder plate until one is supplied — caption 18/26, credit 12/18 ("Credits: The Private Markets Forum Team"). One layout in every report: a figure sits at the full `--content-max` width as a direct child of its section (`.figure--wide` for a single photograph outside a prose column); two photographs side by side are a `.figure-pair` — two equal columns, a `--gap-pair` gutter (32 → 56px; one column under 900px), each with its own caption. The benchmark is *Capital built the industry*'s pair under "Complexity isn't accumulating; it's compounding" | Between long prose runs |
| Logo tile grid | `.sponsors__grid` | 2-up → 4-up cream tiles | Sponsor walls |
| Table | `.table` | See §6 | Comparisons |
| Chart | `.chart` | See §6 | Quantities |
| Stat tile | `.stat` | One number, label, note | When the answer is a single figure |
| Action button | `.action-button` + `.action-button__bubble` | 32px icon (36px in the PDF bar), 4px radius, hover wash, label revealed in a box. Icons from `Reports/Assets/Icons` | Nav bar, PDF viewer bar |
| PDF sheet | `.pdf-page` | A fixed 1191 × 1685 A4 page, painted smaller by a transform | `pdf.css` only |
| PDF bar | `.pdf-bar` | Floating porcelain pill: logo, chapter picker, actions, Download | The PDF view |

The number plate differs by context and that difference is meaningful: **insight numbers** use
the radial gradient (`.insight__number`), **action numbers** use flat ice (`.action-card__number`).

---

## 6. Tables and charts

### Tables

```html
<div class="table-wrap">
  <table class="table">
    <caption>Adoption by layer</caption>
    <thead><tr><th scope="col">Layer</th><th scope="col" class="is-num">Firms live</th></tr></thead>
    <tbody><tr><th scope="row">I</th><td class="is-num">31%</td></tr></tbody>
    <tfoot><tr><td>All layers</td><td class="is-num">41%</td></tr></tfoot>
  </table>
</div>
```

- **Header row is `--c-navy`**, the darkest brand blue, with white 12/18 uppercase labels.
- The `<caption>` takes no plate of its own: it sits on the section and inks from `--chart-ink`
  — navy on white/cream, white inside `.on-dark`.
- Lighter brand tones do the rest of the work: **cream** zebra on even rows, **ice** total row,
  slate-15% hairlines. No new greys.
- `.is-num` right-aligns and sets tabular figures. Rows carry no per-row accent — every row is
  weighted the same, so the table reads as one block.
- On a navy section the body keeps its white plate and the header's white labels read directly on
  the section. Wrap the section in `.on-dark` so the caption and surrounding chart tokens flip.
- **Every cell reads from the top** — `vertical-align: top` on header, body, row-header and
  total cells alike, so a long cell never floats its neighbours to the middle.
- A table is exactly as wide as the copy around it (`.table-wrap.is-narrow`, §4) and fits that
  width at every viewport (§4, tablets and phones); `.table-wrap` keeps `overflow-x: auto` only
  as a safety net.

### Charts

Forms available: column (`.chart__plot` + `.chart__bar`), stacked column (`.chart__stack`),
ranked bar (`.chart__rows`), line (inline SVG + `.chart__line`), stat tiles (`.stat`).

Non-negotiables, enforced by the classes:

- **One y-axis, never two.** Two measures → two charts.
- Thin marks; 4px rounded data ends anchored to the baseline; 2px lines; ≥8px markers; **2px gap
  between stacked segments and adjacent fills**; 2px surface ring on overlapping dots.
- Grid and axis labels recede (`--chart-grid`, `--chart-ink-soft`); text never wears the series
  colour.
- **Legend for two or more series, plus direct end-of-line labels** so identity is never
  colour-alone. A single series gets no legend — the title names it.
- Every mark carries `data-tip="…"` and `tabindex="0"`; `brand.js` renders one shared tooltip for
  hover and keyboard focus.
- Sample or illustrative numbers say so in `.chart__note` or `.chart__source`.

On a navy section, wrap in `.on-dark` — series, ink and grid re-step to the validated dark set.

---

## 7. Behaviour

**Smooth scrolling** (`brand.js`). Mouse wheels only: a notched wheel (line or page units, or
the legacy ±120 a click) is eased; a trackpad, a precision touchpad, a free-spinning wheel, touch
and the keyboard pass straight to the browser's own scrolling, which runs off the main thread —
easing them again only added lag. One dial: `SMOOTH_INTENSITY = 30` (0 = near-native, 100 =
floaty), mapped to a frame-rate-independent lerp of `0.25 × (1−i)^1.5 + 0.02` ≈ 0.166 per frame
(95% of a click in ~270 ms; it was 50 → 0.108, ~440 ms, which read as lag). A trackpad gesture
during an eased run stands it down where it is. Disabled on coarse pointers and under
`prefers-reduced-motion`. Exposes `window.__smooth.to(y)` so anchors ease through the same loop.

**Nav** (`brand.js`). Fixed and parked at `translateY(-100%)`; slides in on
`cubic-bezier(.22,1,.36,1)` over 0.5s — **never linear**.

- Reveals when scrolling **down** past 1px.
- Retracts when scrolling **up** and within `NEAR_TOP = 140px`, so the motion overlaps the last
  of the scroll instead of waiting for zero.
- Scrolling up mid-page does not hide it.
- Links ease to `section.top − 48px` (`OFFSET`). Raise `OFFSET` to 104 if you want the bar fully
  cleared.
- Hover / focus turns links `--c-blue` over 0.2s.
- Mobile: hamburger masks the panel down via `grid-template-rows: 0fr → 1fr` (animates to natural
  height) and folds into a cross on the same curve — top bar +45°, bottom −45°, middle fades.
  Escape or picking a link masks it back up. `aria-expanded` and the button label track state.

**Nav tags follow content.** One link per section, labelled with the section's own noun
(Summary, Why now, Base, Semantic, Control, Presentation, In Practice) — not "Section 3".
Desktop and mobile share the same list, same order, same ids.

---

## 8. Page recipes

**Report page** (what `index.html` does):

```
hero (radial)         → sponsors (cream) → summary (white)
drivers (cream)       → layer I divider (edge-lit) → insights (white)
layer II divider      → insights → layer III divider → insights → layer IV divider → insights
in practice (radial)  → colophon (cream)
```

**The layer pair.** A divider always precedes its insights, and only the layer in focus is at
full opacity:

```html
<li class="stack__item stack__item--pending stack__item--muted">…</li>  <!-- I, dashed + muted -->
<li class="stack__item">…</li>                                          <!-- II, in focus -->
<li class="stack__item stack__item--muted">…</li>                       <!-- III -->
```

Insight numbering restarts at `01` inside each layer and matches the eyebrow count
("two insights" → 01, 02).

**Survey report** (what `brand/private-credit.html` does) — the same grammar with an evidence
plate after each pillar:

```
hero (radial)              → summary (white) → five findings (radial)
profile (white)            → the sample (cream)
pillar I divider (edge-lit) → insights (white) → evidence (cream)
pillar II divider           → insights → evidence …
```

**The evidence plate.** Every pillar ends on a cream `.forces` section holding the numbers behind
the insights: a `.stat-row` of three, the ranking table, one or two ranked bars, then any pulled-out
quotes in `.callout`. Keep the argument in the insight cards and the proof here — never repeat a
finding as both a card and a chart title.

**Quotes.** Interview material goes in a `.callout` with the speaker's role as part of the body,
not in a blockquote. The label names the theme ("The ODD burden"), so the quote earns its plate.

**Numbering.** Insight numbers restart at `01` inside each layer or pillar and match the eyebrow
count. Stat values, table figures and chart values all use tabular figures.

**Adding a data section.** Data belongs on white or cream by default (it is a general-idea
block). Put a chart on a navy plate only when the number *is* the insight, and then wrap it in
`.on-dark` and give it a callout underneath.

---

## 9. Ship checklist

- [ ] Every section has an `id`, and a nav link in reading order, desktop and mobile.
- [ ] Inline padding is `--pad-inline` everywhere — no bespoke insets.
- [ ] Plate matches intent: narrative → white/cream, insight → gradient **with boxes**.
- [ ] One standfirst per section; body 16/24; no type below 14px.
- [ ] Charts: ≤ 3 series, one axis, legend + direct labels, tooltips present, source line.
- [ ] Tables: navy header, cream zebra, ice total, `.is-num` on figures.
- [ ] Uppercase labels track from `--track-caps` — no widely spaced caps anywhere.
- [ ] Tables carry no per-row accent; the caption sits on the section, not on a plate.
- [ ] Palette re-validated if any series colour changed (`--pairs all`).
- [ ] Reduced-motion and keyboard paths still work (Tab through nav, Escape closes the panel).
- [ ] Rendered at 375 / 900 / 1440: no horizontal scroll, no console errors.

---

## 8. Motion

One curve for interface motion — `cubic-bezier(.4, 0, .2, 1)` (`--ease-ui`) — and one for
anything that reveals or unrolls — `cubic-bezier(.22, 1, .36, 1)` (`--ease-reveal`). Opening
a panel is allowed a little overshoot, `cubic-bezier(.22, 1.15, .36, 1)`; closing never is,
which is what makes a lid read as a lid. Every duration below is a ceiling, not a target.

| What | Duration | Curve | Notes |
|---|---|---|---|
| Icon hover wash + 1px lift | 120ms | `--ease-ui` | `--dur-ui` |
| Label box reveal | 140ms | `--ease-ui` | Fades in from 4px away, travelling away from its own chrome |
| Dropdown panel, opening | 250ms | overshoot | From `translateY(10px) scaleY(.8)`, origin bottom — it unrolls out of the pill |
| Dropdown panel, closing | 150ms | `--ease-ui` | Flat, and quicker than the open |
| Dropdown rows | 200ms | `--ease-ui` | From `translateX(-10px)`, staggered `--row-i × 40ms + 60ms` |
| Text wipe on hover | 200ms | `--ease-ui` | `.toc-wipe`: the label is a two-colour gradient clipped to its glyphs; hover slides the lit half across from the left. Text only — the row's ground is never washed |
| Nav bar reveal | 500ms | `--nav-ease` | Unchanged |

Rules: a hover label is always a box, never a native `title`. It carries the 10px Inter
size and sits 8px clear of its icon. Anything that moves has a
`@media (prefers-reduced-motion: reduce)` branch that holds the same end state with no
travel — the text roll drops its second line and recolours instead.

**Hover wash.** One token, `--c-btn-hover: rgba(13,29,204,.08)` — the brand blue at 8%, so
the wash picks up whatever plate it sits on rather than fighting it. Because it is
translucent it has to be laid *on* the control's own fill, not swapped for it:
`background: linear-gradient(var(--c-btn-hover), var(--c-btn-hover)) var(--c-white)`.
On a dark plate it inverts to `rgba(255,255,255,.12)`.

---

## 9. PDF view

A second reading of the same report: the document as the sheets it prints to, at
`Reports/<report>-pdf.html`, reached from the nav's file icon and returning through the
bar's screen icon. Both reports have one (`report-2026-pdf.html`, 22 sheets;
`infrastructure-at-the-edge-of-scale-pdf.html`, 42 sheets), and each bar's Download serves
the rendered file at `Reports/Assets/<report>.pdf` — A4, one page per sheet, vector text. `pdf.css` and `pdf.js` load *after* `brand.css` and `brand.js`, never
instead of them.

A sheet is A4 portrait at 144dpi — **1191 × 1685** — with 84px side margins, 96px top,
56px foot, a 1023px content width and an 843px text column. It measures full size at every
window width and is painted smaller with `transform: scale()`, never `zoom`: a transform
leaves layout alone, so the line breaks a reader sees are the line breaks that print.
Negative margins take back the space the untransformed box still occupies. The scale is the
artboards' own `0.7456` down to a 1000px window, and follows the window below that. On screen
each sheet is `content-visibility: auto`: only the sheets near the window are styled, laid out,
painted and their photos decoded (a sheet's size is fixed, so nothing jumps and the scrollbar is
true) — the view's load work halves; print renders every sheet as before.

A sheet has its own scale, set in `pdf.css` as `.pg-*` classes and taken value for value
from the artboards — where the artboard differs from the site, the artboard wins, because
this is the document as it prints. Body copy is **20/30, −.02em** (the site's is 16/24);
section titles **44/1.2, −.03em**; the layer sheets' titles **48/1.2**; labels and
card titles keep the site's 24/32; a photograph's caption is 18/26 and its credit 12/18, as on the site. Eyebrow pills track at **.2em** on paper. A sheet has five
distances, set as tokens at the top of `pdf.css`: a heading, subhead or eyebrow to its copy
`--s-copy` **32** (`.pg-heading`, `.pg-group`, `.pg-sub`; a pill to its copy in a block
`--s-pill` 28), paragraph to paragraph `--s-para` **32**, part to part inside a card `--s-part`
**40** (`.pg-card`; a quote to its attribution `--s-quote` 36; a callout's label to its body at
least `--s-copy`), element to element `--s-el` **44**, and `--s-cards` **56** between cards on
a sheet of cards (`.pg-body--cards`). The chip sits `--s-chip` 32px from its title. A document
that wants more air sets **`.sheets--airy`** on its `<body>`, which lifts every distance by 8
(40 · 36 · 40 · 48 · 44 · 40 · 52 · 64) — `report-2026-pdf.html` does; the survey keeps the
base rhythm — and its paginator carries the same numbers. The stack sheet's standfirst — a
sentence or two set as the `.pg-h2` — steps to 40px past ~120 characters (`.pg-h2--long`)
so the pillars still clear the footer. Every sheet but the cover closes with a
footer: a `#D5D5D5` rule, 24px, then the 179px mark against the three pills and a Zodiak
folio — numbered from the sheet after the cover.

Icons and artwork live in `Reports/Assets/` (`Icons/action-button-*.svg`, drawn on the
32px button box with their inset baked in, stroke set to `currentColor` when inlined;
`Images/` for cover and figure plates). The PDF covers carry a photograph from the London summit, cropped to the cover's box and saved at 2× (`cover-<report slug>.jpg`, 2046 px wide, progressive JPEG q84, colour profile kept; ≈ 290 dpi at print size): *Capital built the industry* the Great Room at RSA House with the summit's title on the screen (PMTS_2026_00098), *Infrastructure at the edge of scale* RSA House's columned façade from the street (PMTS_2026_00002); the source photographs are the event set in `London 2026_Event Photos`. A photograph goes in as three widths — 800, 1600 and
2432 px, progressive JPEG q80, EXIF and colour profile kept — with `srcset` on the web; the PDF
view's `.pg-figure__img` takes the 1600 (≈ 220 dpi at print size). The originals stay in the
repo's root `Assets/Images/`.

Rows in the chapter picker whose sheet does not exist yet are inert rather than absent:
`pdf.js` no-ops on a missing id, so they begin working the moment those sheets land.

**Paginating.** Each layer is one dark divider sheet (`.pdf-page--edge`: title, subtitle,
the four boxes with the live one at full opacity) followed by its insight cards on light
sheets; "In practice" runs on light sheets; the closing "With thanks" sits on the cover's
plate with the mark and the copy ranged left at the foot, no footer. Every element flows on
its own — header, block, callout, paragraph, card, figure — and neighbours of one group only
share a wrapper when they land on the same sheet (paragraphs of a run in one `.pg-text`, a
heading and its copy in a `.pg-group`, the parts of a card in a `.pg-card`; otherwise the
sheet's element gap). Five rules: a heading never ends a sheet; an aside or a quote keeps the
copy it comments on (the block before it comes across with it); a sheet never carries a single
element when its neighbour can spare one; a closing sheet that is mostly empty because a group
broke across the edge takes the whole group when it fits; nothing is placed within **120px** of
the footer rule. Elements are measured with the real faces at the real 843px column, after the
copy has been fitted (`.build/measure.js` runs `copyfit.js` on them), so a paragraph the fitter
tightens is paginated at its tightened height. `.build/build-all.sh` runs the whole chain —
web copy, both views, both PDFs.

**Data on a sheet.** Tables (`.pg-table`), stat tiles (`.pg-stats`), interview quotes
(`.pg-quote`, on the callout's cream plate with navy ink, as the "What to consider" `.pg-aside`) and source lines (`.pg-source`) are the site's §6 components at the sheet's
scale: cells 16/24 where the site has 14/20, 12px caps tracked .2em like the sheet's pills,
chart captions and quote text at 24/32, the same fills and rules otherwise. A photograph on a sheet (`.pg-figure`, or two in a `.pg-figure-pair` — equal columns, 48px gutter) keeps the site's one layout: full sheet width, caption 18/26, credit 12/18, the pair's captions each under their own image; a photo-only sheet flows from the top like any content sheet. A source line travels
with its table (12px below it); a paragraph that ends on a colon travels with what it
introduces. Five-pillar stacks shorten their boxes to 160px so the set still fits a sheet.

**Copy on a sheet** never hyphenates and never leaves a widow or a stub: `hyphens:none` on
the sheet, headings `text-wrap:pretty`, body copy greedy; the last two words of every run
glued with a no-break space and hyphenated compounds (end-to-end, decision-making) held on
one line with `.nb` at build time; then the §3 fitter, run at build time and baked into the
sheet as inline styles (`data-fit`), so no paragraph ends on a line under 30% of the column.
Every run of copy otherwise takes the full width of the block it sits in — one text column
per block — and a table is exactly that width too.

---

## 10. Homepage — the listening room

`index.html` is a single-viewport, top-down 3D scene: a turntable and a fan of record
jackets on a polished walnut console, on a dark carpet — one jacket on the console at a time,
one jacket per report. Browse left
and right, pick a jacket, watch the record leave its sleeve and land on the platter, the
tonearm cue onto the lead-in groove, then press Play — the record spins for three seconds and
the page hands over to the report. The old card grid stays in the page as the fallback
(no WebGL2, context lost, scripts off) and every link — both reports, both PDFs — is reachable
by keyboard and screen reader. The full spec is `HOMEPAGE-VINYL-BRIEF.md` at the root; this
section is the short form.

**Files.** `Home/home.js` (the shell — boot, view switcher, shared overlay, input dispatch; the Table view's own state machine and choreography live in `Home/views/table/tableView.js`, see §10.1), `Home/home.css`,
`Home/data/records.js` (the one array that drives jackets, labels, overlay and fallback),
`Home/data/logo.js` (the lockup's 23 paths for Canvas 2D), `Home/data/textures.js` (the two
surface tiles as data URIs, built from `Home/textures/*.webp`), `Home/scene/*` (stage,
environment, turntable, record, jackets, covers, shadows, layout constants), `Home/motion/*`
(bézier solver, shared-clock tweens, critically damped springs), `Home/audio/*` (Web Audio
cues; procedural placeholders until recordings are listed in `manifest.json`),
`Home/vendor/three/` (three.js r170, module build + `RoundedBoxGeometry`). The sources are ES
modules; **`Home/home.bundle.js`** is the one classic script `index.html` loads — esbuild folds
the sources and three.js into it (`node tools/bundle.mjs`, sandbox) — so the page runs on
Netlify and straight from `file://` alike (module scripts and image-sourced WebGL textures
are blocked from disk, which is why the tiles are embedded). Edit the sources, rebuild the
bundle. An inline watchdog in `index.html` shows the card grid if the 3D view has not booted
within 15 s.

**Units and layout.** 1 world unit = 1 mm, y up, x screen-right, z screen-down, origin at the
spindle on the console top. Camera 20° FOV straight down, distance computed to fit the framing
box (the console) with a 5% margin; landscape console 1150 × 600 with the turntable at the
origin and the jacket centred at (580, 0); portrait console 680 × 1130 with the jacket centred
at (0, 405), its open edge facing up toward the turntable. Turntable: plinth 520 × 400 (top at y 60), well r 171, platter r 165 (top y 76)
with the strobe band r 154–165 (four rows of 180 / 183 / 216 / 217 polished dots, drawn into a
polar strip and mip-mapped on an opaque ring — an alpha-tested cut-out shimmered as the platter
turned), mat r 148,
record r 150 × 1.8 (top y 80), label r 50, tonearm pivot (200, −186) with an effective length
of 245 — the cue angle is solved at start-up so the stylus lands at r 146 (≈ 10.8°) — and
three 28 × 18 keys at bottom-left. These fits are asserted at start-up (`?debug=1` shows them).

**Materials.** Carpet: dark navy wool, roughness 1, tiled 1K albedo + normal. Console: walnut
albedo + roughness map under `clearcoat 1 / clearcoatRoughness .08`. Turntable: satin anodised
grey `#8A8D93` (metalness .6, roughness .45, brushed anisotropy on the plinth top) with
polished bevels (roughness .12); the cartridge is `--c-blue`. Record: `#050507`, roughness .30
in the grooved bands and .12 in the smooth ones (lead-in r 146–150, gaps at r 132 / 116 / 98,
run-out r 52–60), grooves procedural in the fragment shader and faded with `fwidth()` so they
never moiré, radial anisotropic sheen from an anisotropy map. **Label and covers carry two
things only — the lockup and the report title.** Label: navy with a radial lift to blue; the
white lockup 52 mm wide above the spindle hole, the title in Zodiak centred below it (≤ 3 lines
in 62 mm, leading 1.18). Jackets: 314 × 314 × 3.5, a matte print (roughness .68, specular .3) sealed in **tight
shrink-wrap** (`scene/film.js`, `GLOSS-FILM-BRIEF.md`): the clearcoat wears a 1024² wrinkle normal
map — fans of fine ridges at the corners, short ripples along the edges, two faint stress
creases, a little shrink undulation, all damped to 30 % over the lockup — and a 512² haze
roughness map (.04–.14, rougher along the folds), both drawn at boot. The film reflects a
world of its own, evaluated analytically in the clearcoat's reflection direction (a dim wall
gradient, a softbox with a framed edge, a window; no texture — a baked cube map's texels are
25 px wide under the Rack's close-up camera), while the print under it reflects only the plain
dark studio, so every reflection on a cover is the film's and the print's colours do not
change. The film wraps the edges and the spine too (card under clearcoat .9 / .14). The
cover art is also a .32 emissive map so the brand colours hold in the dark room; covers drawn at runtime with Canvas 2D from `records.js` on the §1 plates (radial
navy, edge-lit turned 90°, cream, ice, slate): 34 mm margins all round, lockup 100 mm wide,
title in Zodiak, −.02em, leading 1.14, within 86% of the inner
width, ≤ 3 lines. **One layout and one title size on every jacket:** lockup flush left on the
top margin, title flush left with its last baseline on the bottom margin, at the largest size
(≤ 25 mm) at which the longest title still fits three lines. "Coming Soon" jackets nudge when
clicked.
The environment map is a generated dark studio (one long warm strip top-left, a dim cool
strip bottom-right) — `RoomEnvironment` turns every horizontal polish into a white wash from
above and was rejected; the covers alone get a second map with a panel overhead to the right
whose edge runs on a diagonal ~8° → 11° off vertical. From the top-down camera the jacket
reflects directions 3.5°–11.5° toward +x, so the sheen takes the cover's right side and slides as
it moves — and never sits over the lockup (top-left) or the title.
Tone mapping is Khronos PBR Neutral at exposure 1.4 — AgX greyed the brand navy and blue.

**Light and shadow.** One warm key `DirectionalLight` from screen top-left
(`normalize(−0.45, 1, −0.55)`, shadows fall bottom-right), VSM shadow map 2048² (1024² on
coarse pointers), `shadow.intensity .65`, updated only on frames where a caster moved; a cool
hemisphere fill. Contact shadows are pre-blurred sprites under the console, every jacket and
the record — offset along the light, spread and faded with the object's height — which is
what makes a lift read from above.

**Motion.** The §8 curves plus three: `--ease-mech cubic-bezier(.65, 0, .35, 1)` for
mechanical travel (sleeve slide, record transfer, tonearm swing), `--ease-exit
cubic-bezier(.4, 0, .7, .2)` for things leaving the frame, and `--ease-fall cubic-bezier(.55,
0, 1, .45)` for gravity — a slow start accelerating into the landing (the Shelves' drop).
`tween()` throws without a curve.
The jacket has no hover state — no lift, no tilt, nothing follows the pointer. The
only constant-rate motion is the steady 33⅓ rpm — its spin-up eases the angular velocity.
The frame loop runs only while something moves; an idle page requests no frames.

| Step | ms | What | Curve | Sound |
|---|---|---|---|---|
| S1 | 0–120 | Jacket pressed 2 mm | `--ease-ui` | jacket-pick |
| S3 | 120–520 | Jacket lifts to y 90 | `--ease-reveal` | — |
| S4 | 450–1250 | Record slides 317 mm out of the sleeve, to −x (portrait: up) | `--ease-mech` | sleeve-out |
| S5 | 1150–1850 | Jacket departs by the top (portrait: by the right) | `--ease-exit` | — |
| S6 | 1250–2150 | Record arcs to the spindle (bowed away from the tonearm), rises to 120, lowers | `--ease-mech` / reveal / ui | — |
| S7 | 2150–2330 | 1.5 mm settle onto the mat | `--ease-reveal` | record-set |
| S8 | 2300–2540 | Cue lever up, arm 92 → 104 | `--ease-ui` | tonearm-lift |
| S9 | 2540–3340 | Arm swings 0° → cue angle | `--ease-mech` | tonearm-swing |
| S10 | 3340–3700 | Arm lowers, stylus on the lead-in | `--ease-reveal` | needle-drop |
| S11 | 3650–3930 | "Play vinyl to go to report" fades in; LED pulses | `--ease-reveal` | — |
| P1 | 0–90 / 90–270 | Play key down / up | `--ease-ui` / `--ease-open` | play-press |
| P3 | 100–1000 | Spin-up to 33⅓ rpm | `--ease-ui` on ω | spin loop |
| P4 | 1000–2900 | Steady; arm drifts +0.6° | `--ease-ui` | spin |
| P5–6 | 2300–2950 | Navy overlay, audio fade, `location.assign` | `--ease-ui` | — |

Eject (Esc, "Choose another report") plays the steps back at ×0.75 with mirrored curves from
wherever the objects are, so it also works mid-cue. Browse (‹ ›, ←/→, swipe) is silent and
one continuous glide: a single eased progress (680 ms, `--ease-glide cubic-bezier(.4, 0, .1,
1)`) carries the outgoing jacket 44 mm in the direction of travel as it dissolves, then the
incoming one on through the last 44 mm as it resolves — speed is continuous across the
hand-over and two jackets are never on the console together. The title row slides out and back
in step. The arrows dim only at the ends. Reduced motion: the same
states reached by a 200 ms crossfade, no spin, hand-over 400 ms after Play.

**Sound.** One `AudioContext` unlocked on the first gesture, master at 0.6, mute toggle
remembered in `localStorage` (`pmf-home-sound`). The browse arrows make no sound. Cues and
levels: jacket-pick −14 dB, sleeve-out −10 (envelope follows the slide's velocity),
record-set −12, tonearm-lift −14, tonearm-swing −18, needle-drop −12, play-press −10,
spin loop −16 (`playbackRate` 0.7 → 1 over the spin-up). Recordings drop into `Home/audio/`
by name and are listed in `manifest.json`; anything unlisted plays the synth placeholder.

**Overlay.** The canvas is decoration plus pointer target; the controls are DOM, anchored to
projected 3D points and set instantly (never transitioned) on resize and state change. The page
shows directly — no logo, no intro, no "not indexed" note (the `noindex` meta and header stay);
the overlay is hidden until the first frame. Controls: the sound toggle top-right
(brand action button + label box), a transparent hit button over the active cover, ‹ › keys
styled like the turntable's, the active report's pill · meta · title · index · PDF link under
the jacket, the prompt under the plinth, a hit target over the Play key, a polite live region.
Nothing overlaps: `?debug=1` asserts that no overlay element sits on another, on the turntable
or on the jacket, and that each stays on screen. `#<record id>` preselects a jacket; the active
index survives in `sessionStorage`; coming back from a report (bfcache) resets to BROWSE.

**Budgets and lag.** ≤ 80 draw calls (46 in BROWSE, 44 in READY), ≤ 150k triangles (~13k),
one script of 1.27 MB on disk (three.js, the page code and the embedded tiles). Render on
demand. **Resolution** (`scene/stage.js`, `PR`): ≤ 1.5 device pixels per CSS pixel and never
more than a 2560 × 1440 frame's pixels in all (a big window on a 4K screen at 150% no longer
draws 2.25× the pixels for nothing), never below 1×; **dynamic resolution** drops a quarter step
after ten net frames past 22 ms while something moves (a smooth frame takes back half a slow
one), the level a device settles at is remembered for 30 days (`localStorage` `pmf-home-pr`, per
device pixel ratio) so the next visit starts there, and a session that runs smoothly for ~300
frames tries one quarter step back up. VSM shadow map 1024² with an 8-sample
blur, updated only when a caster moves — jackets cast no map shadow (contact sprites ground
them), so browsing never touches it, and the spin never does (round objects). **No first-use
stalls:** every shader is compiled and every texture uploaded when a view is built, and then
the view is drawn once with everything shown and nothing culled (into the canvas and painted
over in the same task, so never seen) — drivers finish a pipeline on its first draw, which used
to land on the first select, the first focus, the first switch. three.js's per-program log
check (a synchronous GPU round trip on first use) runs under `?debug=1` only. **Views are
prebuilt:** after boot, the two views not on screen are built one at a time while the page is
idle (no transition running, no input for 800 ms), so a switch is only the navy fade; a build
that has not happened yet still runs on demand behind it. `_headers` makes `/Home/vendor` and
`/Home/audio` immutable.

### 10.1 The Rack view

The second way in, switchable top-right (**Table · Rack**, beside the sound toggle; Table is
the default, the last choice is remembered in `localStorage` `pmf-home-view`, `?view=rack`
overrides). The jackets stand face-out on one long walnut ledge in front of a dark limewash
wall; the camera holds a close shot of one at a time. Arrows at each side of the screen, ←/→,
a scroll gesture or a swipe glide the camera to the next jacket. Clicking a jacket opens it
like a book and asks **Go to report** / **Back to the collection**; Go sends the record down to
a turntable on a walnut console below the rack while the camera travels with it, then the
Table view's cue → "Play vinyl to go to report" → spin → hand-over runs unchanged. The full
spec is `RACK-VIEW-BRIEF.md`; this is the short form.

**Files.** `home.js` is now the shell (boot, the switcher, shared overlay, input dispatch);
`views/table/tableView.js` is the Table view moved out unchanged; `views/rack/` holds
`rackView.js` (state machine + choreography), `room.js` (wall, floor, ledge, console, picture
light), `gatefold.js` (the hinged jacket), `cameraRig.js` (framing, travel, float, parallax),
`layout.js` (every number); `views/shared/cue.js` carries S8–S11, P1–P6 and the un-cue for both
views; `core/assets.js` builds what both views share once — the tiles, three env maps, every
cover and label texture. Both views have their own `THREE.Scene`; the `Stage` renders the
active one (`setView(scene, camera, customFit)`).

**Room (mm; y up from the floor, wall at z 0 facing +z).** Jacket *i* at x = i · 700; ledge top
at y 1400, 70 deep, 32 thick, 20 lip; the jacket leans 9.29° back — solved so its top back
edge stands 0.5 mm off the wall and its bottom front edge 1 mm behind the lip (centre ≈ (i·700,
1555.2, 27.1)); console 1400 × 450, top at y 640, centred under the row with the
Table's `Turntable` on it (platter at (1400, 718, 225)). Wall: generated limewash plaster
(`tools/textures.py`, albedo + normal, embedded with the other tiles), roughness .92. Ledge and
console: the Table's walnut. One warm `SpotLight` (22°, penumbra .8, decay 2) is the only map
shadow (VSM 1024², 512² coarse). It keeps one offset from whatever it lights — focus + (−300,
+845, +874) mm — so the light level is the same on every jacket, on the record in flight and on the
platter. On a record in flight it holds 46° to the disc's axis and swings round the disc's left side
as it turns, so the disc never passes through the light's mirror angle. Dim hemisphere + ambient
fill; unfocused jackets fall off through the spot alone.

**Jackets.** Two 2.6 mm boards on a 6 mm spine at the left; the front board carries the
shared cover texture outside and the plate colour + lockup inside; the back board holds the
record on its inner face behind a flap over the lower 35% with a thumb cut. The record is
parented to the jacket while it is in the pocket (faces at z 1.4–3.2: behind the flap ≥ 3.3 and
the front board ≥ 4.0, in front of the back board ≤ 1.3), hidden until the front board has swung
past −8°. The Rack's record reflects an even, dim room (`envEven`), so it reads the same standing,
turning and lying flat. Same cover as the Table — the print under the shrink-wrap — with the film's
eye-level world: the softbox behind the camera, 7° right of the cover's reflection cone and 18°
up, leaning 15°, so its band runs up the cover's right side and the lockup reads against the dark
room at full contrast; the Shelves' world puts the same softbox at 6° up for its upright raised
jacket. The inner faces are drawn at 1024²
(the lockup stays crisp in the open spread), for available reports only.
Opening swings the front board −170° about the spine toward the camera and the left. The jacket
first lifts +30 (clear of the lip), then comes +80 forward, shifts +157 right and stands upright,
so the open spread is centred on its own spot and ≥ 229 mm from either neighbour. Nothing ever
passes through anything: `tools/rack-clear.mjs` tests every frame.

**Camera.** 32° fov. Close-up distance per aspect *a* (t = tan 16°): `d = max(min(314 /
(.60·2t), (700 − 157 − 40) / (t·a)), 314 / (.78·2t))`, portrait additionally `≥ 314 / (f·2t·a)`
with f leaving 82 px gutters; the look-at sits 8% of the frame height below the jacket's
centre so the title row has room; neighbours stay off-screen up to aspect 2.4. Open spread:
≤ 70% of the width, ≤ 52% of the height, 9% raised. Turntable: elevation 52°, plinth at 64% of
the width (78% portrait), the plinth's centre on the vertical centre line, and the turntable + 16
px + the prompt centred top-to-bottom as one block (stepping back if the block would pass 84% of
the height). **Browse:** one 1150 ms move on
`--ease-glide`, camera and target trucked together with a 5% dolly bump (sin πu) and a 2% lead
on the target; the light follows on the same curve; silent; one queued step; scroll
accumulates ±60 px then locks until 180 ms of silence (one jacket per trackpad burst).
**Float** (BROWSE, CONFIRM, READY): after 1.2 s without input, two incommensurate sines per
channel (periods 7.6 / 11.9 s; ±13/8/10 mm, ±.5/.38/.18° yaw/pitch/roll; sideways ×.45 in
portrait), weight on a critically damped spring easing in on ω 1.5 and out on ω 5; any input
drops it; after 120 s the loop stops (0 rAF); off under reduced motion. About ±13 / ±9.5 px of
sway at 1440 × 900, rendered at 30 fps while it is the only thing moving. **Parallax:** ±24/14
mm toward the pointer on a spring (ω 2.6), hover devices only.

| Step | ms | What | Curve | Sound |
|---|---|---|---|---|
| O1 | 0–110 | Taken hold of: the top tips 4 mm off the wall (pivot: bottom edge) | `--ease-ui` | — (the opening is silent) |
| O2a | 110–400 | Lifts +30, clear of the lip | `--ease-reveal` | — |
| O2b | 340–820 | +80 forward, +157 right, lean → 0 | `--ease-reveal` | — |
| O3 | 250–950 | Camera eases back to the spread framing | `--ease-glide` | — |
| O4 | 700–1600 | Front board hinges 0 → −170°; the record shows past −8° | `--ease-mech` | — |
| O5 | 1350–1750 | Record rises 6 mm in its pocket (up only) | `--ease-reveal` | — |
| O6 | 1550 → | Confirm panel in; focus on **Go to report** | `--ease-reveal` | — |
| Back | 0–1320 | Record settles; board closes (80–760); back over the lip with the lift held (700–1060); sets down (1060–1320); light eases home | ui / mech / ui / reveal | gatefold-close |
| T2 | 0–680 | Record straight up +125 (0–420), then +70 toward the camera (320–680); the light eases onto it | `--ease-mech` | sleeve-out |
| T3 | 640–2400 | Camera travels to the turntable along a Bézier bulging 250 mm forward, look-at on the record's curve | `--ease-mech` | — |
| T4 | 700–2300 | Record arcs (control 60 up, 150 out of the midpoint) to 120 mm over the spindle, upright → flat, the light with it | `--ease-mech` / ui | — |
| T5 | 2300–2660 | Settles, then the 1.5 mm drop | ui / `--ease-reveal` | record-set |
| T6 | 1900–3000 | Off-screen, once the record is well below: board closes, back over the lip, sets down | mech / ui / reveal | — |
| — | 2660 → | `views/shared/cue.js`: S8–S11, then P1–P6 on Play | | |
| Eject | | Un-cue (×0.75) → jacket lifts, comes forward and opens fully while the camera and the record rise together; record in, then down → Back | | |

**Overlay.** Edge keys (48 px, 24 px in; 10 px on phones) centred on the jacket; the title row
28 px under it (hidden outside BROWSE); the confirm panel 24 px under the open spread (`role=
dialog`, Esc = Back, Enter = Go; a click outside it also backs out); the READY prompt 16 px under
the turntable, centred on the plinth. **Text never moves:** the title row, edge keys, confirm panel
and prompt hold their laid-out place through the float, and the title changes by a crossfade in
place; only the two invisible click targets (jacket, play key) follow the float. The gaps are
sized so the float never brings the scene onto the text (jacket → title ≥ 18 px); the switcher (`role=radiogroup`, ←/→ between options) disabled with
the label box "Return to the collection first" outside BROWSE. `?debug=1` asserts no overlay
element overlaps another, the jacket or runs off-screen, that the neighbours are off-screen, and in
READY that the plinth, the prompt and the turntable + prompt block are centred.

**Budgets.** 20 draw calls in the close-up, 38 open, 48 at the turntable; ~13.5k triangles;
the bundle grew 178 KB to 1.23 MB (621 KB gz) — mostly the wall normal map. Render on demand
with the float as the one exception (30 fps while it is the only motion, stopped after 120 s);
the picture light's shadow map is 512² (256² coarse) and updates only when the light or a caster
moves — never for the float, the parallax or the spin. No `backdrop-filter` over the canvas
(the switcher, edge keys and prompt use slightly more opaque fills): a blur over a scene that
changes every frame is re-computed every frame.

### 10.2 The Shelves view

The third way in (**Table · Rack · Shelves**): the Rack's wall with **three walnut ledges of
five jackets each — all fifteen in view on entry** — explored freely by zooming and dragging.
A click raises a jacket, closed, and shows its title under it; **Back** drops it onto the
shelf and it tips back against the wall; **Go to report** fades the page to the report. No
turntable, no record, no sound. The full spec is `SHELVES-VIEW-BRIEF.md`; this is the short
form.

**Files.** `views/shelves/shelvesView.js` (state machine, rise / drop / go, overlay,
invariants), `layout.js` (every number), `slots.js` (RECORDS → fifteen slots), `shelfJacket.js`
(a closed jacket: one box, two draw calls, the tip math), `explorer.js` (the free camera),
`input.js` (pointer, wheel, pinch, click). `views/shared/wall.js` + `wallLayout.js` now build
the wall, floor, ledge and fill for both the Rack and the Shelves — the Rack's frames are
pixel-identical before and after the move (`tools/rack-frames.mjs`).

**Room (mm; y up from the floor, wall at z 0 facing +z, middle column at x 0).** Columns at
x = (c − 2) · 420; ledge tops at **y 940, 1400, 1860** (the Rack's section: 70 deep, 32 thick,
20 lip), each x −1297 → +1297; wall x ±2500, y 0 → 3200. Every jacket rests in the Rack's
pose on its own ledge: lean 9.29°, top-back edge 0.5 mm off the wall, bottom-front edge 1 mm
behind the lip. Slots fill from data — the middle shelf takes `records.js` in order (the two
reports, three Coming Soon), the top and bottom shelves ten more Coming Soon placeholders on the
three Coming Soon plates (`SLOT_ORDER`). The content box the camera is bounded to is x ±1077,
y 868 → 2231 on the cover plane z 31.

**Lights.** No wash spots: a point light's mirror image in a glossy cover is a hot blob
wherever the camera is, and the camera is free. Hemisphere .75 + ambient .45 + one warm
directional from high in front (its mirror image points 40° below level, where the
wall-facing camera never is) + the env map; the covers are .32 self-lit. The one spot is the
Rack's picture light on the raised jacket only (0 at rest). Nothing casts: **no shadow map**.
Grounding is sprites — one instanced mesh of fifteen ledge contact sprites, one of fifteen
wall shadows (24 mm down, 18 right, opacity .35), and a live pair that follows the raised
jacket (the wall shadow drifts, grows and fades with the lift).

**Jackets.** A 314 × 314 × 7.9 box in the gatefold's frame (back face z −1.3, front +6.6), the
shared cover under the shared shrink-wrap outside, wrapped card edges and back; faces regrouped so each
jacket is two draw calls; one cover material per cover texture, a second full-brightness copy
for the raised jacket. Leaning pivots on the **bottom-back edge** resting on the ledge, so a
jacket tipping upright swings its top 51 mm off the wall and never pushes into the wall or the
ledge (`tools/shelves-clear.mjs`: oriented-box test every frame of rise and drop on five slots —
no overlaps, closest 0.1 mm; the end pose equals the rest pose).

**Camera (`explorer.js`).** Always faces the wall: state = one point (x, y) on the cover plane
under the **safe rect's** centre (the viewport minus 72 px top, 88 bottom, 24 sides — 16 on
phones) and a distance d; fov 32°. `d_fit = max(boxH / (2t·sH), boxW / (2t·a·sW))` (≈ 2891
at 1440 × 900, a jacket 168 px tall; ≈ 8855 at 390 × 844, 51 px); `d_min = 314 / (.72 · 2t)` ≈
760. Bounds: the visible rect stays inside the box padded 6%; an axis the view is wider than
locks to the centre. **Drag** pans 1:1 under the pointer; release flings with the velocity of
the last 100 ms (cap 2.5 px/ms, τ 250 ms, no fling if the pointer had stopped 80 ms before
letting go); past a bound the drag rubber-bands at 35%, at most 48 px, and springs back (ω 12).
**Wheel** zooms toward the cursor, `exp(−Δy · .0016)` per event (ctrl/⌘ + wheel = pinch,
`.012`), through a critically damped spring (ω 14); the world point under the cursor is held —
and kept across a run of notches, so zooming from the overview (where x is locked at first)
still lands on the point the first notch started from. **Pinch** zooms about the midpoint and
pans with it; two fingers → one carries on as a pan. Double-click on the wall ×2 (600 ms,
`--ease-glide`), at d_min fits all; keys −/+/Fit ×1.6 (450 ms) / 700 ms; `+` `−` `0`, Shift +
arrows pan 15%. In EXPLORE there is no float; the loop stops at rest (0 rAF). In FOCUS the
Rack's float runs at 60%, on the camera only.

**Rise (silent).** F1 0–260 tips upright about the bottom edge; F2 200–480 lifts +30, clear of
the lip; F3 420–1000 comes +160 toward the camera and up to lift 70; F4 150–1100 the camera
glides to the focus framing (jacket at 50% of the height, ≤ 78% of the width, look-at 10% below
its centre, stepping back until the block fits above the bottom band); F5 250–900 the room
dims to 40% (lights, the shared covers' self-light and reflections — the raised jacket keeps
its own) and the focus light comes up; F6 850–1130 the block fades in under the jacket
(`--ease-reveal`) and the report is prefetched. Coming Soon jackets rise too, with only Back.

**Drop (silent).** D1 0–200 block out; D2 0–900 camera back to the visitor's own pose; D3
100–600 room back up; D4 0–520 back over its spot, upright, lift held at 30; D5 520–720 **drops**
the last 30 mm (`--ease-fall`); D6 720–980 **tips back** against the wall (`--ease-fall`); D7
980–1180 settles 9.29° → 8.5° → 9.29°. The end pose is the rest pose exactly. A click on
another jacket in FOCUS runs the drop first, then the rise.

**Go.** The buttons disable, the block fades; the camera eases 8% closer (600 ms); the page
fades to navy from 80 ms; `navigate` at 600 ms. Back/forward-cache returns reset to the overview.

**Overlay.** Zoom keys bottom-right (40 px, edge-key style, each disabled at its limit; hidden
outside EXPLORE); the hint bottom-centre ("Drag to explore · Scroll to zoom · Select a jacket";
pinch/tap on touch), gone on the first pan or zoom; the focus block (`role=dialog`: eyebrow +
meta, title Zodiak 28/34 ≤ 3 lines, **Go to report**, **Back to the shelves**; Enter / Esc)
centred 24 px under the raised jacket's projected bottom edge, laid out once from the base pose —
**text never moves**; a `--c-ice` focus ring drawn around the projected jacket for the keyboard;
a visually hidden grid of fifteen buttons (roving tabindex, arrows walk it, the camera glides
to bring a jacket < 60% on screen fully in). Live region: "Shelves. 15 jackets on 3 shelves."
/ "<title>. Go to the report?" / "Back on the shelves." The switcher reads "Return to the shelves
first" outside EXPLORE. `?debug=1` asserts no overlay overlap, all fifteen jackets inside the
safe rect at the overview, the block ≥ 24 px under and centred on the jacket, the floating jacket
clear of it, no page scroll, ≤ 48 draw calls.

**Budgets.** 40 draw calls at the overview (wall, floor, 3 ledges, 3 lips, 30 for the
jackets, 2 instanced sprite meshes), 29 in FOCUS; ~2k triangles; no shadow map; no new
textures beyond a 128² wall-shadow sprite; the bundle +42 KB. 0 rAF at rest in EXPLORE; the
FOCUS float at 30 fps when it is the only motion. Reduced motion: no inertia, instant zoom /
pan / fit, a 200 ms crossfade for rise and drop, no float.
