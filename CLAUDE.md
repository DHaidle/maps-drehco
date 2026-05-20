# ZIP Code Map Tool
**Last updated:** May 20, 2026
**Live URL:** https://maps.drehco.com

---

## What This Is

A single-page map tool for drawing territory shapes and generating ZIP code lists.
Draw a polygon, rectangle, or circle on the map → instantly see every US ZIP code whose centroid falls inside → export as CSV or save the project to Supabase.

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
| `SUPABASE_URL` | Supabase project URL (same project as Happy Path, or new one) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key — used server-side in api/projects.js |

The **front-end** uses NO Supabase credentials directly — all DB access goes through the `/api/projects` endpoint.

---

## Database — Supabase

Uses the same Supabase project as Happy Path (or create a new one — your choice).

### Create the table (run once in Supabase SQL editor)
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
| `data/zip_centroids.json` | 41,898 US ZIP centroids `[zip, lat, lng, city, state]` — served as static file |
| `package.json` | Minimal Node config |
| `vercel.json` | Cache headers for zip data, API routing |
| `CLAUDE.md` | This file |

---

## ZIP Data

Source: `zipcodes` Python package (derived from USPS/Census data, public domain).
Format: JSON array of `[zip_code, lat, lng, city, state]`, 1.74MB.

To regenerate:
```bash
pip install zipcodes
python3 -c "
import zipcodes, json
data = [[z['zip_code'], round(float(z['lat']),4), round(float(z['long']),4), z['city'], z['state']]
        for z in zipcodes.list_all() if float(z['lat']) != 0]
with open('data/zip_centroids.json','w') as f: json.dump(data, f, separators=(',',':'))
print(len(data), 'ZIPs written')
"
```

---

## Architecture Notes

- ZIP lookup is entirely **client-side** using Turf.js `booleanPointInPolygon`
- ZIP data is fetched once on page load from `/data/zip_centroids.json` (Vercel static)
- Projects (shapes + ZIP lists) are saved to Supabase via `/api/projects`
- Multiple shapes per project are supported — ZIP union is computed across all shapes
- Circle shapes are stored as `{type:'Circle', center, radius}` and reconstructed on load

---

## How to Use

1. Draw a shape (polygon / rectangle / circle) using the toolbar on the left of the map
2. ZIP codes appear instantly in the right panel
3. Add more shapes to the same project — ZIPs update automatically
4. Give the project a name in the header, click **Save Project**
5. Switch to **Projects** tab to reload, download, or delete saved projects
6. Click **Export CSV** to download a CSV with ZIP, City, State columns

---

## NEXT SESSION / Future Ideas

- Show ZIP count per shape (not just total)
- Radius display when drawing circles (e.g. "50 miles from Chicago")
- Search/jump to a city or ZIP on the map
- Upgrade to ZCTA boundary polygons (PostGIS in Supabase) for exact edge accuracy
- Share a project via URL (public read link with token)
- Color each shape's ZIPs differently in the list

---

## Setup Checklist (first deploy)

- [ ] Create local folder: `/Users/david/TLS Route with Driver Pay/maps-drehco/`
- [ ] Copy files into folder
- [ ] `git init`, commit, push to new GitHub repo `DHaidle/maps-drehco`
- [ ] Connect repo to new Vercel project
- [ ] Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars in Vercel
- [ ] Run `CREATE TABLE map_projects...` SQL in Supabase
- [ ] Add custom domain `maps.drehco.com` in Vercel
- [ ] Update DNS at your domain registrar (CNAME → cname.vercel-dns.com)
- [ ] Update `SUPABASE_URL` and `SUPABASE_KEY` constants in `index.html` (front-end display only — not sensitive since all real DB calls go through the API)
