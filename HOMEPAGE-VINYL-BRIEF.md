# Homepage revamp — "Listening Room" report selector

Implementation brief for a coding agent. Read it fully before writing code. Where this brief gives a number, use it; where it says "tune", the number is a starting point and the stated invariant is what must hold.

---

## 0. Goal

Replace the current card-grid `index.html` with a single-viewport, top-down 3D scene: a vinyl turntable and one record jacket at a time on a polished wood console, on a dark carpet. Each jacket is one report. The visitor browses jackets left/right, picks one, watches the record leave its sleeve and land on the platter, the tonearm cue onto the record, then presses Play — the record spins for a few seconds and the page hands over to the report.

The page is still a report index. Everything the current index offers (two report links, two PDF links, the `noindex` note) must remain reachable, by keyboard and screen reader, and without WebGL.

---

## 1. Repository context (do not break)

- Static site, no build step, deployed on Netlify. `_headers` sets `X-Robots-Tag: noindex, nofollow`; keep `<meta name="robots" content="noindex">`.
- Brand system: `Brand Foundations/BRAND-FOUNDATION.md`, `brand.css`, `fonts.css` (Zodiak + Inter, self-hosted). Link `fonts.css`; do not fork `brand.css`. The homepage may keep its own small token block as today.
- Brand colours (exact): `--c-navy #090C2A`, `--c-blue #0D1DCC`, `--c-ice #C8DFF3`, `--c-cream #F6F4F2`, `--c-slate #464850`, `--c-white #FFFFFF`. Blue is never text on navy.
- Brand plates: radial navy `radial-gradient(130% 130% at 50% 0%, #090C2A 0%, #090C2A 62.8%, #0D1DCC 100%)`; edge-lit navy `linear-gradient(180deg, #fff 0%, #C8DFF3 2%, #0D1DCC 4%, #090C2A 6%, #090C2A 94%, #0D1DCC 96%, #C8DFF3 98%, #fff 100%)`.
- Logo: `<symbol id="pmf-logo" viewBox="0 0 191 34">` (23 paths, `fill="currentColor"`) — copy it from `Reports/infrastructure-at-the-edge-of-scale.html`. Path 0 is the square mark (≈ x 0–43); paths 1–22 are the wordmark. Get exact bounds with `getBBox()`, do not hard-code.
- Reports (source of truth for jacket copy):

| id | Title | Eyebrow | Meta | Tag | Page | PDF |
|---|---|---|---|---|---|---|
| `report-2026` | Capital built the industry. Infrastructure will define its next era. | Executive Report | London · 25 June 2026 | Inaugural Summit | `Reports/report-2026.html` | `Reports/Assets/report-2026.pdf` |
| `infrastructure-at-the-edge-of-scale` | Infrastructure at the edge of scale | Survey findings | March 2026 | Private credit | `Reports/infrastructure-at-the-edge-of-scale.html` | `Reports/Assets/infrastructure-at-the-edge-of-scale.pdf` |

- Brand motion (BRAND-FOUNDATION §8): `--ease-ui cubic-bezier(.4,0,.2,1)`, `--ease-reveal cubic-bezier(.22,1,.36,1)`, opening overshoot `cubic-bezier(.22,1.15,.36,1)`. Never linear. Every moving thing has a `prefers-reduced-motion` branch.

---

## 2. Non-negotiables (summary)

1. One viewport, no scroll: stage is `100svh` tall (`100dvh` where supported), `overflow:hidden`. Nothing extends past the viewport at any size from 360×640 to 2560×1440.
2. Top-down point of view. Everything is already in place on first paint — no build-up animation, only a fade-in from navy.
3. No linear easing anywhere. Every tween goes through a cubic-bézier curve or a damped spring (§8).
4. The record must fit the turntable exactly (§4.2 dimensions, asserted in code).
5. Soft, physically plausible shadows from one consistent key light (§9).
6. Sound on every step listed in §10, unlocked on first gesture, with a mute toggle.
7. 60 fps on a mid laptop; zero rAF work when nothing moves (§12).
8. Two playable records + three "Coming Soon" jackets.

---

## 3. Stack, scene and camera

### 3.1 Stack
- **three.js r170** (`three@0.170.0`), vendored into `Home/vendor/three/` (module build + the `RoundedBoxGeometry` addon). The sources under `Home/` are ES modules; `tools/bundle.mjs` (esbuild) folds them and three.js into one classic script, `Home/home.bundle.js`, which is what `index.html` loads — so the page also runs straight from `file://` (module scripts and `<img>`-sourced WebGL textures are blocked there; the two surface tiles are embedded as data URIs in `Home/data/textures.js` for the same reason). No post-processing passes, no GSAP — motion code is ours (§8). Edit the sources, re-run the bundle.
- WebGL2 required for the 3D path; otherwise fall back (§13).

### 3.2 Units and axes
- 1 world unit = 1 mm. `y` is up (toward the camera). `x` right, `z` toward the bottom of the screen. Console top surface is `y = 0`.
- Origin `(0, 0, 0)` = spindle centre (platter centre) projected onto the console.

### 3.3 Camera
- `PerspectiveCamera`, `fov = 20°`, looking straight down (`up = (0,0,-1)` so −z is screen-top). Narrow FOV keeps the view nearly orthographic but lifted objects grow slightly and their shadows separate — this is how "lift" reads from above.
- Distance is computed, not fixed: fit the **framing box** (§3.4) into the viewport with `contain` behaviour plus a 5% margin, recomputed on resize (debounced 100 ms). Expected ≈ 2,200–2,400 mm at 1440×900.
- Camera does not move during the experience. Optional: ±0.6° parallax toward the pointer, spring-smoothed, desktop only.

### 3.4 Layout constants

Landscape (viewport aspect ≥ 1.0):

| Object | Position / extent (mm) |
|---|---|
| Console (wood) top | x −290 → 860, z −290 → 310 (1150 × 600), top at y 0, height 450 to the carpet |
| Carpet plane | y −450, extends past every viewport edge |
| Turntable plinth | x −220 → 300, z −215 → 185 (520 × 400), top at y 60 |
| Platter / spindle centre | (0, —, 0) |
| Jacket stack, active slot centre | (580, —, 0) |
| Framing box | console bounds |

Portrait (aspect < 1.0): same turntable at origin; the jacket sits centred below it at (0, —, 405) with its open edge facing up; console x −340 → 340, z −290 → 840 (the extra depth holds the title row). The record slides out upward (centre 405 → 88) and then settles onto the platter (see §6 portrait exception).

Invariants to assert in a dev check (`?debug=1`): no jacket slot (with its rotation) overlaps the plinth footprint; DOM overlay elements never overlap the platter's projected circle; the framing box is fully inside the viewport.

---

## 4. Assets

### 4.1 Environment
- **Carpet:** dark low-pile wool, navy-charcoal (`≈ #12142A` base, lighter fibre noise). `MeshStandardMaterial`, roughness 1, tiled 1K albedo + normal (WebP). Soft large shadow under the console (baked texture plane).
- **Console:** polished dark walnut. `MeshPhysicalMaterial`: albedo 2048×1024 walnut texture (grain along x), roughness 0.38, `clearcoat 1`, `clearcoatRoughness 0.08`. 6 mm rounded edge catching a highlight. Polish reads through reflections from the environment map (below).
- **Lighting:** a generated dark-studio scene → PMREM as `scene.environment` (a near-black room with one long warm strip light top-left and a dim cool strip bottom-right, so polish shows as a soft streak rather than a white wash; `RoomEnvironment` was tried and rejected for exactly that wash). One warm key `DirectionalLight` (`#FFE6CC`) from screen top-left, direction ≈ normalize(−0.45, 1, −0.55) — shadows fall to bottom-right. `HemisphereLight` fill: sky `#C8DFF3`, ground `#1A1410`, low intensity.
- **Tone:** `NeutralToneMapping` (Khronos PBR Neutral), exposure 1.4, `outputColorSpace = SRGB`. AgX was the first choice and was dropped: it greys the brand navy/blue on the covers. The scene still reads dark and soft; covers and label read at full brand colour.
- **Vignette:** CSS overlay over the canvas — `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(9,12,42,.55) 100%)`. Optional film grain PNG at ≤ 3% opacity. No shader post-processing.

### 4.2 Turntable (3D)
Material language: grey, satin-matte ("doff") anodised aluminium body with polished bevels — premium, not glossy.

| Part | Spec |
|---|---|
| Plinth | 520 × 400 × 50 body on 10 mm recessed feet (top at y 60). Corner radius 14. Colour ≈ `#7E8187`, metalness 0.75, roughness 0.45, faint brushed anisotropy along x. 2 mm 45° chamfer on the top edge, roughness 0.12 (polished line of light). |
| Platter well | Recessed circle r 171, 4 mm deep. Fine spun-finish concentric rings r 171 → 180 on the plinth top (texture). |
| Platter | r 165, 20 mm thick, top at y 76. Polished aluminium outer chamfer. **Pattern around the circle:** strobe band on the platter's top rim r 154 → 165 — four concentric rows of polished dots on satin, counts 180 / 183 / 216 / 217, one texture on a `RingGeometry` (one draw call). |
| Mat | Black felt/rubber, r 148, 2 mm, top at y 78. |
| Spindle | Polished steel pin r 3.6, protrudes 12 mm. |
| Record seat | Record r 150 centred on spindle, tolerance ≤ 0.5 mm. Assert at init: `recordR (150) < platterR (165)`, `recordR > matR (148)`, strobe band (r ≥ 154) stays visible outside the record, and `wellR (171) > platterR`. |
| Tonearm | Pivot at **(200, —, −186)** (top-right). Effective length pivot→stylus **245**. Rest pose: arm tube **horizontal**, pointing −x, stylus at (−45, —, −186) on a rest post — clear of the well (r 191 > 171). Parts: pivot base r 22 polished ring, gimbal, straight polished tube r 4, headshell with 22° offset and finger lift, cartridge body in `#0D1DCC` (brand accent), knurled counterweight r 16 behind the pivot (to x ≈ 270), cue lever beside the pivot. Heights: arm tube y 92 at rest, y 104 lifted, stylus tip touching record top (y 80) when playing. |
| Tonearm angles | Rotation about the pivot's y axis; positive angle moves the stylus toward +z. Solve the cue angle in code: `stylus(a) = (px − L·cos a, pz + L·sin a)`, find `a` where `|stylus| = 146` (lead-in groove). For the numbers above, cue ≈ **10.8°**; r 120 ≈ 16.9°. |
| Buttons | Three tactile keys bottom-left of the plinth, in a row starting ≈ (−195, —, 160): **Play ▶**, **Pause ❚❚**, **Stop ■**. 28 × 18 mm, radius 4, same satin grey slightly darker, engraved light-grey glyphs. 2.5 mm travel. Play carries a small LED (`#0D1DCC` core, ice halo) that pulses only in READY. Pause and Stop are present but inert (no hover, no cursor, no sound) — for now only Play responds. |

### 4.3 Record
- r 150, 1.8 mm thick, black `≈ #0B0B0E`. Spindle hole r 3.62.
- **Grooves are procedural in the fragment shader** (`onBeforeCompile` on `MeshPhysicalMaterial`), no groove texture download: high-frequency concentric rings in roughness/normal as a function of radius, with `fwidth()`-based fade so sub-pixel grooves never moiré. Smooth bands: lead-in r 146–150 (glossy), 3 track gaps at r ≈ 132, 116, 98, run-out r 52–60 smooth.
- Sheen: `anisotropy` (r153+) with tangential direction so the classic radial light streak appears and stays put while the record spins.
- **Label:** r 50, navy `#090C2A` with a soft radial lift toward `#0D1DCC` at the edge (dark-blue centre). **Two things only:** the white PMF lockup, 52 mm wide, its foot 9 mm above the spindle centre; and the report title in Zodiak, centred, cap line 9 mm below the centre, ≤ 3 lines within 62 mm (5.2 mm type, stepping down to 3.6 mm if needed), leading 1.18. No ring text, catalogue number or meta. Rendered to a 1024² `CanvasTexture` after the fonts load. Logo upright when the record comes to rest.
- One record object, re-labelled per selected report (swap label texture), not one per jacket.

### 4.4 Jackets
- 314 × 314 × 3.5 mm box. The open edge faces the turntable: −x in landscape (the record leaves to the left), −z in portrait (it leaves upward). The other three edges are closed card.
- **Glossy laminated surface** (was matte; changed so the colours read): `MeshPhysicalMaterial` roughness 0.55, metalness 0, `clearcoat 1`, `clearcoatRoughness 0.1`, no sheen, and the cover art also as `emissiveMap` at 0.32 so brand colours hold at full strength in the dark room. The covers get their own environment map: the dark studio plus one large softbox overhead toward the top-left whose edge sits ~8° off vertical, so from the camera a cover catches a soft lacquer sheen over part of its face that slides as the jacket moves; the wood and turntable keep the plain studio. Edges in a cardboard-core tone `#D9D6D0`.
- Cover art: generated at runtime with Canvas 2D from the data model below → `CanvasTexture`, 1024² (2048² when `devicePixelRatio ≥ 2` and the viewport short side ≥ 900). Generate active ±1 first, the rest in `requestIdleCallback`. Anisotropy 8.
- **A cover carries two things only: the PMF lockup and the report title — in one layout on every jacket:** lockup flush left on the top margin, title flush left with its last baseline on the bottom margin. No pills, catalogue numbers, meta or ornaments. Margins 34 mm on all four sides (clear of the edge-lit band); lockup 100 mm wide; title in Zodiak 400, −0.02em, leading 1.14, within 86% of the inner width so its rag never meets the right margin. **One title size for all jackets:** the largest size ≤ 25 mm at which the longest title still fits three lines (`sharedTitleSize()`), so the covers match each other.

| Jacket | Plate |
|---|---|
| Report 2026 | Radial navy |
| Infrastructure at the edge of scale | Edge-lit navy turned 90° (lit left/right edges) |
| Coming Soon (×3) | Cream / ice (navy ink), slate (white ink) |

Coming Soon jackets cannot be selected; clicking one gives a small eased nudge (4 mm, 220 ms, `--ease-ui` there and back) and the live region says "Coming soon".

**Data model** — one array drives jackets, labels, DOM overlay and fallback:

```js
export const RECORDS = [
  { id: 'report-2026', status: 'available', catalogue: 'PMF 001',
    title: 'Capital built the industry. Infrastructure will define its next era.',
    short: 'Report 2026', eyebrow: 'Executive Report', meta: 'London · 25 June 2026',
    tag: 'Inaugural Summit', href: 'Reports/report-2026.html',
    pdf: 'Reports/Assets/report-2026.pdf', plate: 'radial-navy', layout: 'title-low' },
  { id: 'infrastructure-at-the-edge-of-scale', status: 'available', catalogue: 'PMF 002',
    title: 'Infrastructure at the edge of scale', short: 'Infrastructure',
    eyebrow: 'Survey findings', meta: 'March 2026', tag: 'Private credit',
    href: 'Reports/infrastructure-at-the-edge-of-scale.html',
    pdf: 'Reports/Assets/infrastructure-at-the-edge-of-scale.pdf',
    plate: 'edge-lit', layout: 'title-high' },
  { id: 'soon-3', status: 'soon', catalogue: 'PMF 003', title: 'Coming Soon', plate: 'cream' },
  { id: 'soon-4', status: 'soon', catalogue: 'PMF 004', title: 'Coming Soon', plate: 'ice' },
  { id: 'soon-5', status: 'soon', catalogue: 'PMF 005', title: 'Coming Soon', plate: 'slate' },
];
```

### 4.5 One jacket at a time (browse layout)

Only the active jacket is ever on the console; the others wait hidden in the same place. **No element overlaps another** — no fan, no peeking neighbours — and the debug check (`?debug=1`) asserts that the DOM overlay (title row, prompt, sound toggle, footer) overlaps neither each other, the turntable nor the jacket, and stays on screen.

**No hover.** The jacket does not lift, tilt or follow the pointer; it only keeps `cursor: pointer` as the click affordance. Order clamps at the ends (no wrap); the prev/next control disables at index 0 / last.

---

## 5. States

```
LOADING → BROWSE ⇄ (nav) BROWSE
BROWSE → SELECTING → CUEING → READY → PLAYING → LEAVING → navigate
READY / CUEING → EJECTING → BROWSE
```

- Inputs during a transition are ignored, except prev/next in BROWSE: coalesce to at most one queued step.
- PLAYING is committed: no cancel.
- Persist the active index in `sessionStorage` (`pmf-home-index`, try/catch). On `pageshow` with `event.persisted` (Back from a report), reset to BROWSE on that index, clear the overlay, stop audio.
- Optional deep link: `#<record id>` preselects that jacket.

---

## 6. Choreography (landscape timings; portrait identical)

t = 0 at the click on the active, available jacket.

In BROWSE the single record object waits hidden inside the active jacket (record base y 8.8, between the jacket's base 8 and top 11.5), so the jacket's front hides it from above. The platter shows the bare mat.

| # | Start–end (ms) | What moves | Curve | Sound |
|---|---|---|---|---|
| S1 | 0–120 | Jacket pressed 2 mm | `--ease-ui` | `jacket-pick` |
| S3 | 120–520 | Jacket base lifts to y 90 (clears the plinth top at y 60 and the platter); record rides inside it (base y 90.8); shadow softens and offsets | `--ease-reveal` | — |
| S4 | 450–1250 | Record slides fully out of the sleeve to −x by 317 mm (centre 580 → 263) at base y 90.8, until its right edge is 10 mm clear of the jacket's open edge. The jacket's front occludes the part still inside | `--ease-mech` | `sleeve-out` (envelope follows slide velocity) |
| S5 | 1150–1850 | Jacket departs toward screen-top: z → beyond the viewport top + 400, y +20, rot −4° | `--ease-exit` | — |
| S6 | 1250–2150 | Record transfers to the spindle: xz along a quadratic Bézier from (263, 0) to (0, 0), control point bowed 40 mm toward +z (away from the tonearm); y rises to 120 in the first 35%, lowers to 1.5 mm above rest in the last 30%; rotates to label-upright | xz `--ease-mech`; rise `--ease-reveal`; lower `--ease-ui` | — |
| S7 | 2150–2330 | Settle: final 1.5 mm drop onto the mat (record top y 80), shadow tightens to contact | `--ease-reveal` | `record-set` |
| S8 | 2300–2540 | Cue lever up; arm lifts y 92 → 104 ("needle moves up") | `--ease-ui` | `tonearm-lift` |
| S9 | 2540–3340 | Arm swings 0° → cue angle (≈ 10.8°) | `--ease-mech` | `tonearm-swing` |
| S10 | 3340–3700 | Arm lowers; stylus touches the record at r 146 | `--ease-reveal` | `needle-drop` |
| S11 | 3650–3930 | Prompt "Play vinyl to go to report" fades in, 8 px rise; Play LED begins pulsing (1.6 s, `--ease-ui` alternate, 40%↔100%) | `--ease-reveal` | — |

Clearances already checked for these numbers (keep them true if you tune): at S4's end the record (centre 263, r 150, base y 90.8) clears the tonearm, pivot base and counterweight in plan by ≥ 20 mm and the platter top (y 76) in height; S6 never crosses the tonearm's rest line (z −186).

**Portrait exception:** the sleeve opens upward, toward the turntable: the record slides out 317 mm toward −z (centre 405 → 88), then settles onto the platter (transfer arc bowed 40 mm toward −x). The jacket departs to +x (screen-right), not to the top, so it never passes over the turntable.

**Play** (t = 0 at click on the 3D Play key, the prompt, Space or Enter):

| # | Start–end (ms) | What | Curve | Sound |
|---|---|---|---|---|
| P1 | 0–90 / 90–270 | Play key down 2.5 mm / back up (whichever control was used, the 3D key animates) | `--ease-ui` / overshoot | `play-press` |
| P2 | 0–200 | Prompt fades out | `--ease-ui` | — |
| P3 | 100–1000 | Platter + record spin up 0 → 33⅓ rpm (3.49 rad/s). Ease the **angular velocity**, integrate for angle | `--ease-ui` | `spin` loop fades in, `playbackRate` 0.7 → 1.0 |
| P4 | 1000–2900 | Steady 33⅓ rpm; arm drifts 10.8° → 11.4° | `--ease-ui` on the drift | `spin` continues |
| P5 | 2300–2950 | Navy `#090C2A` overlay 0 → 1; master gain → 0 (`setTargetAtTime`) | `--ease-ui` | fade out |
| P6 | 2950 | `location.assign(href)` | — | — |

Prefetch the selected report (`<link rel="prefetch">`) at S10.

**Eject** (Esc or "Choose another report" in CUEING/READY): prompt out → S10…S8 reversed → S7–S6 reversed → S5 reversed → S4 reversed → jacket lowers. Each duration × 0.75; a reversed step uses the mirrored curve (`cubic-bezier(1−x2, 1−y2, 1−x1, 1−y1)`).

**Browse nav** (‹ › buttons, ←/→, horizontal swipe ≥ 40 px), silent — **one continuous glide**: a single eased progress u (680 ms, `--ease-glide cubic-bezier(.4, 0, .1, 1)`) drives both jackets. Over u 0 → .5 the outgoing jacket moves 44 mm in the direction of travel and dissolves (smoothstep to 0 by 80% of its half); over u .5 → 1 the incoming one continues the same motion from 44 mm on the other side and resolves (smoothstep from 20%). Velocity is continuous across the hand-over, the fastest part happens while both are near-invisible, and the two are never on the console together. The title row slides out 12 px and back in from the other side in step (WAAPI: 240 ms `--ease-ui`, then 420 ms `--ease-reveal`). The arrows never dim mid-glide (they disable only at the ends); a click during a glide queues one step. Record label swaps silently in the background.

---

## 7. DOM overlay and copy

The canvas is decoration plus pointer target; real controls are DOM. Overlay elements are anchored to projected 3D points, repositioned only on resize and state change (via `transform`, never top/left on every frame).

| Element | Where | Content |
|---|---|---|
| Sound toggle | top-right | icon button, `aria-pressed`, label box "Sound on" / "Sound off" (brand hover-label pattern, §8 of BRAND-FOUNDATION) |
| Jacket info | below the jacket stack | eyebrow pill + meta, title of the active jacket (Zodiak 20→24, 2 lines max), index "01 / 05", a small "PDF" link for available reports |
| Prev / Next | flanking jacket info | tactile keys styled like the turntable keys (satin grey, inner shadow, 1 px press, shadow shrink 90 ms); `aria-label` "Previous report" / "Next report" |
| Jacket hit target | transparent `<button>` over the active jacket's projected rect | `aria-label` "Open {title}"; Enter/Space selects |
| Prompt | centred below the plinth on the console | play glyph + **"Play vinyl to go to report"**; a quieter text button below: "Choose another report" |
| Live region | visually hidden, `aria-live="polite"` | "Report 2 of 5: Infrastructure at the edge of scale", "Record loaded. Press Play to open the report.", "Coming soon" |

Keyboard: ←/→ browse, Enter select, Enter/Space play in READY, Esc eject. Visible focus rings on every control. Type uses Inter/Zodiak per BRAND-FOUNDATION §3.

---

## 8. Motion system (no linear motion)

- `Home/motion/bezier.js`: cubic-bézier solver (Newton–Raphson with bisection fallback, as in WebKit `UnitBezier`). `Home/motion/tween.js`: `tween({ from, to, duration, delay, ease, onUpdate })` driven by the shared rAF clock; returns a promise. `Home/motion/spring.js`: critically damped spring with `dt` clamped to 1/30 s.
- Curves (CSS custom properties and a JS map with the same names):

| Token | Curve | Use |
|---|---|---|
| `--ease-ui` | `cubic-bezier(.4, 0, .2, 1)` | Presses, fades, spin-up, settling (brand) |
| `--ease-reveal` | `cubic-bezier(.22, 1, .36, 1)` | Anything arriving or lifting (brand) |
| `--ease-open` | `cubic-bezier(.22, 1.15, .36, 1)` | Key release only (brand overshoot) |
| `--ease-mech` | `cubic-bezier(.65, 0, .35, 1)` | Mechanical travel: sleeve slide, record transfer, tonearm swing (new — add to BRAND-FOUNDATION §8) |
| `--ease-exit` | `cubic-bezier(.4, 0, .7, .2)` | Objects leaving the frame (new) |
| `--ease-glide` | `cubic-bezier(.4, 0, .1, 1)` | Browsing between jackets (new) |

- The only constant-rate motion permitted is the record's steady 33⅓ rpm rotation (physical); every start, stop and speed change is eased.
- Add a dev assertion: `tween()` throws if `ease` is missing or `'linear'`.

---

## 9. Shadows

One key light, one shadow direction (toward screen bottom-right), everywhere.

1. **Dynamic:** the key `DirectionalLight` casts. Shadow camera frustum fitted tightly to the console bounds. `VSMShadowMap` (soft penumbra, `radius ≈ 6`, `blurSamples 12`); map 2048² desktop, 1024² on coarse pointers. Casters: record, jackets, tonearm, buttons, plinth. Receivers: console, plinth top, mat, record. Set `renderer.shadowMap.autoUpdate = false` and `needsUpdate = true` only on frames where a caster moved.
2. **Contact / ambient occlusion:** pre-blurred shadow sprites (generated once at init with canvas 2D `filter: blur()`, 256²) under the plinth feet, each jacket, the record and the console on the carpet. For an object at height h above its surface: offset = lightDir.xz · h · 0.6, blur scale = 1 + h · 0.04, opacity = base · (1 − h / 200) clamped. This is what makes the lifts in S3/S6/S8 read from above.
3. Shadow tint warm-dark (`rgba(10,6,4,…)`), never pure black.

---

## 10. Sound

- Web Audio API, one `AudioContext` created and resumed on the first `pointerdown`/`keydown`. Master `GainNode` at 0.6. Fetch files as `ArrayBuffer` in `requestIdleCallback` after first render; decode after unlock.
- Files in `Home/audio/`, mono MP3 96 kbps, total ≤ 300 KB. If a file is missing, play a procedural placeholder from `Home/audio/synth.js` (filtered noise / short transients) so the full sequence always has sound; real recordings (CC0, e.g. Freesound CC0 filter) drop in by filename.

| Cue | File | Trigger | Character | Level |
|---|---|---|---|---|
| `jacket-pick` | `jacket-pick.mp3` | S1 | soft cardboard tap | −14 dB |
| `sleeve-out` | `sleeve-out.mp3` | S4 | paper/card friction, ~650 ms, gain envelope follows slide velocity | −10 dB |
| `record-set` | `record-set.mp3` | S7 | felt thud, low | −12 dB |
| `tonearm-lift` | `tonearm-lift.mp3` | S8 | cue-lever click + damped hiss | −14 dB |
| `tonearm-swing` | `tonearm-swing.mp3` | S9 | quiet bearing / mechanical glide, ~900 ms | −18 dB |
| `needle-drop` | `needle-drop.mp3` | S10 | stylus contact thump + first crackle | −12 dB |
| `play-press` | `play-press.mp3` | P1 | heavier key click | −10 dB |
| `spin` | `spin-loop.mp3` | P3–P5 | motor start + surface crackle, seamless ≥ 4 s loop | −16 dB |

- Mute toggle persists in `localStorage` (`pmf-home-sound`, try/catch). Default on. No sound ever plays before a user gesture.
- Stop and disconnect all sources on `pagehide`.

---

## 11. Page load

- **The page shows directly — no logo, no intro.** Until the first frame the canvas is navy `#090C2A` and the overlay is hidden (`.stage.is-booting`). Boot draws every cover and label, compiles every shader (the record's too, though it is hidden — `compileAsync` where `KHR_parallel_shader_compile` exists, `compile` otherwise) and uploads every texture (`initTexture`), then renders the first frame with everything in place and shows the overlay in the same tick. Overlay positions are set instantly, never transitioned.
- Default active jacket: index 0 (Report 2026), or the sessionStorage / hash value.

---

## 12. Performance budget

- **Render on demand.** The rAF loop runs only while a tween is active or the record is spinning; otherwise it stops. Pause entirely on `visibilitychange` hidden.
- Renderer: `antialias: true`, `powerPreference: 'high-performance'`, pixel ratio `min(devicePixelRatio, 1.5)`. **Dynamic resolution:** while animating, if frames keep running past 22 ms (18 net long frames) the pixel ratio drops a quarter step, never below 1×; decrease-only so it settles.
- Budgets: ≤ 80 draw calls, ≤ 150k triangles, ≤ 96 MB GPU texture memory, page weight excluding fonts ≤ 2.5 MB (three.js vendored ≈ 170 KB gz), no main-thread task > 50 ms after first interaction, sustained 60 fps at 1440×900 DPR 2 on an M1 MacBook Air / Intel Iris Xe laptop.
- Textures: WebP, power-of-two, mipmapped; carpet 1K tiled, walnut 2K × 1K. Jacket covers and the label are generated, not downloaded. Groove detail is procedural.
- Reuse geometries and materials; one record mesh; strobe dots in one texture; no per-frame allocations in the loop.
- **Shadow map:** VSM 1024² (512² on coarse pointers), blur radius 3 / 8 samples — the blur passes are the costly part, so the map is small and updated only on frames where a caster moved. Jackets cast **no** map shadow (their contact sprite grounds them), so browsing never re-renders it; the spin never does either (platter and record are round, their shadow can't change).
- **No first-use stalls:** every shader compiled and every texture uploaded at boot (§11); covers drawn once at 1024² (no 2048² variant); a label swap only rebinds a texture, no shader rebuild.
- `?debug=1`: FPS / draw-call meter and the layout invariants from §3.4.
- `_headers`: `Cache-Control: public, max-age=31536000, immutable` for `/Home/vendor/*` and `/Home/audio/*`.

---

## 13. Fallbacks and edge cases

- **No WebGL2 / context lost / script never starts:** show the current card grid (keep today's markup in the page, hidden unless needed; also inside `<noscript>`). On `webglcontextlost`, swap to the grid. An inline watchdog in `index.html` shows a "Setting up the listening room…" note at 4 s and the grid at 15 s if the 3D view has not booted.
- **`prefers-reduced-motion: reduce`:** same states, no travel — every move becomes a 200 ms opacity crossfade to its end state, no spin, navigate 400 ms after Play.
- **Resize mid-animation:** recompute camera framing and overlay anchors; tweens continue in world space.
- **Double / rapid clicks:** ignored outside BROWSE (§5).
- **Touch:** tap selects; swipe browses; buttons ≥ 44 px hit area.
- **Back from a report (bfcache):** §5.
- **Audio blocked or fails to decode:** silent, no errors thrown to the console.

---

## 14. Files

```
index.html                 rewritten: overlay markup, fallback grid, importmap, module entry
Home/
  home.css
  home.js                  bootstrap + state machine
  data/records.js          RECORDS (§4.4)
  scene/stage.js           renderer, camera framing, on-demand loop, raycasting
  scene/environment.js     carpet, console, lights, env map, vignette hook
  scene/turntable.js       plinth, platter, strobe ring, tonearm, keys
  scene/record.js          record + groove shader + label texture
  scene/jackets.js         jacket meshes (one shown at a time), open-edge side, cover env map
  scene/covers.js          cover art: plate + lockup + title
  scene/shadows.js         contact-shadow sprites, shadow-map dirty flag
  motion/bezier.js  motion/tween.js  motion/spring.js
  audio/audio.js  audio/synth.js  audio/*.mp3
  data/textures.js         the two tiles as data URIs (built from textures/*.webp)
  textures/*.webp          source tiles (not loaded at runtime)
  vendor/three/            three@0.170.0 module build + RoundedBoxGeometry
  home.bundle.js           built by tools/bundle.mjs — the one script index.html loads
```

---

## 15. Acceptance checks

Run headless (Playwright, Chromium) and attach screenshots:

1. States BROWSE, mid-S4, READY, mid-P4 at **1440×900, 1280×720, 1920×1080, 820×1180, 390×844**: no scrollbars (`scrollHeight === innerHeight`), no console errors, framing box inside the viewport, overlay clear of the platter.
2. Record fit assertions (§4.2) pass; measured stylus radius at cue = 146 ± 1 mm.
3. Grep: no `linear` easing, no raw `t` used as progress without a curve.
4. Idle for 5 s in BROWSE with no pointer movement: zero rAF callbacks.
5. Performance trace of select → play: 95th-percentile frame ≤ 16.7 ms on desktop profile; no long task > 50 ms.
6. Keyboard-only run reaches both reports; screen-reader names correct; reduced-motion run reaches both reports.
7. WebGL disabled (`--disable-webgl`): card grid shown, all four links work.
8. Back from a report restores BROWSE on the same jacket with no overlay and no audio.

---

## 16. After implementation

- Add **§10 Homepage — Listening Room** to `Brand Foundations/BRAND-FOUNDATION.md`: materials, layout constants, the motion table (§6), the two new curves, the sound table, budgets.
- Append an entry to the project changelog (`claude/pmf-reports-changelog.md`).

---

## 17. Assumptions to confirm

1. "Maximum is at 1vh" is read as: the experience is one viewport tall — no page scroll.
2. "Doff" = matte/satin finish. (Turntable stays satin; the jacket covers were later changed to glossy — 2026-10-08 feedback.)
3. Prompt copy is "Play vinyl to go to report" (brief said "Play vinyl to go report").
4. Turntable sits left, jackets right, because the record leaves its sleeve to the left toward the player. Portrait stacks turntable above jackets.
5. Pause and Stop are rendered but inert for now.
6. Sounds ship as procedural placeholders until recorded/CC0 files are dropped into `Home/audio/`.

## 17b. Second view

`RACK-VIEW-BRIEF.md` specifies the Rack view (an eye-level shelf, switchable top-right) and the refactor that split this page into `home.js` (shell) + `views/table` + `views/rack` + `views/shared/cue.js` + `core/assets.js`. The Table view's behaviour, numbers and checks are unchanged by it.

## 18. Feedback round 1 (2026-10-08) — applied

- Covers glossy instead of matte, so the colour reads (§4.4); tone mapping moved to PBR Neutral (§4.1).
- No overlapping elements: one jacket on the console at a time, no hover lift/tilt on it (§4.5); overlay overlap checked in `?debug=1`.
- No PMF logo in the page overlay (the label and the covers carry it).
- Label and covers carry only the lockup and the report title (§4.3, §4.4); cover spacing reworked (34 mm margins, 86% title measure).
- Arrow clicks are silent (§10).

## 19. Feedback round 2 (2026-10-08) — applied

- No logo or intro on entry; the page renders directly (§11). "Internal preview — not indexed." removed from the page and the fallback grid (the `noindex` meta and header stay).
- Browsing is one continuous eased glide with a matching title-row slide (§6 Browse nav, `--ease-glide`).
- One cover layout and one title size for every jacket (§4.4).
- Lag: dynamic resolution, smaller VSM map, jackets out of the shadow map, no shadow updates while spinning, shaders/textures warmed at boot, 1024² covers only (§12).

## 20. Feedback round 3 (2026-10-08) — applied, both views

- **Gloss film on the covers.** The print is under a clear laminate. Base roughness is .68, the clearcoat is 1 / .035, and a generated film normal map acts on the clearcoat only (long, low undulations), so reflections ripple gently while the print stays sharp.
- **The lockup stays clear.** The Table's cover softbox moved overhead to the right, with its edge on a diagonal (~8° → 11° off vertical). The sheen now crosses the cover's right side and never the lockup (top-left) or the title.
- **Strobe band.** The four dot rows are drawn into a polar strip (u = angle, v = radius), 4096 × 64, and mip-mapped on an opaque ring with a roughness map for the polished dots. They used to be an alpha-tested cut-out whose hard edges crawled as the platter turned or the camera moved. The platter's bevel is a touch rougher (.24) so its thin highlight doesn't sparkle. Measured frame-to-frame change in the band while it turns: −64%.
- **No `backdrop-filter`** on the switcher, edge keys or prompt. They use slightly more opaque fills instead.
- The Rack-side changes are in `RACK-VIEW-BRIEF.md` §17.

## 21. Third view

The **Shelves** view (`SHELVES-VIEW-BRIEF.md`) adds three shelves of fifteen jackets explored freely. The Table view is unchanged; `views/shared/wall.js` now builds the wall room for the Rack and the Shelves.

## 22. The shrink-wrap (2026-10-12)

The jackets' gloss film is now a tight shrink-wrap — a wrinkle normal map and a haze roughness map on the clearcoat, reflecting an analytic world of its own while the print under it keeps the dark studio — in all three views: `GLOSS-FILM-BRIEF.md` (§14 as built), `Home/scene/film.js`. The Table's cover reflects the overhead panel's framed edge; its sleeve edges are wrapped too. Nothing in the Table's choreography or layout changed.

## 23. Lag pass (2026-10-12)

The whole site, measured and tightened (`pmf-reports-changelog` (ff); BRAND-FOUNDATION §7, §9, §10 "Budgets and lag"):
- **Views prebuilt while idle.** After boot the two views not on screen are built one at a time when the page is quiet (no transition, no input for 800 ms); a switch is only the navy fade. Builds are quiet — they set their state but write nothing to the shared DOM until `enter()`.
- **No first-use stalls.** `App.warmUp()` compiles, then draws the view once with everything shown and culling off, into the canvas and painted over in the same task; three.js's per-program log check runs under `?debug=1` only.
- **Frames only when something moved.** `tweenActivity()` (motion/tween.js): a tween waiting out its delay, a pending `call()` or a `wait()` keeps the loop stepping without drawing; an `ambient` tween alone (the READY LED) draws every third frame.
- **Resolution policy** (`scene/stage.js` `PR`): ≤ 1.5× and ≤ 2560 × 1440 pixels in all; drops a quarter step when the last 20 frame intervals (less the longest) average past 22 ms; remembered per DPR for 30 days; one step back up per session after 300 smooth frames.
- `buildWall()` gives each wall its own Texture objects over the shared limewash image: setting the repeat on the shared textures re-tiled the other view's wall, depending on build order.
- Tools: `tools/perf-audit.mjs`, `tools/gpu-breakdown.mjs`, `tools/stall-probe.mjs`, `tools/boot-profile.mjs`, `tools/pr-check.mjs`, `tools/bfcache.mjs`.
