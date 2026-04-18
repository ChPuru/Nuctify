// ============================================================
// CORS Proxy — Lightweight proxy server for browser API calls
// Needed because Piped/SoundCloud APIs block cross-origin requests
// ============================================================

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors({ origin: '*' }));

// Proxy handler
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Nuctify/0.1.0',
        'Accept': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.json(data);
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

// Audio stream proxy (pipes the audio data)
app.get('/audio', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Nuctify/0.1.0',
        'Range': req.headers.range || '',
      },
    });

    // Forward headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    res.writeHead(response.status, headers);

    if (response.body) {
      const reader = response.body.getReader();
      const push = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        push();
      };
      push();
    }
  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Audio proxy failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🎵 Nuctify CORS Proxy running on http://localhost:${PORT}`);
});
