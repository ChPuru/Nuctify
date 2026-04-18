export const config = {
  runtime: 'edge',
};

const MIRRORS = [
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://iv.ggtyler.dev',
  'https://inv.nadeko.net',
  'https://pipedapi.kavin.rocks',
  'https://piped.video',
  'https://piped.mha.fi',
];

async function fetchFromMirror(mirror, query) {
  const isPiped = mirror.includes('piped');
  const endpoint = isPiped 
    ? `${mirror}/search?q=${encodeURIComponent(query)}&filter=videos`
    : `${mirror}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;

  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(6000), // 6s timeout per mirror
  });

  if (!response.ok) throw new Error(`Mirror ${mirror} failed`);
  const data = await response.json();
  
  const items = isPiped ? (data.items || data) : data;
  if (!items || items.length === 0) throw new Error('No items');

  return items.map(item => {
    const videoId = isPiped 
      ? (item.url?.split('v=')[1] || item.url?.split('/').pop() || '')
      : (item.videoId || '');
    
    return {
      id: `yt-${videoId}`,
      title: item.title,
      artist: isPiped ? (item.uploaderName || item.uploader) : item.author,
      duration: item.duration || 0,
      thumbnail: isPiped ? item.thumbnail : (item.videoThumbnails?.[0]?.url || ''),
      source: 'youtube',
      sourceId: videoId,
    };
  });
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400 });
  }

  try {
    // Race all mirrors in parallel
    const tracks = await Promise.any(
      MIRRORS.map(mirror => fetchFromMirror(mirror, query))
    );

    return new Response(JSON.stringify(tracks), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'All mirrors failed or timed out' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
