import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<string | null>>();

const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

function sample(img: HTMLImageElement): string | null {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, size, size).data; } catch { return null; }
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const weight = 0.05 + s * s * (1 - Math.abs(l - 0.5) * 1.6);
    if (weight <= 0) continue;
    r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; w += weight;
  }
  if (!w) return null;
  const [h, s, l] = rgbToHsl(r / w, g / w, b / w);
  const [nr, ng, nb] = hslToRgb(h, Math.min(s, 0.7), Math.min(Math.max(l, 0.28), 0.42));
  return toHex(nr, ng, nb);
}

export function getDominantColor(imageUrl?: string | null): Promise<string | null> {
  if (!imageUrl || typeof document === 'undefined') return Promise.resolve(null);
  const hit = cache.get(imageUrl);
  if (hit) return hit;
  const p = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); try { resolve(sample(img)); } catch { resolve(null); } };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = imageUrl;
  });
  cache.set(imageUrl, p);
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return p;
}

export function useDominantColor(imageUrl?: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getDominantColor(imageUrl).then((c) => { if (alive) setColor(c); });
    return () => { alive = false; };
  }, [imageUrl]);
  return color;
}
