const ALLOWED_HOSTS = ['soundcloud.com', 'a-v2.sndcdn.com'];

export default async function handler(req, res) {
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).send('bad url');
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
    return res.status(403).send('forbidden');
  }

  try {
    const upstream = await fetch(target.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(10000),
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).send('upstream error');
  }
}
