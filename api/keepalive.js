// Daily Vercel cron: one tiny read so the free Supabase project never hits the 7-day inactivity pause.
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).send('supabase env missing');

  try {
    const r = await fetch(`${url}/rest/v1/shared_playlists?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.status(r.ok ? 200 : 502).send(r.ok ? 'ok' : `supabase ${r.status}`);
  } catch {
    return res.status(502).send('supabase unreachable');
  }
}
