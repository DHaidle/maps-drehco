# ZIP Code Map Tool
**Last updated:** May 20, 2026
**Live URL:** https://maps.drehco.com

---

## What This Is

A single-page map tool for drawing territory shapes and generating ZIP code lists.
Draw a polygon, rectangle, or circle → instantly see every US ZIP code whose centroid falls inside → export as CSV or save to Supabase.

**Also supports importing carrier service area files** (two formats):
- **Area/Route Import** — simple zone assignments (Start Postal Code, End Postal Code, Area/Route)
- **Service Area Import** — carrier → terminal hierarchy with ZIP ranges and Alt carrier columns

---

## Deployment

| What | Where |
|---|---|
| **Live URL** | https://maps.drehco.com |
| **Vercel project** | https://vercel.com/david-haidle-s-projects/maps-drehco |
| **GitHub repo** | https://github.com/DHaidle/maps-drehco |
| **Vercel ↔ GitHub** | Connected — push to `main` → auto-deploys in ~10 seconds |

### How to deploy a change
```bash
cd "/Users/david/TLS Route with Driver Pay/maps-drehco"
rm -f .git/index.lock .git/HEAD.lock
git add .
git commit -m "describe what changed"
git push origin main
```

---

## Environment Variables (Vercel)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key — used server-side in api/projects.js only |

The front-end uses NO Supabase credentials directly — all DB access goes through `/api/projects`.

---

## Database — Supabase

```sql
CREATE TABLE map_projects (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now(),
  name        text      NOT NULL,
  shapes      jsonb,
  zip_list    text[],
  zip_count   integer   DEFAULT 0
);
```

---

## Files

| File | Description |
|---|---|
| `index.html` | Entire front-end — Leaflet map, draw tools, ZIP panel, project management |
| `api/projects.js` | Vercel serverless function — CRUD for map_projects in Supabase |
| `data/zip_centroids.json` | 41,898 US ZIP centroids `[zip, lat, lng, city, state]` — 1.74MB static |
| `package.json` | `"node": "24.x"` |
| `vercel.json` | Cache headers for zip data, API routing |
| `CLAUDE.md` | This file |

---

## Architecture

- ZIP lookup is **client-side** using Turf.js `booleanPointInPolygon`
- ZIP data fetched once on load from `/data/zip_centroids.json`
- Projects saved to Supabase via `/api/projects`
- Multiple shapes per project — ZIP union computed across all shapes
- Circle shapes stored as `{type:'Circle', center, radius}` and reconstructed on load
- Geographic clustering uses **manual union-find with haversine distance** (no turf.clustersDbscan — not in CDN build)
- Convex hulls per geographic cluster — same color, same name, stored in `extraLayers[]` on the shape object

---

## Key State Variables

```javascript
let zipData   = [];          // [[zip, lat, lng, city, state], ...]
let shapes    = [];          // see Shape Object below
let shapeZips = {};          // { shapeId: [zip, ...] }
let zipResult = [];          // current visible ZIP list
let activeTab = 'zips';
let shapeSort = 'alpha';     // 'alpha' | 'geo' (NE→SW)
let currentProjectId = null;
let showAllMode    = true;
let focusedShapeIds = new Set();
let showUnassignedOnly = false;  // COMMENTED OUT — pending UX review
```

### Shape Object
```javascript
{
  id,           // unique string
  layer,        // Leaflet layer (the draw shape or hull polygon)
  extraLayers,  // [] — additional hull polygons for same shape (geographic clusters)
  color,        // terminal shade hex (e.g. '#3A6EA5')
  carrierColor, // carrier base hex (e.g. '#2E75B6')
  label,        // terminal name (e.g. 'JKSI (Jackson Trucking)')
  carrier,      // carrier name (e.g. 'Jackson Trucking Company INC') — null for drawn shapes
  imported,     // true for imported shapes
}
```

---

## Layer Groups

```javascript
const focusDotLayer      = L.layerGroup().addTo(map);  // ZIP centroid dots when focused
const conflictMarkerLayer = L.layerGroup().addTo(map); // red conflict dots (hidden in show-all)
```

---

## Colors

```javascript
const SHAPE_COLORS = ['#2E75B6','#ED7D31','#375623','#C00000','#7030A0','#00B0F0','#FF6600'];
// One color per carrier. Terminals within a carrier get HSL lightness shades of that color.

function generateShades(baseHex, n)  // returns n hex colors ranging from darker to lighter
function hexToHsl(hex)               // hex → [h, s, l]
function hslToHex(h, s, l)          // [h, s, l] → hex
```

---

## Import — Service Area Format

**File structure:**
- Row 1: `"Service Area"` (title)
- Row 2: headers
- Row 3+: data

**Columns (0-indexed):**
```
0:Country  1:From Zip  2:To Zip  3:City  4:State
5:Carrier  6:From/To Point (= terminal name)  7:Days In  8:Days Out
9:Carrier Alt1  10:From/To Point Alt1  11:Days In Alt1  12:Days Out Alt1
13:Carrier Alt2  14:From/To Point Alt2  ... (up to Alt4, cols 21-24)
25:Added By  26:Added On  27:Modified By  28:Modified On  (ignored on import)
```

**How `processServiceAreaCSV` works:**
1. Builds `carrierGroups`: `{ carrierName: { terminals: {termName: Set<zip>}, terminalOrder: [] } }`
2. `expandZips(fromZip, toZip, state)` — handles individual ZIP, ZIP range (string compare), or state-level (all centroids for that state)
3. Alt cols `[[9,10],[13,14],[17,18],[21,22]]` — same ZIPs added to each non-empty alt carrier/terminal
4. One `SHAPE_COLORS` color per carrier; `generateShades(carrierColor, n)` for n terminals
5. Each terminal → one shape with `{ carrier, label: termName, color: shade, carrierColor, imported: true }`
6. Convex hull computed per terminal's ZIP cluster (union-find clustering, max 500km distance)

---

## Import — Area/Route Format

**Columns:** `Start Postal Code`, `End Postal Code`, `Area/Route`
- Row 1 may be a title row (detected if row doesn't look like a header/data row)
- ZIPs are treated as individual (From = To), or range if From ≠ To

---

## Display Modes

### Show All (default)
- All hull polygons visible (`opacity:1, fillOpacity:0.15`)
- No dots of any kind
- Conflict markers hidden (list in panel is sufficient)

### Focus Mode (carrier or terminal clicked)
- All hulls hidden (`opacity:0, fillOpacity:0`)
- ZIP centroid dots shown in `focusDotLayer` — colored per terminal
- Multiple terminals can be selected simultaneously (toggle click)
- Clicking carrier header selects/deselects all its terminals

### Key functions
```javascript
focusArea(id)           // toggle single terminal; renders dots for all selected
focusCarrier(name)      // toggle all terminals under a carrier
setShowAll(val)         // restore hull view, clear dots, reset focus state
```

**IMPORTANT:** On import, both import functions now explicitly call:
```javascript
focusDotLayer.clearLayers();
conflictMarkerLayer.clearLayers();
showAllMode = true;
focusedShapeIds.clear();
```
This prevents stale dots from a previous focus session persisting after a new import.

**IMPORTANT:** `renderConflictMarkers()` respects `showAllMode` when creating markers:
```javascript
const visible = !showAllMode;
// markers created with opacity:0 when in show-all mode
```

---

## Conflict Detection

- A ZIP assigned to 2+ terminals is a **conflict**
- `conflictData = { zip: [shapeId, shapeId, ...] }` — built by `computeAndRenderConflicts()`
- Shown as red dot markers on map **only in focus mode**
- In show-all mode: conflict count + ZIP list shown in panel only (no map dots)
- Right-click (or click) a conflict marker → context menu to reassign the ZIP

---

## Export

### Service Area export (when imported shapes exist)
**Current behavior:** outputs individual ZIP rows with empty Alt columns — **THIS IS THE NEXT BUG TO FIX** (see below)

```
Service Area                        ← title row
"Country","From Zip","To Zip",...   ← full header with all Alt cols
"US","20601","20601","Waldorf","MD","Carrier","Terminal","0","0","","","","",...
```

### Area/Route export (drawn shapes)
```
"Start Postal Code","End Postal Code","Area/Route"
"20601","20601","My Area"
```

---

## ✅ COMPLETED THIS SESSION: Fix Service Area Export Alt Carriers

**Status: DONE and deployed.**

**Root cause found:** `processServiceAreaCSV` populated `zipAltData` during the row-parsing loop, but then the confirm-dialog + clear-state block ran `zipAltData = {}` AFTER the loop, wiping all the captured data.

**Fix:** Used a local variable `localAltData` during parsing, then assigned `zipAltData = localAltData` after the reset block. Alt carrier cols now export correctly.

**Global added:** `let zipAltData = {};` — `{ zip: [[altCarrier, altTerminal], ...] }` — populated on Service Area import, read back on export. Cleared to `{}` on Area/Route import.

---

## Geographic Clustering (convex hull)

```javascript
function clusterByDistance(points, maxDistKm = 500)
// Union-find: groups [lat,lng] points where any two in a group are within maxDistKm
// Returns array of arrays (clusters)
// Used to split geographically distant ZIP groups into separate hull polygons
// Fixes the "Hawaii triangle" problem where distant ZIPs produced a single giant polygon
```

Fallbacks:
- 1 point → `L.circleMarker` (small dot)
- 2 points → `L.polyline`
- 3+ points → `turf.convex()` → `L.polygon`

---

## Shapes Bar Rendering

In carrier mode (any shape has `.carrier`), the bar renders:
```
● Carrier Name (N terminals)          ← carrier-header, clickable, calls focusCarrier()
    [Terminal Chip (459) ×]           ← terminal-chip (margin-left:12px), calls focusArea()
```

In flat mode (drawn shapes), renders plain chips.

Sort options: A–Z (default) | NE → SW (geographic, by centroid lat-lng).

---

## Known Issues / Deferred

| Issue | Status |
|---|---|
| Export Alt carrier cols empty | ✅ Fixed — `localAltData` bug resolved |
| Conflict dots showing in show-all mode | ✅ Fixed — `renderConflictMarkers` respects `showAllMode`; import resets focus state |
| Terminal color separation too narrow | ✅ Fixed — wider lightness spread + saturation variation (`minL-32` to `maxL+38`, min 50 units) |
| **Manual Service Area creation** | **NEXT PRIORITY** — see below |
| Unassigned Only feature | Commented out — needs UX rethink |
| Local save (localStorage) | User asked to pause — not built |
| ZCTA exact boundaries (PostGIS) | Deferred — requires server-side tile queries |
| ZIP count per shape in panel | Future idea |
| Radius display while drawing circle | Future idea |
| Search/jump to city or ZIP | Future idea |
| Share project via URL token | Future idea |

---

## ⚠️ NEXT SESSION — TOP PRIORITY: Manual Service Area Creation

**Context:** New customers who don't yet have a TLS export CSV need a way to start a Service Area map from scratch. Carrier and terminal names come from TLS, so they can't be arbitrary.

**Agreed UX:**
- A popup/modal appears when the user wants to create a new Service Area manually
- Message: *"Service Area maps are best started from a TLS import. To begin manually, enter a carrier, terminal, and at least one ZIP code."*
- Fields: **Carrier name**, **Terminal name**, **ZIP code(s)**
- Buttons: **Create** (requires all three + at least one valid ZIP) | **Start** (skips setup, draws freely in Area/Route style)
- On **Create**: bootstraps the same carrier→terminal structure as an import — colored chip in sidebar, convex hull on map, exportable in Service Area format

**Where the trigger lives:** TBD — options are:
1. A **"New Service Area"** button next to the Service Area Import button
2. Clicking Service Area Import → if no file selected → show this modal
3. A dropdown on the import button

**Implementation approach:**
- Modal HTML added to `index.html`
- On submit: runs same shape-building logic as the tail of `processServiceAreaCSV` — creates one carrier, one terminal, assigns ZIPs, draws convex hull, sets `zipAltData`
- Alt 1–4 fields: optional, expandable (+ button adds another row)
- Validation: carrier + terminal required, at least 1 ZIP must exist in `zipData`

---

## Setup Checklist (first deploy — already done)

- [x] Create local folder: `/Users/david/TLS Route with Driver Pay/maps-drehco/`
- [x] `git init`, commit, push to GitHub repo `DHaidle/maps-drehco`
- [x] Connect repo to Vercel project
- [x] Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars in Vercel
- [x] Run `CREATE TABLE map_projects...` SQL in Supabase
- [x] Add custom domain `maps.drehco.com` in Vercel
- [x] Update DNS at registrar (CNAME → cname.vercel-dns.com)
