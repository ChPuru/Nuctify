export type Theme = 'midnight' | 'amoled' | 'forest' | 'ocean' | 'candy' | 'sunset' | 'mono' | 'custom';

const base = (bg: string, low: string, mid: string, high: string, highest: string, outline: string, onSurface = '#f5f5f7', muted = '#a1a1aa') => ({
  '--background': bg,
  '--surface': bg,
  '--on-surface': onSurface,
  '--on-surface-variant': muted,
  '--surface-container-low': low,
  '--surface-container': mid,
  '--surface-container-high': high,
  '--surface-container-highest': highest,
  '--outline': outline,
  '--outline-variant': highest,
});

export const THEMES: Record<Exclude<Theme, 'custom'>, Record<string, string>> = {
  midnight: { '--primary': '#ba9eff', '--secondary': '#53ddfc', '--tertiary': '#ec63ff', ...base('#0c0c10', '#131318', '#1a1a20', '#222229', '#2b2b33', '#6f6e78') },
  amoled: { '--primary': '#ba9eff', '--secondary': '#53ddfc', '--tertiary': '#ec63ff', ...base('#000000', '#0a0a0a', '#121212', '#1a1a1a', '#242424', '#4a4a4a', '#ffffff') },
  forest: { '--primary': '#6ee7b7', '--secondary': '#34d399', '--tertiary': '#10b981', ...base('#07140f', '#0b1c16', '#10251d', '#152f25', '#1c3b2f', '#3d6456', '#ecfdf5', '#9fbcb0') },
  ocean: { '--primary': '#7dd3fc', '--secondary': '#38bdf8', '--tertiary': '#0ea5e9', ...base('#06121a', '#0a1a24', '#0e2330', '#132d3c', '#19384a', '#3d6275', '#f0f9ff', '#9db6c4') },
  candy: { '--primary': '#f9a8d4', '--secondary': '#f472b6', '--tertiary': '#db2777', ...base('#150b11', '#1e1018', '#281520', '#321b29', '#3e2233', '#6e4a5c', '#fdf2f8', '#c0a3b3') },
  sunset: { '--primary': '#fdba74', '--secondary': '#fb7185', '--tertiary': '#f97316', ...base('#130d0a', '#1b1310', '#241915', '#2e201b', '#3a2922', '#6f5a50', '#fff7ed', '#c2afa5') },
  mono: { '--primary': '#f4f4f5', '--secondary': '#a1a1aa', '--tertiary': '#d4d4d8', ...base('#0a0a0a', '#111111', '#181818', '#202020', '#2a2a2a', '#5a5a5a', '#fafafa', '#a3a3a3') },
};

const toChannels = (hex: string) => {
  const h = hex.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(h) ? `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}` : hex;
};

const onColor = (hex: string) => {
  const c = toChannels(hex).split(' ').map(Number);
  if (c.length !== 3 || c.some(isNaN)) return '12 12 16';
  const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '12 12 16' : '255 255 255';
};

export function applyTheme(theme: Theme, customColor?: string) {
  const root = document.documentElement;
  let colors: Record<string, string>;
  if (theme === 'custom') {
    let color = customColor;
    if (!color) try { color = localStorage.getItem('nuctify_custom_color') || undefined; } catch {}
    color = color || '#ba9eff';
    colors = { ...THEMES.midnight, '--primary': color };
    try { localStorage.setItem('nuctify_custom_color', color); } catch {}
  } else {
    colors = THEMES[theme as Exclude<Theme, 'custom'>] ?? THEMES.midnight;
  }
  for (const [prop, value] of Object.entries(colors)) root.style.setProperty(prop, toChannels(value));
  root.style.setProperty('--on-primary', onColor(colors['--primary']));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors['--background']);
  try { localStorage.setItem('nuctify_theme', theme); } catch {}
}
