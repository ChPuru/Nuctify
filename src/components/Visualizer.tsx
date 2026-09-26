import { useEffect, useRef } from 'react';
import { audioEngine } from '../audio/engine';
import { cn } from './ui';

export default function Visualizer({ className, bars = 48, active = true }: { className?: string; bars?: number; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, last = 0, w = 0, h = 0, color = '#fff';
    let data = new Uint8Array(0);
    const heights = new Float32Array(bars);
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = getComputedStyle(canvas).color || color;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33 || document.hidden) return;
      last = now;
      const an = audioEngine.getAnalyser();
      ctx.clearRect(0, 0, w, h);
      if (!an) return;
      if (data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      const usable = Math.floor(data.length * 0.7);
      const gap = 3, bw = Math.max(1, (w - gap * (bars - 1)) / bars);
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const a = Math.floor(Math.pow(i / bars, 1.6) * usable), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / bars, 1.6) * usable));
        let sum = 0;
        for (let j = a; j < b; j++) sum += data[j];
        const target = (sum / (b - a) / 255) * h;
        heights[i] += (target - heights[i]) * (target > heights[i] ? 0.6 : 0.2);
        const bh = Math.max(2, heights[i]);
        ctx.beginPath();
        if ('roundRect' in ctx) ctx.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(bw / 2, 3));
        else (ctx as CanvasRenderingContext2D).rect(i * (bw + gap), h - bh, bw, bh);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [bars, active]);

  return <canvas ref={ref} aria-hidden className={cn('block w-full h-full pointer-events-none', className)} />;
}
