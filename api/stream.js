export const config = {
  runtime: 'edge',
};

const MIRRORS = [
  'https://pipedapi.kavin.rocks',
  'https://piped.video',
  'https://piped.mha.fi',
  'https://pipedapi.colatube.org',
];

async function fetchStreamInfo(mirror, videoId) {
  const endpoint = `${mirror}/streams/${videoId}`;

  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error(`Mirror ${mirror} failed`);
  const data = await response.json();
  
  if (!data?.audioStreams?.length) throw new Error('No audio streams');

  // Find best audio stream
  const best = data.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  return {
    url: best.url,
    quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
    mimeType: best.format || 'audio/webm',
    bitrate: best.bitrate || 128000,
  };
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  try {
    const streamInfo = await Promise.any(
      MIRRORS.map(mirror => fetchStreamInfo(mirror, id))
    );

    return new Response(JSON.stringify(streamInfo), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to get stream from any mirror' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
