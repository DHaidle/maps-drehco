// api/projects.js — Vercel serverless function
// Handles CRUD for map_projects table in Supabase
// GET    /api/projects         → list all projects
// GET    /api/projects?id=X    → get one project (with zip_list)
// POST   /api/projects         → create or update a project
// DELETE /api/projects?id=X   → delete a project

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service key server-side

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || '',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET — list all or fetch one ─────────────────────────────────────
    if (req.method === 'GET') {
      const { id } = req.query;

      if (id) {
        // Fetch single project (includes zip_list and shapes)
        const r = await sb(`/map_projects?id=eq.${encodeURIComponent(id)}&select=*`);
        if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch project' });
        const projects = r.data;
        if (!projects || !projects.length) return res.status(404).json({ error: 'Project not found' });
        return res.status(200).json(projects[0]);
      }

      // List all — omit zip_list for speed (large arrays)
      const r = await sb('/map_projects?select=id,name,zip_count,created_at,updated_at&order=updated_at.desc');
      if (!r.ok) return res.status(r.status).json({ error: 'Failed to list projects' });
      return res.status(200).json(r.data || []);
    }

    // ── POST — create or update ─────────────────────────────────────────
    if (req.method === 'POST') {
      const { id, name, shapes, zip_list, zip_count } = req.body;

      if (!name) return res.status(400).json({ error: 'name is required' });

      const payload = {
        name,
        shapes: shapes || [],
        zip_list: zip_list || [],
        zip_count: zip_count || 0,
        updated_at: new Date().toISOString(),
      };

      let r;
      if (id) {
        // Update existing
        r = await sb(
          `/map_projects?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            prefer: 'return=representation',
            body: JSON.stringify(payload),
          }
        );
        if (!r.ok) return res.status(r.status).json({ error: 'Failed to update project', detail: r.data });
        const updated = Array.isArray(r.data) ? r.data[0] : r.data;
        return res.status(200).json({ id: updated?.id || id, name });
      } else {
        // Insert new
        r = await sb('/map_projects', {
          method: 'POST',
          prefer: 'return=representation',
          body: JSON.stringify(payload),
        });
        if (!r.ok) return res.status(r.status).json({ error: 'Failed to create project', detail: r.data });
        const created = Array.isArray(r.data) ? r.data[0] : r.data;
        return res.status(201).json({ id: created?.id, name });
      }
    }

    // ── DELETE ──────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const r = await sb(`/map_projects?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) return res.status(r.status).json({ error: 'Failed to delete project' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('[projects]', err);
    return res.status(500).json({ error: err.message });
  }
}
