import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchStore } from '../store';
import { debounce } from '../utils';

export default function SearchBar() {
  const { query, setQuery, search, isSearching } = useSearchStore();
  const [localQuery, setLocalQuery] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

const debouncedSearch = useCallback(
    debounce((q: string) => {
      if (q.trim()) search(q);
    }, 400),
    []
  );

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    setQuery(val);
    debouncedSearch(val);
  };

const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      search(localQuery);
    }
  };

const handleClear = () => {
    setLocalQuery('');
    setQuery('');
    inputRef.current?.focus();
  };

useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

return (
    <form className="relative group w-full" onSubmit={handleSubmit}>
      <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
        <span className="material-symbols-outlined text-primary text-2xl">search</span>
      </div>
      <input
        ref={inputRef}
        type="text"
        className="w-full bg-surface-container-low border-none rounded-2xl py-5 pl-14 pr-16 text-white placeholder:text-outline-variant focus:ring-2 focus:ring-secondary/50 transition-all text-lg font-medium glass-morphism"
        placeholder="Artists, songs, or podcasts (Ctrl+K)"
        value={localQuery}
        onChange={handleChange}
        id="global-search"
      />
      <div className="absolute inset-y-0 right-5 flex items-center gap-2">
        {isSearching && (
           <div className="w-5 h-5 border-2 border-slate-500 border-t-primary rounded-full animate-spin"></div>
        )}
        {localQuery && (
          <button type="button" onClick={handleClear} className="material-symbols-outlined text-slate-500 hover:text-white transition-colors p-1">
            close
          </button>
        )}
      </div>
    </form>
  );
}
