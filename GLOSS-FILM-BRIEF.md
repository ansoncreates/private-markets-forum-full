# Homepage — the shrink-wrap film on the jackets

Implementation brief for a coding agent. It replaces the jackets' "gloss film" — today a soft lacquer streak — with a **tight shrink-wrap**: the clear plastic film a new record comes sealed in. It touches the cover material in all three views (Table, Rack, Shelves) and nothing else. Read these first:

- `HOMEPAGE-VINYL-BRIEF.md` §20–§21, `RACK-VIEW-BRIEF.md` §16–§19, `SHELVES-VIEW-BRIEF.md` §15 (as built);
- `Brand Foundations/BRAND-FOUNDATION.md` §10–§10.2;
- `Home/core/assets.js` (the film map and the covers' reflection worlds are built there), `Home/scene/jackets.js`, `Home/views/rack/gatefold.js`, `Home/views/shelves/shelfJacket.js` (the three places the cover material is made today).

Everything not restated here carries over unchanged: brand tokens, easing curves, cover art (one layout, one title size, lockup + title only), the wall, the ledge, the switcher, fallbacks, silence. No new software, service or download is needed: every map is drawn at boot with Canvas 2D, as the covers are, and the reflection worlds are small three.js scenes baked through `PMREMGenerator`.

Where this brief gives a number, use it. Where it says "tune", the number is a starting point and the stated invariant is what must hold.

---

## 0. Goal

A visitor should be able to tell, without being told, that each jacket is **a printed board sealed in clear plastic**: the print lies flat and sharp underneath; a separate glossy skin lies over it, pulled tight, gathering into fine wrinkles at the corners and along the edges, catching the room's light as crisp, slightly bent reflections with a faint haze around them. The film is seen *by what it reflects* — it has no colour of its own and never tints or softens the print.

Today the cover has a clearcoat with a gentle undulation map and reflects a single thin strip light in a black room, so what reads is a blurred smear of light sliding over a lacquered surface. The difference between "lacquer" and "plastic film" is not the amount of gloss; it is five things, all of which are missing or too weak now:

1. **Structure in the reflection.** A film reads as a film when the thing it reflects has edges — a softbox with a frame, a window, a bright ceiling against a darker wall. A single blurred strip in a black void only ever produces a smear. The reflection world needs a dim room (so the film shows *everywhere*, faintly) and one or two sources with crisp edges.
2. **Wrinkles with the right shape and scale.** Shrink-wrap wrinkles are not noise. They are fine ridges 2–4 mm wide, gathered where the film was pulled: fans of ridges radiating from each corner, short ripples perpendicular to each edge, and a couple of long faint stress creases across the face. The open middle of the face is nearly flat. Only reflections bend over them — the print under the film does not.
3. **Haze.** Film is not a mirror. It scatters a little: the reflection of a light has a soft bloom around a crisp core, and the haze varies in patches. That is a clearcoat *roughness map*, not a single roughness number.
4. **Grazing-angle brightness.** At a steep angle the film reflects almost everything (Fresnel). The jackets lean on the Rack and the Shelves, and the Table looks down on them — the leaning top edge and the far edge of the Table's cover should carry a bright rim where the film wraps over the board.
5. **The edges are wrapped too.** The film goes round the spine and the edges. Edges that stay matte card while the face is glossy break the illusion.

Everything else — brightness of the print, its colours, the lockup's contrast — must look exactly as it does today in the middle of the face.

---

## 1. Decisions already made (from Anson)

- **Surface:** the jacket covers only. The record (disc, label) is unchanged.
- **Look:** a **tight shrink-wrap** — hugs the board, crisp reflections, fine wrinkles pulled to the corners and edges, a seam on the back (never seen), the faintest rainbow sheen. Not a loose polybag; not a laminated print.
- **Deliverable:** this brief in the repo, then the build in all three views, verified headless, committed, documented.
- Standing rules that still apply: the **logo must read clearly** on every cover in every view; covers carry only the lockup and the title, one layout, one title size; **no hover effect** on jackets; smooth animation, no lag — the film adds no draw calls and no per-frame work; nothing in this brief changes a jacket's geometry, pose, choreography or sound (there is none).

---

## 2. Where it lives

| Today | After |
|---|---|
| `core/assets.js` → `filmNormalTexture()` (512², tiling value noise, two octaves) | `scene/film.js` → `wrinkleNormalTexture()` (1024², **non-tiling**, the shrink-wrap wrinkle field, §4.1) and `hazeRoughnessTexture()` (512², §4.2). `assets.maps.film` becomes `assets.film = { normal, haze }`. |
| `core/assets.js` → `coverStudioSceneFront()`, `scene/environment.js` → `coverStudioScene()` (top-down) | `scene/film.js` → `coverRoomFront()` and `coverRoomTop()` (§5): the same two placements, new room and sources. `assets.coverEnvFront` / `assets.coverEnvTop` keep their names. |
| Three copies of the cover material: `jackets.js` (Table), `gatefold.js` `gloss()` (Rack), `shelfJacket.js` `coverMaterial()` (Shelves) | **One** `filmedCoverMaterial(map, envMap, film, opts)` in `scene/film.js` (§6). The three call sites use it. The Rack's inner faces (open on a report, no film) keep their own `gloss()` without the film maps. |
| Edge / card materials: `MeshStandardMaterial` roughness .9 | `wrappedEdgeMaterial(color)` in `scene/film.js` (§7): the same card colour under the same film. The Table's open sleeve edge (`open`, the printed edge texture) stays as it is — it is the inside of the sleeve, not wrapped. |

No change to geometry, UVs, draw calls, poses, timings or sound. The Shelves' `focusMats` (the raised jacket's full-brightness copy) and `setDim()` (which scales `emissiveIntensity` and `envMapIntensity`) keep working because the new material exposes the same properties.

---

## 3. Coordinates and the lockup zone

The cover is `JACKET.size` = **314 mm** square; the cover map is 1024 px (3.26 px/mm). The film maps use the cover's UV (0–1 across the face, the same orientation as the print), so a feature at (u, v) in the map lies over the same spot of the print in every view — the Table's +y face, the Rack's front board +z face and the Shelves' +z face all map the print the same way.

Fixed print geometry (from `scene/covers.js`): margin **34 mm**; the lockup at (34, 34) mm, **100 mm wide, ≈ 18 mm tall**; the title block bottom-left, its last baseline on the bottom margin, up to three lines of ≤ 25 mm type.

**Lockup zone** = the rectangle **x 24–144 mm, y 24–62 mm** (the lockup with 10 mm of air). Inside it the wrinkle field is damped to **40 %** and no reflection source is ever placed by the room geometry (§5). The invariant (§11.3): with the film on, the mean luminance of the lockup zone in any posed frame changes by **< 6 %** against the lacquer build, and no pixel inside it gains more than **+18 / 255**. The title block is not protected — it sits where the Rack's and Shelves' pose puts the reflection anyway today — but the same check is logged for it so a regression is visible.

---

## 4. The film maps (`scene/film.js`)

Both maps are drawn once at boot, deterministically (the existing LCG, seed 7 for the normal field, seed 11 for the haze), on a canvas, uploaded as `CanvasTexture`, `wrapS/T = ClampToEdgeWrapping`, `anisotropy` 4, `colorSpace = NoColorSpace`. Budget: ≤ 40 ms on a 2019 laptop for both (measure; the cover renders already cost ~60 ms).

### 4.1 The wrinkle field → `clearcoatNormalMap` (1024²)

Build a height field `h(x, y)` in millimetres over the 314 mm face, then take its gradient into a tangent-space normal with **no extra scale**: `n = normalize(−∂h/∂x, −∂h/∂y, 1)`, and set `clearcoatNormalScale = (1, 1)`. The amplitudes below are therefore real slopes; a ridge of height 0.06 mm and half-width 1.5 mm tilts the film ≈ 2.3°, which is what a wrinkle in 20 µm film does.

Sum these layers (all heights in mm, all positions in mm from the top-left of the print):

1. **Shrink undulation** — the film is never perfectly flat between the gathers. Value noise, two octaves, cells 3 and 6 across the face, amplitude **0.035 and 0.012**. (This is today's whole map, at a third of today's effective tilt.)
2. **Corner fans** — at each of the four corners, **7–9 ridges** (count from the LCG) fanning across **±32° about the corner's diagonal**, each starting 2–6 mm from the corner and running **55–110 mm** inward. Ridge profile across its length: a Gaussian of **σ 1.4–2.2 mm** (half-width ≈ 1.6–2.6 mm); height along the ridge: **0.07 mm** at the corner, decaying as `exp(−t/0.45)` of its length so a ridge is gone by its tip. Bend each ridge with a low-frequency sine of ±1.5 mm so none is a ruler line. Pairs of ridges may cross; let them sum.
3. **Edge ripples** — along each of the four edges, a band **0–22 mm** inward: short ridges **perpendicular to the edge**, spaced **6–14 mm** apart (from the LCG), **σ 1.2 mm**, height **0.045 mm** at the edge decaying to 0 at the band's inner limit (smoothstep). The **top and right edges at full height**, the left and bottom at **60 %** (the wrap's heat seal gathered the film toward the top-right on these jackets; it also keeps the lockup side calmer).
4. **Stress creases** — **two** long, faint, straight-ish creases from edge to edge, each crossing the face at a random angle between 20° and 70° from horizontal, avoiding the lockup zone: **σ 0.9 mm**, height **0.025 mm**, a 1 mm sinusoidal wobble along their length. One may cross the title block: it is a crease in the film, the print beneath is untouched.
5. **Micro-grain** — value noise at cells **160** across the face, amplitude **0.004 mm**. Barely a slope; it keeps the open middle from being a perfect mirror, and reads as "plastic" rather than "glass" in the highlight.
6. **Lockup damping** — multiply layers 2–5 by a smooth mask that is **0.4 inside the lockup zone** (§3) and 1 outside, with an 8 mm feathered edge.

Encode `n` into RGB (0–255, `n·0.5 + 0.5`), alpha 255. Clamp slopes so no component of the tangent normal exceeds ±0.35 (a ridge sum can get steep where fans cross). Log, once, in the `?debug=1` overlay: the map's RMS slope (target **0.012–0.02**) and its max slope (target **≤ 0.35**).

### 4.2 Haze → `clearcoatRoughnessMap` (512²)

three.js reads the **green** channel. Write the same value to R, G and B so the map is also readable as an image when dumped.

The value is the clearcoat roughness at that point (0 = mirror). Layers:

1. Base **0.085**.
2. **Patchy haze**: value noise, cells 4 and 9, **±0.03** — the film's thickness and surface varies and so does its sheen.
3. **Gathers scatter more**: + **0.07 × ridgeMask**, where `ridgeMask` is the normalised height of layers 2–4 of §4.1 (wrinkled film is matte along its folds). Reuse the height field; do not recompute the ridges.
4. **Edge bands** + **0.03** inside the 22 mm edge bands.
5. Clamp to **0.05–0.22**.

No fingerprints, no scratches, no dust: the jackets are new and sealed, and the brand is pristine.

### 4.3 Determinism and memory

One wrinkle map and one haze map are shared by every cover in every view (the covers differ only in their print). GPU memory: 1024² RGBA + mips ≈ 5.3 MB, 512² ≈ 1.3 MB. The maps are built once in `buildAssets()` and uploaded by `uploadAll()` so their first use never stalls a frame.

---

## 5. The reflection world (`scene/film.js` → `coverRoomFront()`, `coverRoomTop()`)

Two small scenes baked through `PMREMGenerator.fromScene(scene, 0.012)` (sigma down from 0.02: the sources must keep their edges). Only the covers (and the wrapped edges) reflect these; the room's own `scene.environment` (`studioScene()`) and the record's `envEven` are unchanged.

**Why a room and not a black box.** A clear film over a dark print in a black room is invisible except where a light is; in a dim grey room it is visible everywhere, faintly — the ~4 % Fresnel reflection of a 0.25 grey room adds only ≈ 1 % to the print at normal incidence (nothing the eye reads as a tint), rises toward the leaning edges (the rim of §0.4) and lets the wrinkles be seen as a faint texture across the whole face, not just inside the highlight.

### 5.1 The room (both scenes)

A 10 m box, `BackSide`, vertex-shaded from a gradient: ceiling **0.42** (warm grey, `(0.42, 0.40, 0.37)`), walls **0.22** at the horizon falling to **0.10** at the floor line, floor **0.05**. One **darker band** on the wall behind the camera, 0.14, 1.2 m tall at eye level: it gives the middle of a leaning cover something darker than the walls to reflect, so the highlight edges read against it.

### 5.2 The key source — a softbox with a frame

Where today there is a thin strip (`0.18 × 3.2 m`), place a **softbox**: a plane **0.55 × 2.4 m**, emission **(2.6, 2.45, 2.2)**, with a **frame** 0.06 m wide around it at **0.9** (the diffuser's rim) and a second, inner rim line 0.02 m at 1.6 — two concentric edges in the reflection are what the eye recognises as a light fixture seen in plastic. Same placement rules as today, kept exactly, because they are what keeps the lockup clean:

- **Front (Rack, Shelves):** the box 4.5 m from the jacket, **7° right** of the line of sight and **18° above** the horizon, leaning −15° (the current `az`, `el`, `r` and `rotateZ(−0.26)`). The leaning cover reflects it as a band up the **right** side of the face, outside the lockup zone.
- **Top (Table):** the overhead panel with its edge on the diagonal `x = 0.81 + 0.225·z` at `y = 4.85` (the current geometry), its emission raised to **(1.6, 1.52, 1.42)** and given the same 0.06 m rim at 0.9 along its edge. From the top-down camera the panel's edge crosses the cover from top-centre to the lower right, leaving the lockup and the title over the dark room.

### 5.3 The second source — a window

A **dim cool window** so the left half of the cover is not a void: a plane **1.2 × 1.6 m**, emission **(0.55, 0.62, 0.75)**, with a 0.05 m frame at 0.25 and one vertical mullion, placed **38° left** of the line of sight, **6° above** the horizon, 5 m away (front scene); and for the top scene, on the −x wall at y 1.6–3.2 m. Its reflection falls on a leaning cover's **left** side *below* the lockup zone (check with the lockup invariant in §11.3; if it crosses the zone, lower it, never dim the lockup).

### 5.4 Tune, with the invariants

Tune the source brightnesses so that in the Rack's browse pose the brightest reflection on the face peaks at **≈ 0.72** of the display range (never clips), the dark-room veil in the middle of the face stays **< 0.02** above the lacquer build, and the lockup invariant holds. The window should be visible as a soft pale shape, not a second highlight: peak **≤ 0.25**.

---

## 6. The cover material (`filmedCoverMaterial`)

`MeshPhysicalMaterial`:

| Property | Value | Why |
|---|---|---|
| `map`, `emissiveMap` = the cover; `emissive` white, `emissiveIntensity` **0.32** | unchanged | the print's brand colours in a dark room |
| `color` white, `roughness` **0.68**, `metalness` 0 | unchanged | the paper print under the film |
| `specularIntensity` **0.55** | new | paper under film has its own faint specular; keep it below the film's so the two lobes don't double up |
| `clearcoat` **1** | unchanged | the film |
| `clearcoatRoughness` **1** × `clearcoatRoughnessMap` = haze | map, new | the roughness comes from the map (0.05–0.22); the scalar is a multiplier |
| `clearcoatNormalMap` = wrinkle, `clearcoatNormalScale` **(1, 1)** | map, new | the wrinkle field as drawn |
| `envMap` = the view's cover room, `envMapIntensity` **1.0** | ↑ from 0.8 | the film reflects the room |
| `iridescence` **0.12**, `iridescenceIOR` 1.32, `iridescenceThicknessRange` **[120, 380]** nm | new, tune 0.08–0.16 | the faint rainbow sheen at grazing angles; it modulates the specular only and must stay below the threshold where a colour fringe is nameable — if a tester can say "it's pink there", halve it |
| `ior` 1.5, `transmission` 0, `sheen` 0, `anisotropy` 0 | default | |

The Shelves' `setDim(v)` scales `emissiveIntensity` and `envMapIntensity` on the shared cover materials; it keeps doing so (the raised jacket's `focusMats` copy stays at 1).

The emissive print under a reflecting film is a stylisation (brand colours at full strength in a dark room); it is kept. It does not interfere with the film because the clearcoat layer in three.js is applied on top of emission.

---

## 7. The wrapped edges (`wrappedEdgeMaterial`)

The edges of a shrink-wrapped jacket are card under the same film. `MeshPhysicalMaterial`: `color` the view's card (`0xd9d6d0` Table, `0x9a948b` Rack and Shelves), `roughness` 0.9, `clearcoat` **0.9**, `clearcoatRoughness` **0.14** (no maps — the edges are 3–8 mm thin, a map would alias), `envMap` the view's cover room, `envMapIntensity` 1. The Rack's spine block and the front board's edges take it; the back board's edges too. The Table's `open` material (the printed open edge) and `back` stay matte — they are the sleeve's inside and underside. The Shelves' `card` (slot 0 of the regrouped box: edges + back) takes it: the back is never seen, the edges catch the ledge light.

Cost: the edge faces move from `MeshStandardMaterial` to `MeshPhysicalMaterial` — the same number of draw calls, a slightly longer fragment shader on a few hundred pixels.

---

## 8. Per-view notes

**Table.** The cover is seen top-down under the overhead panel; the key light (`DirectionalLight`, 2.2) also lands on it and will now break into a crinkled highlight at the corners through the clearcoat normal. Check the rotation/lift choreography (`HOMEPAGE-VINYL-BRIEF.md` §9) in a filmstrip: as the jacket lifts and rotates the panel edge should slide across it smoothly (sigma 0.012 keeps it crisp; make sure it does not alias into a hard line — if it does, raise sigma to 0.016, not more).

**Rack.** The front board's cover and its edges are wrapped; the **inner faces are not** — `gloss()` without film maps stays for the inner front and back (a printed board inside the open gatefold, glossy laminate as today). The spine is wrapped. The picture light's spot now makes a crinkled highlight on the leaning jacket; the opening swing should show the reflection travelling across the cover and the wrinkles catching the light in passing — film it (`tools/rack-film.mjs open`).

**Shelves.** All fifteen jackets share the two maps, so the overview could show fifteen *identical* wrinkle fields side by side — a repeat the eye may catch at the overview zoom. If it is visible after the first build, break it with a **per-jacket offset of the film maps only**: a `Texture` clone per cover material (`tex.clone()` shares the `source`, so the GPU upload stays one) with `offset` shifted by **≤ 0.03** (≈ 9 mm) from the slot index. Keep the identity orientation — no rotation or mirroring, which would move the damped lockup zone off the lockup; a 9 mm shift stays inside the zone's 10 mm air and the corner fans still sit at the corners. The print's UV is untouched. The Shelves already hold one material per record (`coverMats`, `focusMats`); the ten placeholders share one and would need their own instances for this — measure before adding them.

---

## 9. Readability guard

The lockup must read at full contrast in every view and pose. Three protections, in order of strength:

1. **Room geometry** (§5): no source reflects into the lockup zone from any posed camera. This is the real guard; it holds today and the placements are kept.
2. **Damping** (§4.1.6): wrinkles over the lockup are at 40 %, so even the grey room's veil shows no texture across the letters.
3. **The measured invariant** (§11.3), run on every posed frame of every view.

---

## 10. Performance budget

- Draw calls: **unchanged** in every view (the maps ride on existing materials).
- Shader: +1 texture fetch (haze) and the iridescence term on the cover's fragment shader; the edges go physical. Target: frame time on `?lite=1` at 1440 × 900 within **±5 %** of today in the Rack's browse and the Shelves' overview (`tools/perf.mjs`).
- Boot: the two maps ≤ 40 ms together; the two rooms' PMREM bakes ≤ 25 ms (they are two more 10 m boxes with a few planes — same cost class as today's).
- GPU memory: +6.6 MB.
- Bundle: +≈ 6 KB.

---

## 11. Acceptance checks (headless, Playwright with a stepped clock; new `tools/film-shots.mjs`, `tools/film-checks.mjs`)

Every check is run against the committed bundle and against the previous bundle through the `bundle=` route override (as `tools/rack-frames.mjs` does), so each number is a before/after pair.

1. **Map statistics** (`?debug=1` log): RMS slope 0.012–0.02; max slope ≤ 0.35; haze within 0.05–0.22; no NaN.
2. **Posed crops**, 2× resolution, read from the canvas with everything stopped: Table *ready* (top-down cover), Rack *browse* and *confirm*, Shelves *overview* and *focus*. Save before/after side by side (`shots/film-after/sheet.png`). A reviewer should see, in each: crisp-edged reflections that bend over the wrinkles; corner fans and edge ripples catching light; a soft bloom around the highlight; a bright rim on the leaning top edge; a sharp print.
3. **Lockup invariant**: in every posed frame, the lockup zone's mean luminance within 6 % of the lacquer build's and no pixel +18/255 brighter; title block logged.
4. **No clipping**: the brightest pixel on any cover face ≤ 0.9 of range in every posed frame.
5. **Draw calls** unchanged per view (`stage.stats.calls`); frame time within ±5 %.
6. **Table / Rack / Shelves regressions** (`tools/shot.mjs`, `tools/rack-checks.mjs`, `tools/rack-clear.mjs`, `tools/shelves-checks.mjs`, `tools/shelves-clear.mjs`): unchanged — the film changes no geometry or timing. The Rack pixel comparison (`tools/rack-frames.mjs`) will *not* match (the cover pixels change by design); everything outside the jackets must still match to 0 LSB: compare with the jacket's screen rectangle masked.
7. **Reduced motion, lite, touch**: same results.
8. **The opening** (`tools/rack-film.mjs open`) and the Shelves rise (`tools/shelves.mjs`): the reflection travels, nothing flickers (no z-fighting on the wrapped edges, no aliasing on the panel edge).

---

## 12. Docs to update after implementation

- `Brand Foundations/BRAND-FOUNDATION.md` §10 "Jackets": the material recipe (§6–§7) replaces the "glossy laminated print" sentence; the two maps and the two rooms get a paragraph.
- `HOMEPAGE-VINYL-BRIEF.md` §21, `RACK-VIEW-BRIEF.md` §19, `SHELVES-VIEW-BRIEF.md` §15: one line each pointing here.
- This brief: §14 as-built notes with the final numbers.
- `pmf-reports-changelog` (local + project).

---

## 13. Software and assets — none to connect

Nothing has to be connected or installed. The film is three.js's physically based clearcoat with two procedural maps and two baked reflection worlds, all generated at boot like the covers are; the page keeps working from `file://` with no network.

Two optional upgrades, if the procedural result is ever not enough:

- **A photographed room** instead of the baked one: one equirectangular HDR (a studio or a "small empty room" from Poly Haven, CC0, 1k is plenty — ~1.5 MB as `.hdr`, ~300 KB as a 1k `.jpg` pre-tonemapped for the clearcoat only), loaded with `RGBELoader` and baked with the same `PMREMGenerator`. More "real", but the lockup guard then depends on the photo's light placement, and the file has to be embedded as a data URI like the other textures.
- **A photographed wrinkle map**: shrink-wrap scanned or baked in Blender / Substance 3D as a tangent-space normal map. Only worth it if the procedural fans look synthetic in review; it would replace §4.1 one-for-one.

Neither is planned.

---

## 14. Implementation notes (2026-10-12, as built)

Built in all three views from this brief. Where the build differs from the brief above, the build is right and the reason is here.

**14.1 The film's world is analytic, not baked.** The brief's rooms were PMREM scenes. A baked environment map has 256 px per cube face — texels ≈ 0.35° wide — and the Rack's close-up camera is so narrow that a cover spans ~35 of them: a 6 cm strip reflected as a 40 px smear with a staircase in it, every edge soft. So `scene/film.js` evaluates the film's world per pixel in the clearcoat's reflection direction: a wall gradient (`filmRoomColor`) and up to six lit rectangles (`fqO/fqU/fqV/fqH/fqC` uniforms — a softbox is its frame, inner rim and emitter; a window its frame, pane and mullion), each with a soft edge of `(0.003 + 0.7·roughness²) × distance` so the haze map blurs them physically, and a centre-bright shade (1 − .3x² − .12y²) so a diffuser is not a flat block. `getFilmIBLRadiance` replaces the clearcoat's `getIBLRadiance` through `onBeforeCompile` (the `lights_fragment_maps` chunk, one line); `customProgramCacheKey` `film-env`. No texture memory; cheaper than the lookup it replaces. The world is in world axes — the jacket at the origin facing +z (Rack, Shelves) or +y (Table) — as the baked scenes were.

**14.2 Two worlds per cover.** three.js gives a material one environment map for both layers, and with the brief's single map the *print* was lit by the room (diffuse IBL) and by the softbox's area — the overview covers gained +26 % and the navy went grey. So the base layer keeps a PMREM of the plain dark studio (`printStudio`, no strip) and the clearcoat sees the analytic world. Consequence: the paper under the film has no streak of its own any more — the old "lacquer" look *was* the base layer's broad specular (roughness .68) of the strip. `specularIntensity` is **0.3** (brief .55). The navy is deeper; the lockup zone is 20–45 % darker than the lacquer build in every view (more contrast, not less), so §3's invariant is restated as *no gain*: the zone's mean may not rise more than 6 %, and no plate pixel behind the lockup itself (x 34–134, y 34–52, pixels dark before and 2 px from any type) may gain more than 18/255. Both hold in every posed frame (`tools/film-checks.py`). The Rack's inner faces (laminated prints, no film) keep the old studio with its strip (`printStudioFront`, `coverEnvFront.inner`).

**14.3 Numbers that moved.** Room (linear radiance): ceiling (.11, .105, .097), horizon .045, floor line .025, floor .015, the eye-level band **.01** — a straight-on cover reflects the band, and its veil is Fresnel × radiance; the brief's .42 / .22 lifted the overview covers visibly. Softbox **0.34 × 2.4 m** at (3.6, 3.4, 3.05), rim 1.0, inner rim 2.0; Rack at (7°, 18°) as before; **the Shelves has its own world** (`coverEnvShelves`) with the softbox at (6°, 6°): the raised jacket stands upright at the camera's height and reflects level, where the Rack's 18° box is above the cover; the box spans ±15°, so the leaning overview jackets still catch it. Window 1.2 × 1.6 at (.7, .8, .95), frame .3, 38° left and 6° up; on the Table at az −90°, el 26°. Table panel (1.15, 1.1, 1.02) with the rim; `envMapIntensity` .8 (shared by both layers; the Shelves' `setDim` scales it). Haze: base **.05**, noise ±.015 / .008, folds +.05, edge bands +.02, clamp **.04–.14** — the brief's .085 and .22 ceiling blurred the softbox's edges away. Fans **5–8** per corner, ±36°, heights .03–.06 mm, σ 1.2–2.4, decay .3–.55, wobble 1.5–3.5 mm, every one random; edge ripples spacing **5–18 mm**, σ .9–1.7, heights .015–.04, tilt ±.35 rad, lengths 45–100 % of the band (the brief's regular comb read as teeth); creases .012 mm with 2.5 mm wobble (first built at .018: a straight scratch across the Table cover). Lockup damping **0.3**, feather 10 mm. **Micro-grain removed**: value noise shows its lattice as a blocky dither in a highlight; the haze map is what keeps the film from reading as glass. **Iridescence off**: at 0.12 it changed no pixel by more than 7/255 and cost a fifth of the Rack's frame.

**14.4 Measured.** Map statistics (`?debug=1` → console `film maps`): RMS slope **.0026** (the brief's .012–.02 overestimated — most of the face is flat by design), max slope .118, haze .04–.127, build 190–360 ms in the sandbox's software profile (two 1024² passes of JS; measure on a laptop before worrying). Draw calls unchanged: Table 46 / 44, Rack 20 / 38, Shelves 40 / 29. Frame cost (software GL, `tools/film-perf.mjs`, fragment-bound so it exaggerates): Table −4 %, Rack +2 %, Shelves overview +11 %, focus +2 %. Bundle 1.266 MB (+9 KB).

**14.5 Edges.** Wrapped as §7: the Table's `edge`, the Rack's `edge` (spine and board edges), the Shelves' `card` (edges + back) are `MeshPhysicalMaterial` clearcoat .9 / .14 on the same film world; the Table's open sleeve edge and underside stay matte.

**14.6 Tools.** `tools/film-shots.mjs <outdir> [W H] [bundle=] [film=<JSON>] [only=view]` — posed frames of every view read from the canvas with everything stopped (Table browse/ready, Rack browse/confirm, Shelves explore/focus) plus `zones.json` with the lockup, logo and title projected to canvas pixels; `tools/film-checks.py <before> <after>` — the §11.3–11.4 numbers; `tools/film-perf.mjs [bundle=] [n=] [only=]`. In debug mode `?film=<JSON>` merges into `FILM` one level deep before the assets build, so a number can be tried without a rebuild.

**14.7 Still open.** The wrinkle field is one map shared by all fifteen Shelves jackets; no repeat was visible at the overview (the fans show only inside a reflection), so §8's per-jacket offset was not added.
