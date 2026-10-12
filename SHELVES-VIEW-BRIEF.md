# Homepage — third view: "Shelves"

Implementation brief for a coding agent. It adds a third view to the homepage, beside the top-down **Table** view and the eye-level **Rack** view. Read these first:

- `HOMEPAGE-VINYL-BRIEF.md` (the Table view);
- `RACK-VIEW-BRIEF.md`, especially §15–§18 (as built);
- `Brand Foundations/BRAND-FOUNDATION.md` §8, §10, §10.1.

Everything not restated here carries over unchanged: brand tokens, easing curves, cover art, the gloss film, the wall, the ledge, the switcher, fallbacks.

Where this brief gives a number, use it. Where it says "tune", the number is a starting point and the stated invariant is what must hold.

---

## 0. Goal

A third way into the same reports: **a wall of shelves the visitor can explore freely.**

1. On entering, the visitor sees **three walnut shelves of five jackets each — all fifteen at once**, face-out, at a normal, straight-on view.
2. The visitor can **zoom in** (wheel, pinch, buttons) and **drag** to move around the wall freely.
3. **Clicking a jacket raises it** off its shelf toward the camera and brings the camera to it. The title shows below it. The jacket is **not opened** and **no record is shown**; the room dims so the chosen jacket is the focus.
4. **Back** (or Esc, or a click elsewhere): the jacket goes back over its spot, **drops down naturally** onto the shelf and **tips back to rest against the wall** — the same slanted rest pose every jacket has from the start.
5. **Go to report**: the page **fades out and opens the report**. There is no turntable in this view.
6. The shelf, wall, floor and jackets are the **Rack view's**: same walnut ledge with its lip, same limewash wall, same carpet, same covers under the same gloss film.

All three views are one page. They share one renderer, one selected report, one sound setting and one fallback.

---

## 1. Decisions already made (from Anson)

| Question | Answer |
|---|---|
| Name in the switcher | **Shelves** → `Table · Rack · Shelves` |
| Jacket at rest ("slanted") | **Lean back only**, like the Rack. Upright from the front, top resting on the wall: lean **9.29°**, top-back edge 0.5 mm off the wall, bottom-front edge 1 mm behind the lip (`views/rack/layout.js` `LEAN_DEG`, `JACKET_REST`). Every jacket starts in this pose, and a dropped jacket ends in it. |
| How the visitor confirms | A **Go to report** button under the title, plus a quiet **Back to the shelves** link. Esc or a click elsewhere also goes back. |
| Opening the jacket / showing the record | **Neither.** The jacket rises and comes forward, closed. |
| After confirming | **Fade, then the report.** No turntable step. |

**Assumption (question left open):** there are five records but fifteen slots. The **middle shelf** (eye level) holds the five records in `records.js` order: the two reports, then the three Coming Soon jackets. The **top and bottom shelves** hold ten more **Coming Soon** jackets, cycling the three existing Coming Soon plates (cream, ice, slate). Slots are filled from data. A new record in `records.js` takes the next free slot — middle row, then top, then bottom — and pushes a placeholder out. Change `SLOT_ORDER` in one place if Anson wants another arrangement.

Rules carried over from earlier feedback rounds, which apply here too:

- No two elements overlap: no jacket through a jacket, shelf, lip or the wall, and no overlay control on another control or on the focused jacket.
- No hover effect on any jacket. `cursor: pointer` only.
- **Text never moves.** Overlay text appears and disappears by opacity only. It is laid out once per state and doesn't follow the camera.
- **The view is silent.** The open sound was removed from the Rack in round 3, and this view has no cues at all. The sound toggle stays for the other views.
- Never linear motion. Tweens use the bezier tokens. Pointer-driven motion uses critically damped springs or exponential decay.
- The logo on every cover must read clearly: no reflection over the lockup.
- No `backdrop-filter` over the canvas.

---

## 2. Repository context and the refactor it needs

As built (see RACK-VIEW-BRIEF §15–§18):

- `Home/home.js` is the app shell: boot, switcher, shared index, input dispatch, bfcache, debug.
- `Home/core/stage.js` (`scene/stage.js`) is the renderer, the on-demand loop and dynamic resolution. `Stage.setView(scene, camera, customFit)` chooses what is rendered.
- `Home/core/assets.js` builds the shared things once: tiles, env maps (`env`, `coverEnvTop`, `coverEnvFront`, `envEven`), the film normal map, every cover and label texture.
- `views/table/*` and `views/rack/*` are the two views. `views/rack/room.js` builds the wall, floor, ledge, console and picture light. `views/rack/layout.js` holds every Rack number.

### 2.1 Refactor first (no pixel change to the Rack)

Move the reusable parts of the Rack room into `views/shared/wall.js`:

```js
buildWall(ctx, assets, { x0, x1, height })                // limewash plane at z 0, tiled per WALL.tile
buildFloor(ctx, assets, { x0, x1 })                       // carpet at y 0
buildLedge(ctx, assets, { x0, x1, top })                  // walnut ledge + lip, LEDGE constants
buildFill(ctx)                                            // hemisphere + ambient, as in the Rack
restPose()                                                // { lean: LEAN_DEG, y: JACKET_REST.y - LEDGE.top, z: JACKET_REST.z }
```

`views/rack/room.js` then calls these with its current arguments. `JACKET_REST`, `LEAN_DEG` and `LEDGE` move to `views/shared/wallLayout.js`; the Rack re-exports them.

**Regression gate.** Before any Shelves code:

- `tools/rack-pose.mjs` at 1440 × 900 and 390 × 844 must produce the same frames (±1 LSB per channel).
- `tools/rack-clear.mjs`, `tools/rack-checks.mjs`, `tools/rack.mjs` must pass with identical results.
- The Table checks (`shot.mjs`, `glide.mjs`, `nav-sound.mjs`, `watchdog.mjs`, `file://`) must pass.

### 2.2 New files

```
Home/views/shelves/
  shelvesView.js     the view: build / enter / leave, state machine, choreography, overlay layout, invariants
  layout.js          every number in this brief (shelves, slots, camera limits, timings)
  slots.js           RECORDS → 15 slots (SLOT_ORDER, placeholder plates)
  shelfJacket.js     a closed jacket: one box, two material groups (cover face | edges + back), pose + tip math
  explorer.js        the free camera: pan, zoom-to-cursor, inertia, rubber-band bounds, glides
  input.js           pointer / wheel / touch / keyboard → explorer + selection (raycast)
```

### 2.3 Shell changes

- The switcher gets a third option (`#switch-shelves`, label "Shelves", an icon in the same set).
- `?view=shelves` selects it, and `localStorage['pmf-home-view']` accepts `'shelves'`.
- Table stays the default.
- The view is built lazily the first time it is chosen, like the Rack.

---

## 3. Scene

Units are millimetres. y is up from the floor (y 0). The wall is the plane z = 0 facing +z. x runs to the right. The middle column is at x = 0.

### 3.1 Layout constants

| Object | Spec (mm) |
|---|---|
| Columns | 5, pitch **420**: x = (c − 2) × 420, so −840 … +840. Gap between jackets: 106. |
| Shelves | 3 ledges, tops at **y 940, 1400, 1860** (row 2 bottom, row 1 middle = the Rack's height, row 0 top); pitch 460. Same `LEDGE` (depth 70, thickness 32, lip 20 at z 60 → 70). Each runs x −1297 → +1297 (outer jackets ± 157 + 300 overhang). |
| Jacket at rest | The Rack's rest pose on its own ledge: lean 9.29° about x, centre at (x, top + 155.25, 27.13). The top-back edge is 0.5 mm off the wall. The bottom-back edge is 0.1 mm above the ledge at z 51.2 — **the pivot for every tip** (§5). |
| Jacket | 314 × 314 × 7.9 (back face z −1.3 → front face z +6.6 in the jacket's frame), so the Rack's lean solution holds unchanged. |
| Clearances at rest | A jacket's top (y ≈ top + 311) sits **117 mm** under the ledge above's underside. Neighbours are 106 mm apart. |
| Wall | x −2500 → +2500, y 0 → 3200, at z 0. |
| Floor | Carpet at y 0, as in the Rack. |
| Content box (camera bounds) | x −1077 → +1077, y 868 → 2231 (bottom ledge underside − 40 to top jackets' tops + 60), on the cover plane z = 31. Centre ≈ (0, 1550). |

There is no console, turntable or record in this view.

### 3.2 Materials (all shared — no new textures)

- **Wall, ledge, floor:** exactly the Rack's (limewash albedo + normal, walnut with clearcoat, carpet).
- **Covers:** the shared cover textures (`assets.covers`) under the shared gloss film. That means print roughness .68, clearcoat 1 / .035, `assets.maps.film` on the clearcoat at 0.05, and .32 emissive.
  - **Env map:** start with `coverEnvFront`.
  - **Tune** so that at the overview and at every zoom, no cover shows the window strip over its lockup (top-left). Off-centre jackets see the strip from other angles. If one does, move the strip or give this view its own env with the strip further right.
  - Check with a covers contact sheet at overview, mid zoom and max zoom.
- **Edges and back:** the Rack's card edge material (`#9A948B`, roughness .9).
- **Placeholders** reuse the three Coming Soon cover textures. Nothing new is uploaded.

### 3.3 Light and shadow (cheap by design)

- **Fill:** the Rack's hemisphere (.55) + ambient (.35).
- **Shelf wash:** three warm `SpotLight`s, one per shelf (`#FFE6CC`, angle 40°, penumbra 1, decay 2, **no shadows**). Each sits at (0, top + 720, 900), aimed at (0, top + 155, 27). **Tune** intensity so all fifteen covers read evenly. The outer columns should be no darker than ~85% of the middle one.
- **Focus light:** the Rack's picture light (angle 22°, penumbra .8, `SPOT_OFFSET` (−300, +845, +874) from what it lights, **no shadows**).
  - At rest its intensity is 0.
  - In FOCUS it lights the raised jacket at the Rack's level while the wash and fill dim to 40% (§5). That is what puts the focus on the chosen jacket.
- **No shadow map in this view.** No light here casts, so three.js skips the shadow pass.
- **Grounding** uses sprites (the existing `ContactShadow`):
  - a contact sprite on the ledge under each jacket's bottom edge;
  - a soft **wall shadow** sprite behind each jacket: a rect sprite on the wall plane (z 0.3), offset 24 mm down and 18 mm right, opacity .35, blur .12.
  - As a jacket rises and comes forward, its wall sprite drifts further down-right, grows (1 + z/400) and fades (opacity × 1/(1 + z/120)). The ledge sprite fades with the lift, as in the Rack.

---

## 4. The free camera (`explorer.js`)

### 4.1 Model

- The camera always looks **straight at the wall**: position (x, y, 31 + d), target (x, y, 31).
- It never tilts or orbits. Depth comes from perspective and the jackets' lean.
- The state is { x, y, d }, with fov **32°** (as the Rack). Let t = tan 16°.
- **Safe rect:** the viewport minus the overlay's reserved bands — top 72 px (switcher, sound), bottom 88 px (zoom keys, hint), sides 24 px (16 px on phones). The overview fits the content box inside the safe rect.
- **d_fit** (overview, the furthest the camera goes):
  - `d_fit = max(boxH / (2t·sH), boxW / (2t·a·sW))`, where sH, sW are the safe rect's fraction of the viewport height and width.
  - At 1440 × 900: d_fit ≈ 2890 and a jacket is ≈ 170 px tall.
  - At 390 × 844: width-bound, d_fit ≈ 9270 and a jacket is ≈ 50 px tall.
- **d_min** (closest): a jacket fills 72% of the frame height → `d_min = 314 / (0.72 · 2t)` ≈ 760.
- **Bounds:**
  - The visible rect on the cover plane must stay inside the content box padded by 6%.
  - On an axis where the visible rect is larger than the box (always the case at d_fit on that axis), the camera is locked to the box centre.
  - Clamp after every update.

### 4.2 Inputs → motion

| Input | Effect |
|---|---|
| **Drag** (mouse, pen, one finger) | Pans **1:1 under the pointer**: world delta = screen delta × frameHeight(d) / viewportHeight. Pointer capture. Cursor `grab` / `grabbing`. |
| Release after a drag | **Inertia**: velocity from the last 100 ms of samples (capped 2.5 px/ms), decaying exponentially with τ = 325 ms. It stops below 0.02 px/ms. |
| Dragging past a bound | **Rubber band**: overshoot × 0.35, at most 48 px. On release it springs back (critically damped, ω 12). |
| **Wheel** (mouse wheel and trackpad two-finger scroll) | **Zoom toward the cursor**. Normalise `deltaMode` (line = 16 px, page = innerHeight). Factor `exp(−deltaY × 0.0016)` per event. The world point under the cursor stays fixed. `preventDefault` (non-passive) so the page never scrolls. |
| **Ctrl/⌘ + wheel** (trackpad pinch) | Same, factor `exp(−deltaY × 0.012)`. Browser zoom is suppressed on the canvas only. |
| **Pinch** (two touches) | The distance ratio zooms about the midpoint, and the midpoint's motion pans. Going from two fingers to one continues as a pan without a jump. |
| Double-click / double-tap **on the wall** | Zoom × 2 toward that point (600 ms, `--ease-glide`). At d_min it fits all instead. |
| **Zoom keys** (+ / − / Fit, bottom-right) | × 1.6 per press toward the safe-rect centre (450 ms, glide). Fit returns to the overview (700 ms, glide). |
| Keyboard | `+`/`=` and `−` as the keys; `0` = Fit; **Shift + arrows** pan by 15% of the view (300 ms, glide); arrows move the keyboard focus between jackets (§8). |
| **Click** (press < 6 px of travel and < 500 ms) | On a jacket: select it (§5). On the wall: nothing. |

- Zoom goes through a target distance followed by a critically damped spring (ω 14), so wheel notches feel continuous. Zoom-to-cursor is solved on the target and the spring carries x, y and d together: `x' = px − (px − x)·d'/d`, likewise for y.
- **Hit testing** is a raycast against the fifteen jacket boxes on pointer events only — never per frame. There is no DOM element per jacket for the pointer.
- `touch-action: none` on the canvas **in this view only**.
- No idle float in EXPLORE: the visitor holds the camera, so the loop stops when nothing moves (0 rAF at rest).

### 4.3 Entering

- Entering the view always shows the **overview** (all fifteen), with no animation beyond the shared switch fade.
- If the visitor came from Table or Rack with report *i* selected, the keyboard focus target is the slot holding record *i*. The camera doesn't move.

---

## 5. Jacket choreography

`shelfJacket.js` poses one closed jacket.

**Pose fields:** { lean (deg, about x), lift (mm, +y), forward (mm, +z), tip pivot = the bottom-back edge }.

- Leaning is always a rotation **about the bottom-back edge** — the edge resting on the ledge, at (0, −157, −1.3) in the jacket's frame. Use the Rack gatefold's tip math, generalised: position offset = R(l₀)·P − R(l)·P.
- A jacket going upright therefore swings its top ~51 mm off the wall and never pushes into the wall or the ledge. Check: the bottom-front edge stays ≥ 0.1 mm above the ledge and ≥ 0.9 mm behind the lip throughout.

### 5.1 Select → FOCUS (silent)

t = 0 at the click. Before t = 0, the zoom keys and the hint fade out (0–200 ms, `--ease-ui`, opacity only).

| Step | ms | What | Curve |
|---|---|---|---|
| F1 | 0–260 | Tips upright, off the wall: lean 9.29° → 0, pivoting on its bottom-back edge | `--ease-reveal` |
| F2 | 200–480 | Lifts **+30**, clearing the lip (bottom at top + 30.1 > lip top + 10) | `--ease-reveal` |
| F3 | 420–1000 | Comes **+160 toward the camera** and **+40 more up** (lift 70) | `--ease-reveal` |
| F4 | 150–1100 | Camera glides to the **focus framing** (§5.4) | `--ease-glide` |
| F5 | 250–900 | Wash and fill dim to 40%; focus light rises 0 → 1 on the jacket; sprites follow the pose | `--ease-ui` |
| F6 | 850–1130 | Focus block fades in under the jacket (§7). Opacity only, laid out once. Focus moves to **Go to report**. | `--ease-reveal` |

- The report's page is prefetched at F6 (the shell's `prefetch(href)`).
- In FOCUS the camera floats like the Rack's, at **60% of the Rack's amplitudes**. Only the camera moves; the text doesn't.

**Coming Soon jackets rise the same way.** Their block reads "Coming soon · In preparation · Coming Soon" and has only **Back to the shelves**.

### 5.2 Back → EXPLORE: the drop (silent)

Back can be triggered by the link, Esc, or a click anywhere outside the jacket and the block. It runs from wherever the rise had got to.

| Step | ms | What | Curve |
|---|---|---|---|
| D1 | 0–200 | Focus block fades out | `--ease-ui` |
| D2 | 0–900 | Camera glides back to the visitor's own explore pose from before the click (x, y, d) | `--ease-glide` |
| D3 | 100–600 | Wash and fill back to 100%; focus light → 0 | `--ease-ui` |
| D4 | 0–520 | Back over its spot, still upright: forward → 0, lift → +30 (held above the lip) | `--ease-ui` |
| D5 | 520–720 | **Drops** the last 30 mm onto the ledge, upright | `--ease-fall` |
| D6 | 720–980 | **Tips back** against the wall about its bottom-back edge: lean 0 → 9.29° | `--ease-fall` |
| D7 | 980–1180 | Settles off the wall: lean 9.29° → 8.5° (90 ms, `--ease-reveal`) → 9.29° (110 ms, `--ease-ui`) | — |
| — | 1180 | Zoom keys and the hint (if not dismissed) fade back; state → EXPLORE | `--ease-ui` |

- **New token:** `--ease-fall: cubic-bezier(.55, 0, 1, .45)` (gravity: slow start, accelerating). Add it to `motion/bezier.js` (`EASE.fall`), to `home.css` and to BRAND-FOUNDATION §8.
- The ledge contact sprite fades in over D5–D6. The wall sprite returns to its rest offset.
- The end pose must equal the rest pose exactly (lean 9.29°, same centre), so a later rise starts clean.

### 5.3 Go to report → leave

| Step | ms | What | Curve |
|---|---|---|---|
| G1 | 0–150 | The block's buttons disable; the block fades | `--ease-ui` |
| G2 | 0–600 | Camera eases 8% closer to the jacket | `--ease-glide` |
| G3 | 80–600 | The page fades to navy (the shared `#fade`); the audio master fades | `--ease-ui` |
| G4 | 600 | `app.navigate(record.href)` | — |

On a back/forward-cache return (`pageshow` with `persisted`), the view resets to EXPLORE: overview, the jacket at rest, fade off.

### 5.4 Focus framing

- **Target:** the raised jacket's centre (x, rest y + 70, rest z + 160), upright.
- **Distance:** the jacket fills **50% of the frame height** — `d = 314 / (0.5 · 2t)` ≈ 1095. On narrow screens, don't let it pass 78% of the width: `d ≥ 314 / (0.78 · 2t · a)`.
- **Vertical placement:** the look-at sits 10% of the frame height below the jacket's centre, so the jacket rides high and the block fits under it.
- **Step back** if the block (§7) would not fit above the bottom safe band.
- The camera still faces the wall (no tilt), so the jackets above and below stay visible but dimmed around the raised one.

### 5.5 Selecting while busy

- A click on a **different** jacket in FOCUS runs Back on the current one, then selects the new one when D7 ends. They are sequenced, never overlapping.
- Input during FOCUSING, DROPPING and LEAVING is ignored. Wheel events are still `preventDefault`ed.

### 5.6 Physical clearance (must hold every frame)

- No jacket passes through a ledge, a lip, a neighbour, the wall, or the jacket or ledge above or below.
- The order (lift clear of the lip before coming forward, and the reverse on the way back) is what guarantees it. At lift 70 the raised jacket's top (≈ top + 381) stays under the upper ledge's underside (top + 428) while it is still over the ledge.
- Verify with a `tools/shelves-clear.mjs` in the style of `rack-clear.mjs`: oriented-box SAT every frame, run for a corner and a middle slot on each shelf, rise then drop.

---

## 6. States

```
EXPLORE ⇄ (click jacket) FOCUSING → FOCUS → (Back) DROPPING → EXPLORE
FOCUS → (Go to report) LEAVING → navigate
```

- Only **EXPLORE** is switchable. Outside it, the switcher is disabled with the label box "Return to the shelves first".
- Pan and zoom work in EXPLORE only.
- `data-state` on `#stage` mirrors the state, as in the other views.

---

## 7. Overlay and copy

- **Switcher** (top-right, existing): `Table · Rack · Shelves`, `role=radiogroup`, ←/→ between options.
- **Zoom keys** (bottom-right):
  - three 40 px keys in the edge-key style — −, +, Fit (a four-corners icon);
  - 8 px apart, 24 px from the edges (16 px on phones);
  - `aria-label`s "Zoom out", "Zoom in", "Show all shelves";
  - each disables at its limit;
  - hidden (opacity, then `visibility`) outside EXPLORE.
- **Hint** (bottom-centre, Inter 12/18, white at 55%):
  - "Drag to explore · Scroll to zoom · Select a jacket" — on touch, "Drag to explore · Pinch to zoom · Tap a jacket";
  - fades out on the first pan or zoom and stays gone for the session.
- **Focus block** (`role=dialog`, `aria-labelledby` the title), centred under the raised jacket's projected bottom edge, 24 px below it:
  - eyebrow pill ("Executive report" / "Coming soon") + meta ("London · 25 June 2026" / "In preparation");
  - title (Zodiak 28/34, ≤ 3 lines, `max-width: min(520px, 100vw − 48px)`);
  - **Go to report** (primary, the Rack's confirm button style) + **Back to the shelves** (quiet link).
  - Enter = Go, Esc = Back.
  - It is positioned once per layout from the base pose; the FOCUS float does not move it.
- **Keyboard focus ring:** a 2 px `--c-ice` outline, 4 px out, drawn as one DOM rect around the **projected** focused jacket. It shows on `:focus-visible` only and is updated while the camera moves.
- **Live region:**
  - "Shelves. Fifteen jackets on three shelves."
  - On selecting: "<title>. Go to the report?"
  - On drop: "Back on the shelves."

---

## 8. Accessibility

- A visually hidden **grid of fifteen buttons** (roving `tabindex`, DOM order row by row) stands for the jackets. Example labels: "Middle shelf, 1 of 5: Capital built the industry. Infrastructure will define its next era. Executive report.", "Top shelf, 3 of 5: Coming soon."
- **Arrow keys** move the focus across the grid. If the focused jacket is less than 60% on screen, the camera glides (600 ms, glide) to bring it fully into view at the current zoom.
- Enter / Space selects.
- Zoom keys and the dialog are real buttons. Focus returns to the jacket's grid button after Back.
- **Reduced motion:**
  - no inertia;
  - zoom, pan, fit and keyboard-follow are instant;
  - rise and drop become a 200 ms crossfade between the rest and focus poses;
  - Go fades in 300 ms;
  - no FOCUS float.

---

## 9. Sound

None. No cue plays in this view: not on select, rise, drop or Go. The audio master still fades on leave in case another view's loop is alive. The sound toggle stays in the overlay for the other views.

---

## 10. Performance budget

| Item | Budget |
|---|---|
| Draw calls at the overview | **≤ 48**. Each jacket is one mesh with two material groups (cover face, edges + back); materials sharing a cover texture are shared. Instancing is allowed if it is needed to meet the budget. |
| Triangles | ≤ 20k |
| New textures | None, beyond a 128² wall-shadow sprite drawn on a canvas at build |
| Shadow map | None in this view |
| Frame rate | Pan, zoom and inertia at 60 fps on an integrated GPU at pixel ratio 1.5. The shared dynamic resolution handles slower machines (floor 1×). |
| Idle | **0 rAF** once inertia, springs and tweens have settled in EXPLORE. FOCUS floats at 30 fps when that is the only motion (as the Rack). |
| Per-frame JS | One camera update and sprite updates for the one moving jacket. No raycast per frame. DOM writes only for the focus ring (when visible). |
| Bundle | ≤ +40 KB |
| Warm-up | Compile this view's programs at build (`app.warmUp`), so the first rise never stalls. |

---

## 11. Fallbacks and edge cases

- **No WebGL / script blocked:** the existing fallback grid and watchdog, unchanged.
- **`file://`** works: everything is in the bundle.
- **Resize:**
  - In EXPLORE, keep the world point at the safe-rect centre fixed and re-clamp. Fit if the old d is now beyond d_fit.
  - In FOCUS, re-solve the focus framing and the block's position.
- **Orientation change on phones:** same as resize.
- **Window loses focus mid-drag** (`pointercancel`, `blur`): end the drag without inertia.
- **Two quick clicks on a jacket:** the second is ignored (FOCUSING).

---

## 12. Acceptance checks (headless, Playwright with a stepped clock; new `tools/shelves*.mjs`)

1. **Overview**, at 390 × 844, 600 × 900, 820 × 1180, 1024 × 768, 1280 × 720, 1440 × 900, 1920 × 1080 and 2560 × 1080:
   - all fifteen jackets' projected rects lie inside the safe rect;
   - no overlay element overlaps another or the safe rect's content;
   - no page scroll.
2. **Zoom to cursor:**
   - after wheel steps at three screen points, the world point under the cursor drifts ≤ 1 px once settled;
   - d stays within [d_min, d_fit];
   - Fit restores the overview exactly.
3. **Pan:**
   - a drag of N px moves the scene N ± 1 px;
   - bounds hold (the visible rect never leaves the padded box once settled);
   - the rubber band returns within 600 ms;
   - inertia comes to rest within 1.2 s.
4. **Click vs drag:** a 3 px wiggle selects; a 10 px drag doesn't.
5. **Clearance** (`shelves-clear.mjs`):
   - every frame of rise and drop, for slots (row, col) = (0,0), (0,2), (1,4), (2,0), (2,2);
   - no box overlaps;
   - nothing behind the wall;
   - the end pose equals the rest pose to 0.01 mm / 0.01°.
6. **Focus framing:**
   - the block is ≥ 24 px under the jacket, horizontally centred on it (±1 px) and inside the viewport;
   - over 5 s of the FOCUS float, the block moves 0 px and the jacket never reaches it.
7. **Go:** the fade is fully opaque before `navigate`, which is called with the right `href`. Coming Soon has no Go button.
8. **Keyboard:** arrows walk the grid (with camera follow); Enter selects; Esc drops; `+`/`−`/`0` zoom.
9. **Silence:** a stubbed `audio.play` records nothing across select → back → select → go.
10. **Performance:**
    - draw calls at the overview ≤ 48;
    - 0 rAF over 2 s after the last input in EXPLORE;
    - no shadow-map render in this view.
11. **Regressions:** Table and Rack checks unchanged, and the `file://` boot passes.

---

## 13. Docs to update after implementation

- `Brand Foundations/BRAND-FOUNDATION.md`:
  - a new **§10.2 The Shelves view**, in the style of §10.1 (files, layout, camera model, inputs, choreography table, overlay, budgets);
  - `--ease-fall` in §8.
- `HOMEPAGE-VINYL-BRIEF.md` and `RACK-VIEW-BRIEF.md`: a pointer to this brief, and a note on the shared wall refactor.
- Project changelog: an entry for the build.

---

## 14. Assumptions to confirm

1. **Fifteen slots** — middle shelf = the five records (two reports, three Coming Soon); top and bottom = ten more Coming Soon placeholders on the three Coming Soon plates. (The question was left open.)
2. **Wheel zooms** (mouse and trackpad scroll alike) and **drag pans**. There is no rotation or orbit: the camera always faces the wall.
3. **Coming Soon jackets rise too**, showing "Coming soon" and only the Back link. The Rack only nudges them instead.
4. **The view makes no sound**, following the round-3 feedback on the Rack's open sound.
5. **The room dims to 40%** around the raised jacket to "focus on the chosen jacket". A spotlight-only focus (no dimming) is the alternative.
6. **Entering always shows the overview.** The visitor's zoom and pan are not remembered between visits to the view.
7. **The drop ends with a small settle** off the wall (9.29° → 8.5° → 9.29°), so it reads as a real object coming to rest rather than snapping into place.

---

## 15. Implementation notes (2026-10-09, as built)

Built as specified, with these deviations:

- **No wash spots (§3.3).** Three per-shelf spots lit the covers unevenly and put a hot mirror blob on whichever cover happened to face the camera — and with the camera free, that is some cover at every zoom. The shelves are lit by the hemisphere (.75), the bounce (.45), one warm directional from high in front (its mirror image points 40° below level, where a wall-facing camera never is) and the env map; the covers are .32 self-lit. The focus light is the only spot. Even across all fifteen, no hot spots.
- **The dim (§5.1, F5)** also dims the shared covers' self-light and reflections to 40%, not just the lights — the covers are emissive, so dimming the lights alone barely read. The raised jacket swaps to its own full-brightness copy of its cover material for the duration (same shader program, no compile).
- **Zoom anchor across notches (§4.2).** The world point held under the cursor is kept across a run of wheel notches while the cursor stays put. From the overview the bounds lock x to the centre until the view is narrower than the box, so re-anchoring on every notch baked that early drift in (up to 57 px); holding the first notch's point brings the drift to 0.
- **No fling after a still release (§4.2).** If the pointer stopped more than 80 ms before letting go, there is no inertia (the last two samples alone would otherwise fling).
- **Inertia τ 250 ms** (was 325): a fling at the 2.5 px/ms cap rests in ≈ 1.2 s.
- **Jacket geometry:** the box's faces are regrouped into two index groups, so each jacket is two draw calls (a stock `BoxGeometry` with a material array is six). The fifteen ledge sprites and fifteen wall sprites are two `InstancedMesh`es; the raised jacket's instances scale to zero while a live pair follows it.
- **The focus framing** steps back when the block (measured once per layout) would not fit above the bottom safe band; the camera stays level.
- **Checks** (`tools/shelves.mjs`, `shelves-checks.mjs`, `shelves-clear.mjs`): the overview and a focus clean at 390 × 844, 600 × 900, 820 × 1180, 1024 × 768, 1280 × 720, 1440 × 900, 1920 × 1080, 2560 × 1080; zoom-to-cursor drift 0.00 px at three points; a 200 / 80 px drag moves the camera 200.0 / 80.0 px; the rubber band stops at 48 px past a bound and is back inside, still, within 600 ms; clearance clean on five slots with the end pose equal to the rest pose; 40 draw calls at the overview, 29 in FOCUS.
- **Harness note:** `page.evaluate(() => view.back())` deadlocks under Playwright's stepped clock — `back()` is async and resolves only when the clock advances, which the next step would do; call it with braces (`{ view.back(); }`) so the evaluate returns at once.

## 16. The shrink-wrap (2026-10-12)

The fifteen jackets wear the shrink-wrap of `GLOSS-FILM-BRIEF.md` (§14 as built; `Home/scene/film.js`) with a world of their own (`coverEnvShelves`): the softbox sits 6° up — the raised jacket stands upright at the camera's height and reflects level — and the box's ±15° span still reaches the leaning overview jackets. `setDim` scales the covers' `envMapIntensity` from `FILM.envIntensity`; the raised jacket's `focusMats` copy stays at full. The card edges are wrapped (`cardMaterial(env)`).
