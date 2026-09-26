import { create } from 'zustand';

export interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  enabled: boolean;
  scriptUrl?: string;
  cssUrl?: string;
  code?: string;
}

interface PluginState {
  plugins: Plugin[];
  addPlugin: (plugin: Plugin) => void;
  removePlugin: (id: string) => void;
  togglePlugin: (id: string) => void;
  loadPlugins: () => void;
}

const STORAGE_KEY = 'nuctify_plugins';
const APPROVED_KEY = 'nuctify_plugins_approved';
const loaded = new Set<string>();

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function fingerprint(p: Plugin): string {
  const src = `${p.id}|${p.scriptUrl || ''}|${p.code || ''}`;
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0;
  return `${p.id}:${h}`;
}

const runsCode = (p: Plugin) => !!(p.code || p.scriptUrl);

function isApproved(p: Plugin): boolean {
  const approved = readJson<string[]>(APPROVED_KEY, []);
  return Array.isArray(approved) && approved.includes(fingerprint(p));
}

function setApproved(p: Plugin, on: boolean) {
  const fp = fingerprint(p);
  const approved = readJson<string[]>(APPROVED_KEY, []).filter(x => typeof x === 'string' && !x.startsWith(`${p.id}:`));
  if (on) approved.push(fp);
  localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
}

function confirmCode(p: Plugin): boolean {
  return window.confirm(`Plugin "${p.name}" runs custom code with full access to Nuctify and your data. Only enable plugins you trust. Enable it?`);
}

function loadStored(): Plugin[] {
  const v = readJson<unknown>(STORAGE_KEY, []);
  return Array.isArray(v) ? v.filter((p): p is Plugin => !!p && typeof p === 'object' && typeof (p as Plugin).id === 'string') : [];
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: loadStored(),

  addPlugin: (plugin) => {
    let enabled = plugin.enabled;
    if (enabled && runsCode(plugin)) {
      enabled = confirmCode(plugin);
      setApproved(plugin, enabled);
    }
    const updated = [...get().plugins.filter(p => p.id !== plugin.id), { ...plugin, enabled }];
    set({ plugins: updated });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    get().loadPlugins();
  },

  removePlugin: (id) => {
    const target = get().plugins.find(p => p.id === id);
    const updated = get().plugins.filter(p => p.id !== id);
    set({ plugins: updated });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (target) setApproved(target, false);
    window.location.reload();
  },

  togglePlugin: (id) => {
    const target = get().plugins.find(p => p.id === id);
    if (!target) return;
    const enabling = !target.enabled;
    if (enabling && runsCode(target)) {
      if (!confirmCode(target)) return;
      setApproved(target, true);
    } else if (!enabling) {
      setApproved(target, false);
    }
    const updated = get().plugins.map(p => p.id === id ? { ...p, enabled: enabling } : p);
    set({ plugins: updated });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.location.reload();
  },

  loadPlugins: () => {
    if (typeof document === 'undefined' || window.location.hash === '#mini-player') return;

    get().plugins.forEach(plugin => {
      if (!plugin.enabled || loaded.has(plugin.id)) return;
      if (runsCode(plugin) && !isApproved(plugin)) return;
      loaded.add(plugin.id);

      if (plugin.scriptUrl && /^https:\/\//.test(plugin.scriptUrl)) {
        const script = document.createElement('script');
        script.src = plugin.scriptUrl;
        script.id = `plugin-js-${plugin.id}`;
        document.body.appendChild(script);
      }

      if (plugin.cssUrl && /^https:\/\//.test(plugin.cssUrl)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = plugin.cssUrl;
        link.id = `plugin-css-${plugin.id}`;
        document.head.appendChild(link);
      }

      if (plugin.code) {
        try {
          const fn = new Function(plugin.code);
          fn();
        } catch (e) {
          console.error(`[Plugin] ${plugin.name} failed to execute:`, e);
        }
      }
    });
  }
}));
