export const config = {
  runtime: 'edge',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

async function safeFetch(url, options) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const headers = { ...options.headers, 'User-Agent': ua };

  // 1. Primary Attempt: Direct Fetch from Vercel Edge
  try {
    const response = await fetch(url, { ...options, headers });
    if (response.ok && response.status !== 403) return response;
    
    // 2. Secondary Attempt: corsproxy.io Bridge
    console.log(`[Proxy] Direct failed (${response.status}), trying corsproxy.io`);
    const bridge1 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const resp1 = await fetch(bridge1, { ...options, headers });
    if (resp1.ok) return resp1;

    // 3. Third Attempt: allorigins.win Bridge
    console.log(`[Proxy] Bridge 1 failed, trying allorigins`);
    const bridge2 = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const resp2 = await fetch(bridge2, { ...options, headers });
    if (resp2.ok) {
      const data = await resp2.json();
      return new Response(data.contents, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return response; // Return the original error if all fail
  } catch (error) {
    console.error(`[Proxy] Fatal error: ${error.message}`);
    // Final fallback to bridge
    try {
      const bridge = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      return await fetch(bridge, { ...options, headers });
    } catch {
      throw error;
    }
  }
}

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

    const response = await safeFetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const text = await response.text();
    
    const resHeaders = new Headers();
    response.headers.forEach((v, k) => {
      const lowK = k.toLowerCase();
      if (!['www-authenticate', 'content-encoding', 'transfer-encoding', 'content-security-policy'].includes(lowK)) {
        resHeaders.set(k, v);
      }
    });
    
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 's-maxage=600, stale-while-revalidate');

    return new Response(text, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Proxy failure',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
