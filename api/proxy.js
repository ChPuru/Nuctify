export default async function handler(req, res) {
  const { url: baseUrl } = req.query;

  if (!baseUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Reconstruct the full URL including all other query parameters
  const urlObj = new URL(baseUrl);
  Object.keys(req.query).forEach(key => {
    if (key !== 'url') {
      urlObj.searchParams.set(key, req.query[key]);
    }
  });

  const targetUrl = urlObj.toString();

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://nuctify.vercel.app',
        'Referer': 'https://nuctify.vercel.app/',
      },
    });

    const data = await response.json().catch(() => null);
    
    if (data === null) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
