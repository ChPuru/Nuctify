export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get('url');

  if (!baseUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const targetUrlObj = new URL(baseUrl);
    searchParams.forEach((value, key) => {
      if (key !== 'url') {
        targetUrlObj.searchParams.set(key, value);
      }
    });
    const targetUrl = targetUrlObj.toString();

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://nuctify.vercel.app/',
        'Origin': 'https://nuctify.vercel.app',
      },
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Proxy failed to fetch target',
      message: error.message,
      url: baseUrl 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
