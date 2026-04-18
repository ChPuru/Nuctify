export const config = {
  runtime: 'edge',
};

async function safeFetch(url, options, retryWithBridge = true) {
  try {
    const response = await fetch(url, options);
    
    // If blocked or Mirror error, try the bridge
    if ((response.status === 403 || response.status === 429 || response.status >= 500) && retryWithBridge) {
      const bridgeUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      return await fetch(bridgeUrl, options);
    }
    
    return response;
  } catch (error) {
    if (retryWithBridge) {
      const bridgeUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      return await fetch(bridgeUrl, options);
    }
    throw error;
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const text = await response.text();
    
    // Strip headers that trigger browser popups
    const headers = new Headers();
    response.headers.forEach((v, k) => {
      const lowK = k.toLowerCase();
      if (lowK !== 'www-authenticate' && lowK !== 'content-encoding' && lowK !== 'transfer-encoding') {
        headers.set(k, v);
      }
    });
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    return new Response(text, {
      status: response.status,
      headers: headers,
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
