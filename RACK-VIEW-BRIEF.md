# Homepage — second view: "The Rack"

Implementation brief for a coding agent. It extends the existing homepage (the top-down "listening room", now called the **Table** view). Read `HOMEPAGE-VINYL-BRIEF.md` (the Table view spec) and `Brand Foundations/BRAND-FOUNDATION.md` §8 and §10 first: everything not restated here — brand tokens, easing curves, the record, the turntable, the cue/play hand-over, sound handling, fallbacks — carries over unchanged. Where this brief gives a number, use it; where it says "tune", the number is a starting point and the stated invariant is what must hold.

---

## 0. Goal

Add a second, eye-level way to browse the same reports, switchable from the top-right:

1. The jackets stand face-out, one by one, on **one long walnut wall ledge** in front of a **textured wall**.
2. The camera holds a **close shot of one jacket at a time**. Arrows at each side of the screen, the arrow keys, a scroll gesture or a swipe move the camera to the previous / next jacket.
3. While the visitor is idle, the camera **floats** gently in place and leans a little toward the pointer.
4. Clicking the jacket **opens it like a book** (a gatefold), showing the record in its pocket and asking for confirmation:
   - **Back** → the jacket closes and returns to the ledge. You're back in the selection.
   - **Go to report** → the record slides out of the pocket and flies down to the turntable on a **low walnut console below the rack**, while the camera travels down with it. Then the existing Table-view sequence runs: tonearm cue → "Play vinyl to go to report" → spin → hand-over to the report.
5. Jackets and records look identical to the Table view: same cover art, glossy finish, label and groove shader.

Both views are one page and share one renderer, one selected report, one sound setting and one fallback.

---

## 1. Decisions already made (from Anson)

| Question | Answer |
|---|---|
| Where is the turntable, and what happens after the record lands? | On a **low walnut console below the rack**. The camera dollies and tilts down to it. Then comes the **same needle cue + "Play vinyl to go to report"** step as the Table view (no auto-play). |
| Rack shape | **One long shelf**: a single horizontal ledge, jackets side by side. The camera tracks left / right along it. |
| Default view | **Table** stays the default. Rack is opt-in from the switcher. The last choice is remembered. |

Rules carried over from the Table-view feedback rounds, which apply here too:

- No logo in the page overlay and no intro screen. The page shows directly.
- No "Internal preview" note.
- **No two elements overlap**: no jacket on another jacket, and no overlay control on a jacket, the turntable or another control.
- No hover effect on the jacket itself (`cursor: pointer` only).
- The browse arrows are silent.
- Never linear motion.

---

## 2. Repository context and the refactor it needs

The site is static and deployed on Netlify. `index.html` loads one classic script, `Home/home.bundle.js`, built by esbuild from the ES-module sources under `Home/` (`tools/bundle.mjs`). It must keep running from `file://` too, so:

- no import map;
- no `fetch()` of required assets;
- textures embedded as data URIs (see `Home/data/textures.js`).

Today the Table view lives in `Home/home.js` plus `Home/scene/*`. Its camera and framing live inside `Home/scene/stage.js`. Before adding the Rack view, split these apart **without changing a pixel or a millisecond of the Table view**:

```
Home/
  home.js                    app shell: boot, view switcher, shared state (index, sound), overlay wiring, fallback
  core/stage.js              renderer + on-demand loop + dynamic resolution (from scene/stage.js);
                             renders `activeView.scene` with `activeView.camera`
  core/assets.js             built once, shared by both views: cover textures (renderCover + sharedTitleSize),
                             label textures (renderLabel), surface tiles, env maps, groove material factory
  views/view.js              the View interface (below)
  views/table/tableView.js   today's Table view, moved out of home.js unchanged (camera + fit move here)
  views/rack/rackView.js     the Rack view: state machine + choreography
  views/rack/room.js         wall, floor, ledge, console, picture light
  views/rack/gatefold.js     GatefoldJacket (two hinged boards + pocket)
  views/rack/cameraRig.js    close-up framing, travel, idle float, pointer parallax
  views/shared/cue.js        tonearm cue (S8–S11) and play hand-over (P1–P6), used by both views
  scene/turntable.js, record.js, covers.js, shadows.js, environment.js
                             gain a `parent` argument (default `stage.scene`) so both views can instance them
```

```js
// views/view.js — what every view implements
{
  scene, camera, state,                 // state ∈ the view's own machine; 'browse' is the only switchable state
  async build(assets),                  // once, lazily (Rack is built the first time it is chosen)
  async enter(index), async leave(),    // called around the switch transition
  resize(w, h), layoutOverlay(), frame(dt, now),
  go(step), select(), confirm(), back(), play(), eject(),
  checkInvariants(),                    // for ?debug=1
}
```

**Regression gate:** after the refactor and before any Rack code, the existing headless checks must pass with identical results:

- `tools/shot.mjs` at all seven sizes: invariants clean, flow select → ready → eject → play.
- `tools/glide.mjs`: one jacket visible, monotonic, no shadow updates.
- `tools/nav-sound.mjs`.
- `tools/watchdog.mjs`, plus the `file://` boot.

---

## 3. Rack scene

### 3.1 Units and axes

- 1 unit = 1 mm. **y is up from the floor (y 0).**
- **The wall is the plane z = 0, facing +z.** The camera lives at z > 0 and looks roughly toward −z.
- x runs along the ledge, to the right.

Jacket *i* (0-based, in `RECORDS` order) is centred at **x = i × 700**. The pitch is 700 mm.

### 3.2 Layout constants (N = 5; derive everything from N and the pitch)

| Object | Spec (mm) |
|---|---|
| Wall | x −1200 → (N−1)·700 + 1200, y 0 → 2800, at z 0 |
| Floor | carpet plane at y 0 — the Table view's carpet tile, 4× repeat per metre |
| Ledge (walnut) | top surface at **y 1400**. Depth 70 (z 0 → 70), thickness 32, front lip 20 tall (y 1400 → 1420) at z 60 → 70. Runs from x −157 − 300 to x (N−1)·700 + 157 + 300. Rounded 3 mm edges, same walnut material as the Table console. |
| Jacket on the ledge | Bottom edge on the ledge against the lip, at z ≈ 52. Leans back so its top edge touches the wall: lean = asin(52 / 314) ≈ **9.5°**. Centre ≈ (i·700, 1555, 26). |
| Console (walnut sideboard) | Centred at x = (N−1)·700 / 2 (= 1400 for five), width 1400, depth 450 (z 0 → 450), top at **y 640**, 6 mm rounded edge, recessed plinth toe kick. |
| Turntable | The existing `Turntable` class, unchanged, parented to a group at **(1400, 640, 225)** with no rotation. Its local −z (the tonearm side) faces the wall, and the keys sit front-left. The plinth (520 × 400) fits the 450-deep console. |
| Picture light | One `SpotLight` that travels with the focus (§3.4) |

Invariant: in every close-up, the focused jacket's neighbours stay off-screen for aspect ratios 0.46–2.4 (see §4.1), and **no jacket ever overlaps another**. The pitch of 700 leaves ≥ 229 mm clearance even with a gatefold fully open (§5, §6).

### 3.3 Materials

- **Wall: textured dark plaster (limewash).** Base `≈ #1A1C26` (navy-black), low-frequency mottling ±6% luminance, fine trowel strokes in a normal map. Roughness 0.9, no clearcoat.
  - Generate it in `tools/textures.py` like the walnut tile: 1024² tileable, albedo + normal, WebP q80.
  - Embed it through `tools/embed-textures.py`. Budget ≤ 220 KB together.
  - One tile spans 1.2 m.
- **Ledge and console:** the Table view's walnut material (albedo + roughness, `clearcoat 1 / .08`).
- **Turntable, record, label, groove shader:** reuse as-is (`scene/turntable.js`, `scene/record.js`). Same label: lockup + title only.
- **Jackets:** same cover art (`renderCover`, shared title size, one layout) and the same glossy laminated material: roughness .55, clearcoat 1 / .1, cover art also as a .32 emissive map. **The `CanvasTexture`s themselves are shared with the Table view** (one upload, `core/assets.js`).
  - The cover sheen needs its own env map here, because the camera faces the cover rather than looking down on it. Use the dark studio plus a large softbox **above and in front of the jacket, behind the camera**, with its lower edge ~10° above the camera's line of sight. That puts a soft lacquer gradient across the upper third of the cover that slides as the camera floats.
  - The wood and turntable keep the plain dark studio map.
- **Tone mapping:** same as the Table view (PBR Neutral, exposure tuned for this scene; start at 1.4).

### 3.4 Light and shadow

- **Picture light.** One warm `SpotLight` (`#FFE6CC`), angle 22°, penumbra 0.8, decay 2.
  - It sits up and to the left of the focus, ≈ (focus.x − 300, 2400, 900), aimed at the focus point.
  - It travels with the focus on the same curve as the camera: the active jacket while browsing, the platter during the turntable phase.
  - It casts the only map shadow: VSM 1024² (512² on coarse pointers), blur 8 samples. Casters are the active jacket, the ledge, the record, the tonearm and the plinth.
  - The shadow map updates **only on frames where the light or a caster moves**: during travel, open/close and the record flight. Never during the idle float (the camera moving doesn't change shadows).
- **Fill.** A dim `HemisphereLight` (sky `#C8DFF3`, ground `#1A1410`) plus the env map. Unfocused jackets read at ~35% of the focused one's brightness. Nothing is switched on or off per jacket, so the falloff comes from the spot alone.
- **Wall wash.** A faint pool of light on the wall behind each jacket, baked into the wall material as a second, non-tiled lightmap-style multiply. It's generated once on a canvas from the jacket positions.
- **Contact shadows.** The `ContactShadow` sprites from the Table view: under each jacket's bottom edge on the ledge, under the console on the carpet, and under the turntable on the console.

---

## 4. Camera

`PerspectiveCamera`, **vertical fov 32°**, near 50, far 20 000. All camera motion goes through `cameraRig.js`. The rig owns a *base pose* (position + look-at target, both eased by tweens) and adds the *float* and *parallax* offsets on top every frame.

### 4.1 Close-up framing (BROWSE)

Look-at target: the jacket centre. The camera sits square in front of it (same x), 40 mm above the target, at a distance **d** chosen per aspect ratio *a*, with t = tan 16° = 0.2868:

```
d_fill      = 314 / (0.60 · 2t)                 // the jacket fills 60% of the viewport height
d_neighbour = (700 − 157 − 40) / (t · a)         // neighbours ≥ 40 mm outside the frame
d           = max( min(d_fill, d_neighbour),  314 / (0.78 · 2t) )   // never fill more than 78%
portrait:     d = max(d, 314 / (f · 2t · a)),  f = (W − 2·68) / W   // leave a 68 px gutter each side for the arrows
```

Checked values:

| Viewport | Aspect | d (mm) | Jacket fills | Neighbours off-screen |
|---|---|---|---|---|
| 1440 × 900 | 1.6 | 913 | 60% height | yes |
| 1920 × 1080 | 1.78 | 913 | 60% | yes |
| 2560 × 1080 | 2.33 | 753 | 73% | yes |
| 1024 × 768 | 1.33 | 913 | 60% | yes |
| 390 × 844 | 0.46 | 1820 | 65% width | yes |
| 820 × 1180 | 0.69 | 944 | 58% | yes |
| 3840 × 1080 | 3.56 | 702 | 78% (cap) | no — beyond the 2.4 aspect range; neighbours peek, dimmed by the spot falloff |

Recompute on resize.

### 4.2 Browse travel (arrows, ←/→, scroll, swipe)

- **One eased move per step.** The base pose's x (camera and target together, so it *trucks* rather than pans) goes from jacket *i* to *i ± 1* over **950 ms on `--ease-glide`** (`cubic-bezier(.4, 0, .1, 1)`).
- **Dolly bump.** At the same time the camera eases back and in by 7% of d, as `sin(π·u) · 0.07d` where u is the eased progress. That gives a soft push-out / push-in through the move.
- **Lead.** The look-at target leads the camera by 3% of the travel, so the shot settles on the new jacket a beat before the camera does.
- **Light and title row.** The picture light travels on the same curve. The title row under the jacket swaps exactly as in the Table view (WAAPI: 240 ms `--ease-ui` out, 420 ms `--ease-reveal` in, sliding 12 px in the direction of travel).
- **Silent.** No sound on browse.
- **Clamped.** The ends don't wrap. An arrow disables only at its end; it never dims mid-move. A click during a move queues one step.
- **Scroll.** Wheel / trackpad input accumulates `deltaX + deltaY` (with `deltaMode` lines × 16).
  - At ±60 px it fires one step.
  - It then locks until no wheel event has arrived for 180 ms, so trackpad inertia never skips two jackets.
  - Only `preventDefault` when a step can actually happen. The page never scrolls (it is one viewport).
- **Swipe.** Horizontal swipe ≥ 40 px, horizontal ≥ 1.5 × vertical.

### 4.3 Idle float and pointer parallax ("floating in place")

- **Float.** Active in BROWSE and CONFIRM once there has been **no input for 1.2 s**.
  - The offset is a sum of two incommensurate sines per channel, e.g. `sin(2πt/7.3 + φ1) + 0.5·sin(2πt/11.9 + φ2)`, normalised. Amplitudes:

    | Channel | Amplitude |
    |---|---|
    | x | ±6 mm |
    | y | ±4 mm |
    | z | ±5 mm |
    | yaw | ±0.25° |
    | pitch | ±0.2° |
    | roll | ±0.12° |

  - The float's weight eases in over 1.6 s (critically damped spring, ω ≈ 2.5). It drops to 0 within 250 ms when any input arrives or a move starts.
  - Sines are smooth by construction; the weight is never stepped.
- **Parallax** (`(hover: hover)` only). The pointer, normalised over the viewport, offsets the camera by up to ±16 mm in x and ±10 mm in y. The look-at target stays fixed, so the jacket's perspective shifts slightly. It's driven by a critically damped spring (ω ≈ 3.5) and is not shown on touch.
- **Cost control.**
  - The float is the only reason the loop runs while idle. Each float frame is a plain render with **no shadow-map update**.
  - If dynamic resolution has already reached 1× and frames still run long, the float renders at 30 fps (every other frame).
  - After **120 s** with no input, the float weight eases to 0 and the loop stops. The next input brings it back.
  - It is paused while the tab is hidden.
  - It is off under `prefers-reduced-motion`.

### 4.4 Turntable framing (after Go to report)

- Look-at target: the platter centre, world (1400, 718, 225).
- Elevation 52°, at the distance that makes the plinth's 520 mm fill ~70% of the viewport width (portrait: ~82%).
- At 1440 × 900 that puts the camera at ≈ (1400, 1356, 723) and d ≈ 810. It stays below the ledge (y 1400) and well in front of it (z 70), with no clipping.
- The READY prompt sits under the plinth, as in the Table view, projected to screen.

---

## 5. Gatefold jacket (`views/rack/gatefold.js`)

| Part | Spec |
|---|---|
| Boards | **Two** 314 × 314 × 2.6 mm boards, hinged along a 6 mm spine on the **left**. |
| Front board | Outer face: the cover texture (shared). Inner face: the report's plate colour (the §1 plate of that cover) with the lockup only, bottom-left, at 60 mm. |
| Back board | Holds the record on its inner face, in a **pocket flap** that covers the lower 35% of the disc and has a semicircular thumb cut. The inner face is a slightly lighter plate. With the front board open, the record and its whole label are in plain view — the "reveal". |
| Material | The same glossy cover material on printed faces; cardboard-core `#D9D6D0` on edges. |
| Pivot | The front board rotates about the spine's vertical axis: 0° closed, **−170° open**, swinging toward the camera and to the left like a book cover. |

While the jacket is closed, the record is hidden between the boards. Use one shared `Record` instance per view, as in the Table view, re-labelled per report.

**The open spread is centred on the jacket's spot.** As the jacket lifts off the ledge (O2), it also shifts +157 mm to the right, putting the spine at the jacket's original centre x. Opened, the front board spans x − 309 → x and the back board x → x + 314. That leaves ≥ 229 mm to either neighbour, and the camera's close-up x never has to move.

---

## 6. States and choreography (Rack)

```
BROWSE ⇄ (go) BROWSE
BROWSE → OPENING → CONFIRM → CLOSING → BROWSE                  (Back / Esc / click outside)
CONFIRM → TRANSFER → CUEING → READY → PLAYING → LEAVING → navigate   (Go to report)
READY → EJECTING → BROWSE                                       (Choose another report / Esc)
```

Only BROWSE accepts view switches and browsing. "Coming Soon" jackets don't open: they do the Table view's 4 mm eased nudge and announce "Coming soon".

### 6.1 Open (t = 0 at click on the focused, available jacket)

| # | ms | What | Curve | Sound |
|---|---|---|---|---|
| O1 | 0–120 | Jacket presses 3 mm back toward the wall | `--ease-ui` | `jacket-pick` |
| O2 | 100–700 | Jacket lifts off the ledge: +30 mm up, +80 mm toward the camera, +157 mm to the right (spine onto the jacket's centre line), lean 9.5° → 0° (now upright, square to the camera) | `--ease-reveal` | — |
| O3 | 250–950 | Camera eases back to frame the open gatefold (§6.4) | `--ease-glide` | — |
| O4 | 650–1550 | Front board hinges open 0° → −170° | `--ease-mech` | `gatefold-open` |
| O5 | 1300–1700 | The record settles 6 mm forward and up in its pocket, catching the light (a small "breath" that says it's free) | `--ease-reveal` | — |
| O6 | 1500–1780 | Confirm panel fades in under the open jacket (8 px rise) | `--ease-reveal` | — |

### 6.2 Back (from CONFIRM)

O6 → O1 reversed at ×0.8 with mirrored curves (`cubic-bezier(1−x2, 1−y2, 1−x1, 1−y1)`), each step starting from wherever the object is. `gatefold-close` plays as the board meets the pocket.

### 6.3 Go to report (from CONFIRM)

| # | ms | What | Curve | Sound |
|---|---|---|---|---|
| T1 | 0–200 | Confirm panel out | `--ease-ui` | — |
| T2 | 0–700 | Record lifts out of the pocket toward the camera: +z 70 mm, +y 120 mm (clear of the flap). No sideways travel, so it never nears a neighbour. | `--ease-mech` | `sleeve-out` |
| T3 | 600–2400 | Camera travels to the turntable framing (§4.4) along a cubic Bézier, bulging 250 mm toward +z at mid-path. Position and look-at target are eased separately; `lookAt` runs every frame, with no quaternion snapping. The picture light travels with it. | `--ease-mech` (position), `--ease-glide` (target) | — |
| T4 | 700–2300 | The record flies along a 3D Bézier from in front of the jacket to 120 mm above the spindle. It rotates from upright (disc facing +z, `rotation.x = +90°`) to flat (0°), label upright for the camera on arrival. It arrives ~100 ms before the camera settles, so the eye follows it in. | `--ease-mech` (path), `--ease-ui` (rotation) | — |
| T5 | 2300–2480 | Lowers the last 1.5 mm onto the mat | `--ease-reveal` | `record-set` |
| T6 | 900–1700 | Behind the camera, the jacket closes (−170° → 0°) and returns to its ledge spot (O2 reversed) | `--ease-mech` | — (it is off-screen) |
| — | 2450 → | **`views/shared/cue.js`**: S8–S11 (cue lever, arm lift, swing to r 146, lower, READY prompt), then on Play P1–P6 (key, spin-up to 33⅓, drift, navy hand-over, `location.assign`). Same timings, curves and sounds as the Table view. | | |

Prefetch the report at T5.

### 6.4 Open-gatefold framing

The open spread is 623 mm wide (309 + 314), centred on the jacket's x (§5). Frame it so that it fills ≤ 70% of the viewport width **and** ≤ 58% of the height, leaving room for the confirm panel below: d = the larger of the two fits. The camera's x doesn't change; it only eases back.

- At 1440 × 900, d ≈ 970 (spread at 70% of the width, 56% of the height). The neighbours' near edges (543 mm from centre) stay off-screen (half-width 445).
- On very wide screens the neighbours may enter the frame. They're dimmed by the spot falloff and never overlap the open spread: the gap is ≥ 229 mm either side.

### 6.5 Eject (READY → BROWSE)

1. The prompt goes out.
2. The arm runs S10–S8 in reverse (×0.75).
3. The camera rises back to the open-spread framing of the same jacket (1400 ms, `--ease-mech` mirrored). Meanwhile the jacket lifts and opens again (O2 + O4 at ×0.6), and the record lifts off the mat, flips upright and flies back into its pocket (T4 + T2 reversed, `sleeve-out`).
4. The Back sequence (§6.2) closes the jacket and returns it to the ledge. BROWSE.

---

## 7. Overlay and copy (Rack)

Same overlay rules as the Table view: DOM controls anchored to projected 3D points, positions set instantly on resize and state change (never transitioned), and the overlay hidden until the first frame.

| Element | Where | Content |
|---|---|---|
| **View switcher** | Top-right, left of the sound toggle (8 px gap) | Segmented control, 32 px tall: **Table** · **Rack**, each a small line icon plus label (Inter 12/18). Active segment: ice `#C8DFF3` fill, navy text. Inactive: 12% white wash on hover. `role="radiogroup"`; ←/→ move between options. The same control appears in both views. Disabled (`aria-disabled`, 40% opacity) outside BROWSE, with the brand label box "Return to the collection first". |
| Sound toggle | Top-right (unchanged) | — |
| Prev / Next | Screen edges, vertically centred on the jacket, 24 px from the edge (portrait: inside the 68 px gutters from §4.1) | 48 px round "glass" keys (satin grey like the Table keys), chevron icons, `aria-label` "Previous report" / "Next report". Silent. |
| Jacket hit target | Transparent `<button>` over the focused jacket's projected rect | `aria-label` "Open {title}". Enter / Space opens. |
| Title row | Under the jacket, 28 px below its projected bottom edge | The Table view's component: eyebrow pill · meta · title (Zodiak, max 3 lines) · "02 / 05" · PDF link |
| Confirm panel | Under the open gatefold | Title (Zodiak 20/26), then **Go to report** (primary pill: ice fill, navy text) and **Back to the collection** (quiet text button). `role="dialog"`, `aria-labelledby` the title. Focus moves to the primary button; Esc = Back; Enter = Go. |
| READY prompt | Under the plinth | Unchanged: "Play vinyl to go to report" + "Choose another report" |
| Live region | Hidden | "Report 3 of 5: …", "Jacket open. Go to the report?", "Record loaded. Press Play to open the report." |

`?debug=1` runs the Table view's overlap check in this view too. The assertion covers prev, next, the title row, the confirm panel, the prompt, the switcher, the sound toggle and the hit targets. None may overlap another, the focused jacket, the open gatefold or the turntable, and each must stay inside the viewport. **Report overlaps as failures.**

---

## 8. Switching views

- **When.** Only from BROWSE in the current view.
- **Transition.**
  1. The canvas and overlay fade to navy (280 ms, `--ease-ui`).
  2. `leave()` the old view; `build()` the Rack view if this is its first use, behind the navy; `enter(index)` the new view at the shared index.
  3. Render one frame, then fade in (420 ms, `--ease-reveal`).
  - No logo or spinner in between. If a first-time build takes over 600 ms, keep the navy and show nothing else.
- **State.**
  - The selected report index is shared (`sessionStorage` `pmf-home-index`).
  - The view is remembered in `localStorage` `pmf-home-view` (try/catch).
  - `?view=rack` / `?view=table` overrides the stored choice. The hash stays the record deep link.
  - Default view: **Table**.
- **Rendering.** Only the active view renders and steps its frame callbacks. The inactive view's scene stays built but cold: no tweens, no float. Shared textures are uploaded once.
- **Warm-up.** On first `build()` the Rack view compiles its shaders and uploads any textures of its own (wall tiles, wall-wash map, gatefold inner faces) before its first frame. Use the same `warmUp()` pattern: `compileAsync` where `KHR_parallel_shader_compile` exists, `compile` otherwise; hidden objects made visible for the compile; `initTexture` for each texture.
- **Reduced motion.** The switch is a 200 ms crossfade.

---

## 9. Sound

Reuse `Home/audio/audio.js` and its levels. New cues get a procedural placeholder in `synth.js` and an optional file slot:

| Cue | Trigger | Character | Level |
|---|---|---|---|
| `gatefold-open` | O4 | Soft board-hinge flex plus a short paper slide, ~700 ms, envelope following the hinge velocity | −14 dB |
| `gatefold-close` | Back, as the board closes | Soft card-on-card tap | −14 dB |

Browsing, the camera travel and the view switch are silent. Everything from `sleeve-out` onward reuses the existing cues.

---

## 10. Performance budget (Rack)

| Budget | Limit |
|---|---|
| Draw calls in the close-up | ≤ 70 (frustum culling keeps off-screen jackets and the console out) |
| Draw calls in the turntable framing | ≤ 80 |
| Triangles | ≤ 150k |
| Rack's own textures | ≤ 1.5 MB GPU (covers and labels are shared) |
| Bundle growth | ≤ 120 KB on disk |

- **Render on demand**, as in the Table view, with one exception: the idle float (§4.3) keeps the loop alive. It's capped and stopped as described there.
- **Shadow map**: one spot, updated only when the light or a caster moves. The float, the parallax and the steady spin never update it.
- **Dynamic resolution**: shared with the Table view (pixel ratio ≤ 1.5, quarter-step drop when frames keep running past 22 ms, floor 1×).
- **No first-use stalls**: the gatefold's inner textures and the wall-wash map are built and uploaded in `build()`. Swapping the record label only rebinds a texture.
- **No post-processing.** No depth of field, bloom or SSAO; focus comes from the spot falloff and the framing.
- **`?debug=1`** shows fps, draw calls, pixel ratio, the float state and the invariants for the active view.

---

## 11. Fallbacks and edge cases

- **No WebGL2, lost context, or a script that never starts**: the existing card grid and 15 s watchdog, for both views. The switcher is hidden in the fallback.
- **`prefers-reduced-motion`**: no float, no parallax. Browse, open, close, transfer and switch become 200 ms crossfades to the end state. No spin, and the hand-over happens 400 ms after Play.
- **Resize mid-move**: recompute d and the framings; tweens continue in world space.
- **Back from a report (bfcache)**: both views reset to BROWSE on the shared index, the gatefold closes, the camera snaps to the close-up and audio stops.
- **Touch**: tap opens, swipe browses, no parallax, buttons ≥ 44 px.
- **Keyboard**:
  - ←/→ browse.
  - Enter opens; Enter confirms; Esc backs out or ejects.
  - Tab order: switcher → sound → prev → jacket → next → PDF link.

---

## 12. Acceptance checks (headless, Playwright with a stepped clock; extend `tools/`)

1. **Table-view regression**: every existing check passes unchanged (§2).
2. **Rack BROWSE** at 390×844, 600×900, 820×1180, 1024×768, 1280×720, 1440×900, 1920×1080 and 2560×1080:
   - overlap / on-screen invariants clean;
   - neighbours off-screen;
   - no page scroll;
   - no console errors.
3. **Rack flow**: browse → open → back → open → go → READY → eject → BROWSE → open → go → play → `location.assign(report)`, in landscape and portrait. Then the same with reduced motion.
4. **Gatefold clearance**: sampled every frame of O1–O6, T2 and the eject. Min distance between the open spread (or the record) and any neighbour ≥ 200 mm, and only one jacket off the ledge at a time.
5. **Camera travel**: per-frame track sampling, as `tools/glide.mjs` does. Monotonic x during browse, no frame-to-frame velocity jumps, and 0 shadow-map updates during the idle float.
6. **Idle**:
   - the float starts after 1.2 s;
   - its amplitude stays within §4.3;
   - the loop stops after 120 s of no input, and there are 0 rAF requests after that.
7. **Scroll**: one trackpad-style burst (30 wheel events over 600 ms) advances exactly one jacket.
8. **View switch**:
   - Table → Rack → Table keeps the index;
   - `?view=rack` loads Rack directly;
   - the switcher is disabled outside BROWSE;
   - `file://` boot works in both views.
9. **Performance trace**: no long task > 50 ms after the first frame, including the first switch to Rack (its build runs behind the navy and is split if needed). Real-GPU fps checked on a laptop with `?debug=1`.

---

## 13. Docs to update after implementation

- `HOMEPAGE-VINYL-BRIEF.md`: add a pointer to this brief.
- `Brand Foundations/BRAND-FOUNDATION.md`: add a §10.1 "Rack view" in the style of §10. Cover:
  - the files;
  - the layout constants;
  - the camera framing formula;
  - the float;
  - the gatefold;
  - the O / T timelines;
  - the switcher;
  - the budgets.
- Project changelog: add an entry for the build.

---

## 14. Assumptions to confirm

1. The **Go to report** confirmation lives in the opened gatefold as a small panel: title, primary button, quiet "Back" link. It isn't a modal dialog over the scene.
2. The gatefold opens to the **left**, like a book: spine on the left, front board swinging over to the left. The record sits visible in a pocket flap on the right-hand board, and leaves it toward the camera, not sideways.
3. The inner gatefold faces carry only the plate colour and the lockup, consistent with the "logo + title only" rule (the title is on the front cover).
4. The wall is **dark limewash plaster** (navy-black) so the glossy covers and the warm picture light carry the scene. Fabric or wood panelling would be a swap in `tools/textures.py` only.
5. The camera floats only in BROWSE and CONFIRM. In the turntable framing the shot holds still so the needle and the prompt read cleanly.
6. Coming Soon jackets sit on the ledge like the others but don't open.

---

## 15. Implementation notes (2026-10-08, as built)

- Built as specified, with these deviations:
  - **Wall wash (§3.4):** not baked. The travelling spot pools light on the wall behind the focused jacket by itself; unfocused jackets fall off through it alone. A baked multiply map can be added later if the pools need to show on every jacket.
  - **Close-up composition:** the look-at point sits 8% of the frame height below the jacket's centre (9% for the open spread), so the jacket rides high enough for the title row / confirm panel under it on short viewports. The brief's distances are unchanged.
  - **Portrait gutters** 82 px, not 68 — the leaning jacket's near (bottom) edge projects ~3% wider than its centre, and 68 left the edge key touching it at 820 × 1180.
  - **Turntable framing:** plinth at 64% of the width (78% portrait) looking 100 mm ahead of the platter, so the plinth sits a little higher and the READY prompt fits; the prompt is also clamped to the viewport.
  - **Bundle growth** 178 KB (budget was 120): the wall normal map (77 KB WebP → 103 KB as a data URI) plus ~45 KB of code.
- Verified headless (software GL, stepped clock): Table regression unchanged (`shot.mjs` sizes, `glide.mjs`, `nav-sound.mjs`, `watchdog.mjs`, `file://`); Rack BROWSE + CONFIRM + READY invariants clean at 390×844, 600×900, 820×1180, 1024×768, 1280×720, 1440×900, 1920×1080, 2560×1080; full flow browse → open → back → open → go → READY → eject → open → go → play → navigate (`tools/rack.mjs`), reduced motion too; float starts after 1.2 s, max offsets 5 / 3.3 / 5 mm, 0 rAF after 120 s idle; one trackpad burst = one jacket; switch keeps the index, disabled outside BROWSE, `?view=rack` honoured; min gap to a neighbour 229 mm with one jacket off the ledge (`tools/rack-checks.mjs`); `file://` boot. Draw calls 20 / 38 / 48.
- Harness note: with Playwright's stepped clock the first `runFor` after `pauseAt(+1000)` absorbs the jump; tests run 1 s of idle clock before the first input.

---

## 16. Feedback round 1 (2026-10-08, as built)

Anson's notes on the first build, and what changed.

**1. "Objects overlap when moving; the vinyl is very visible when the jacket opens."**
- *Cause:* the record followed the jacket by position only. It stayed vertical while the jacket leant 9.5°, so its top came ~25 mm out through the front board. Its pocket depth (z 2.4–4.2) also ran through the flap and the front board. O5 and T2 then pushed it forward through the flap. The jacket's lift and its forward move ran on the same curve, so its bottom edge passed through the ledge lip. The 3 mm "press" pushed its top into the wall.
- *Now:*
  - The record is **parented to the jacket** while it is in the pocket. Its faces sit at z 1.4–3.2: behind the flap (≥ 3.3) and the front board (≥ 4.0), in front of the back board (≤ 1.3). It is hidden until the front board has swung past −8°.
  - The record's way out is **straight up** (T2a, +125 mm, until its lower edge is 21 mm above the flap), **then toward the camera** (T2b, +70). Eject reverses this: in, then down. O5 is up-only (+6).
  - The open is **lift first** (O2a), then forward, right and upright (O2b). Back and T6 reverse it: board closed, back over the lip with the lift held, then set down.
  - The lean is solved so the jacket fits the ledge with clearances: 9.29°, top back edge 0.5 mm off the wall, bottom front edge 1 mm behind the lip. O1 is now a 4 mm **tip** (the top comes off the wall, pivoting on the bottom edge), not a press.
  - The record's flight is a shallow arc (control point 60 mm above and 150 mm in front of the midpoint), so it never lifts toward the jacket.
  - In T6 the jacket closes off-screen, 1900–3000 ms, after the record is well below it. On eject the board is fully open before the record comes near.
- *Verified:* `tools/rack-clear.mjs` checks every frame of open → go → eject → back and open → back. It runs oriented-box tests between the record, the boards, the flap, the spine, the ledge and the lip, plus nothing behind the wall and the out-above-the-flap rule. No overlaps; the smallest gaps are 0.1 mm (record/back board, record/flap, jacket/ledge).

**2. "When the vinyl is inserted, its colour and surface change."**
- *Causes:*
  - The picture light jumped from the jacket to the platter the moment Go was pressed, and its distance changed (1.25 m → 1.84 m).
  - The record reflected the studio environment, whose strip lights read differently upright and flat.
  - Mid-flight, the turning disc passed through the light's mirror angle and a glare washed over it.
- *Now:*
  - The light keeps **one offset from what it lights**: (−300, +845, +874) mm, so the light level is the same on every jacket, in flight and on the platter.
  - It eases from the jacket to the record over T2. In flight it stays on the record at a fixed 46° to the disc's axis, swinging round the disc's left side as the disc turns (`lightRecord()`), so the mirror angle is never crossed.
  - The Rack's record reflects an even, dim room (`assets.envEven`). The Table's record is unchanged.
  - The camera's look-at now runs on the record's own curve (`--ease-mech`), so the record stays in frame the whole way down and back up.

**3. "In the player the camera should be centred, and the text — it isn't balanced."**
- *Before:* the shot looked at the spindle, 100 mm ahead of it. The plinth's centre is 40 mm right of and 15 mm behind the spindle, so the plinth and the prompt under it sat off-centre.
- *Now:* `turntableFrame()` looks at the plinth's centre and puts it on the vertical centre line. It then solves the height so that the turntable plus the 16 px gap plus the prompt is centred top-to-bottom as one block. The turntable's extent is measured from the plinth's corners and the counterweight. On very wide screens it steps back until that block fits in 84% of the height. The prompt sits 16 px under the turntable's lowest projected edge, centred on the plinth.
- *Checked in `?debug=1`:* plinth centred (< 1.5 px), prompt centred (< 2 px), block centred (< 6 px), prompt clear of the turntable.

**4. "More camera movement while idle."**
- *Float:* about 3× the movement. Amplitudes are ±20 / 12 / 16 mm and ±0.8 / 0.6 / 0.3° (yaw / pitch / roll), periods 6.1 s and 9.7 s, easing in on ω 2.2. It drops out on ω 10 the moment the visitor acts.
- *Parallax:* ±36 / 22 mm.
- On screen the jacket sways about ±21 px sideways and ±15 px vertically at 1440 × 900. Portrait sways sideways at 45%, so the edge keys keep ≥ 13 px.
- The float also runs in READY.
- The overlay now **rides with the float** (`followOverlay()`): the title row, hit target, edge keys (vertical only), confirm panel, prompt and play target move with the scene point they label. The title stays 28 px under the jacket (measured error 0.1 px). It is still render-on-demand: the overlay is written only when it moves ≥ ¼ px.

**Tools added:**
- `tools/rack-clear.mjs`: physical clearance, every frame.
- `tools/rack-film.mjs` (+ `tools/sheet.py`): filmstrips of the open, the transfer and the eject.
- `tools/rack-checks.mjs` now also measures the float on screen and the overlay's tracking.

---

## 17. Feedback round 2 (2026-10-08, as built)

**1. "A softer sound when the jacket opens, not sliding."**
- `gatefold-open` was a 0.9 s band-passed noise sweep at 1.4 kHz, which read as card sliding on card. It is now a book cover opening: a faint crease tick, a low brown-noise swell (low-pass 480 Hz) for the air the board moves, and a muffled landing (150 Hz) as the board comes to rest.
- Offline render: RMS −4.6 dB, brightness (zero-crossing rate) 2 kHz → 0.25 kHz, share of energy in 1–3 kHz 76% → 0.5%.

**2. "The logo should be clear."**
- The cover's reflection no longer crosses the lockup. The Rack's cover environment is now a narrow window strip behind the camera, 7° right of the cover's reflection cone and leaning 15°. Its streak runs up the cover's right side, and the lockup and title sit on the dark room at full contrast.
- The print is a touch less shiny (roughness .68), so the picture light's broad glow over the top of the cover is gone. The gloss now comes from the film (clearcoat), which is sharp.
- The inner faces are drawn at 1024² (were 512²), so the lockup in the open spread is crisp. Only available reports get them; Coming Soon jackets never open.

**3. "Optimise so it doesn't lag."**
- The idle float renders at 30 fps while it is the only motion: half the GPU work when the page sits. It is a drift of ≤ ~10 px/s, so the step is invisible. Glides, the parallax and every tween still run at full rate.
- The picture light's shadow map is 512² (256² coarse), was 1024². Each glide and transfer re-renders it.
- No `backdrop-filter` over the canvas: a blur over a scene that changes every frame is recomputed every frame.
- The text no longer follows the float (see 5), so no per-frame DOM writes except the two invisible hit targets.

**4. "A glitch on the player's circle band."**
- The strobe band's dots were an alpha-tested cut-out, and their hard edges crawled whenever the platter or camera moved. They are now a mip-mapped polar texture on an opaque ring.
- The platter bevel is less mirror-like (roughness .24).
- Frame-to-frame change in the band while it turns: −64%. Over the whole turntable: −28% (`sparkle` heat map, before/after).

**5. "The text should not shift."**
- The title row, edge keys, confirm panel and prompt hold their laid-out place through the float. Only the two invisible click targets follow it.
- A new title crossfades in place; it used to slide ±12 px.
- The float can't bring the jacket onto the text: measured jacket → title gap ≥ 18.7 px over 14 s, and the title moved 0 px.

**6. "A gloss-film effect on the surface, both views."**
- The covers wear a clear film: a clearcoat with a generated normal map (long, low undulations) over a slightly more matte print. See `HOMEPAGE-VINYL-BRIEF.md` §20.

**7. "Ease the camera movement a bit."**
- Float: ±13 / 8 / 10 mm, ±.5 / .38 / .18°, periods 7.6 / 11.9 s, easing in on ω 1.5 and out on ω 5 (was 10, which felt abrupt). That is about ±13 / ±9.5 px of sway, about two-thirds of round 1.
- Parallax: ±24 / 14 mm, ω 2.6.
- Browse glide: 1150 ms (was 950), 5% dolly bump, 2% lead.
- Open: camera 820 ms. Back: camera 780 ms.

**Tools:** `tools/rack-float.mjs` (float on screen, text static, jacket → title gap).

## 18. Feedback round 3 (2026-10-08)

- **"No sound when opening the vinyl."**
  - Opening a jacket (O1–O6) is now silent: no `jacket-pick` and no `gatefold-open`.
  - Still heard: the Coming Soon nudge (`jacket-pick`), closing (`gatefold-close`), and the record leaving and entering the pocket (`sleeve-out`).
  - The `gatefold-open` synth cue stays defined but nothing plays it.
  - Checked: a stubbed `audio.play` records nothing through a whole open, and only `gatefold-close` on Back.

## 19. The shared wall (2026-10-09)

The wall, floor, ledge + lip and fill moved to `views/shared/wall.js` (`wallLayout.js` holds `LEDGE`, `WALL`, `LEAN_DEG`, `REST`, `JACKET_REST`; `views/rack/layout.js` re-exports them). The Rack's `room.js` calls the shared builders with its own spans; `tools/rack-frames.mjs` reads three posed frames straight from the canvas with every time-dependent thing stopped, and the frames before and after the move are identical (0 LSB difference, 1440 × 900 and 390 × 844). The Shelves view (`SHELVES-VIEW-BRIEF.md`) builds its three ledges with the same code.

## 20. The shrink-wrap (2026-10-12)

The cover and the spine wear the shrink-wrap of `GLOSS-FILM-BRIEF.md` (§14 as built; `Home/scene/film.js`): the softbox stays 7° right and 18° up, so its band runs up the leaning cover's right side as the old streak did, now with a framed edge the wrinkles bend. The inner faces are unchanged (laminated prints, the old strip, `coverEnvFront.inner`). Poses, timings, clearance and silence are untouched; `tools/rack-frames.mjs` no longer matches pixel-for-pixel on the jacket itself, by design.
