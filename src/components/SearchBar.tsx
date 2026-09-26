import { useState, useRef, useEffect } from 'react';
import { useSearchStore } from '../store';

export default function SearchBar({ autoFocus }: { autoFocus?: boolean }) {
  const query = useSearchStore(s => s.query);
  const search = useSearchStore(s => s.search);
  const clearResults = useSearchStore(s => s.clearResults);
  const isSearching = useSearchStore(s => s.isSearching);
  const searchByLyrics = useSearchStore(s => s.searchByLyrics);
  const [localQuery, setLocalQuery] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const cancelPending = () => clearTimeout(timerRef.current);

  useEffect(() => { setLocalQuery(query); }, [query]);
  useEffect(() => cancelPending, []);
  useEffect(() => {
    if (autoFocus && !query && window.matchMedia('(hover: hover) and (pointer: fine)').matches) inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = (q: string) => {
    cancelPending();
    const st = useSearchStore.getState();
    if (q.trim() && !(q.trim() === st.query && st.results && !st.isSearching)) search(q);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    cancelPending();
    if (!val.trim()) return clearResults();
    timerRef.current = setTimeout(() => runSearch(val), searchByLyrics ? 600 : 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(localQuery);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    cancelPending();
    setLocalQuery('');
    clearResults();
    inputRef.current?.focus();
  };

  return (
    <form className="relative w-full" onSubmit={handleSubmit} role="search">
      <span aria-hidden className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-2xl pointer-events-none">
        {searchByLyrics ? 'lyrics' : 'search'}
      </span>
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Search"
        placeholder={searchByLyrics ? 'Type a line from the lyrics' : 'What do you want to listen to?'}
        value={localQuery}
        onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Escape') { if (localQuery) handleClear(); else inputRef.current?.blur(); } }}
        className="w-full h-12 sm:h-14 rounded-full bg-surface-container-high border border-transparent pl-12 pr-24 text-base sm:text-lg font-medium text-on-surface placeholder:text-on-surface-variant outline-none transition-colors duration-150 hover:bg-surface-container-highest focus:border-on-surface/30 focus:bg-surface-container-highest [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {isSearching && <span aria-hidden className="w-5 h-5 mr-1 rounded-full border-2 border-on-surface/20 border-t-primary animate-spin" />}
        {localQuery && (
          <button type="button" aria-label="Clear search" onClick={handleClear} className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.08] transition-colors">
            <span aria-hidden className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
    </form>
  );
}
