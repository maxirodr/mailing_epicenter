import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import SearchFilters from './SearchFilters.tsx';
import type { SearchParams } from '../../hooks/useSearch.ts';

interface SearchBarProps {
  onSearch: (params: SearchParams) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchParams>({});

  function handleQueryChange(value: string) {
    setSearchQuery(value);
    onSearch({ ...filters, q: value });
  }

  function handleFiltersApply(newFilters: SearchParams) {
    setFilters(newFilters);
    onSearch({ ...newFilters, q: searchQuery });
  }

  function handleFiltersClear() {
    setFilters({});
    onSearch({ q: searchQuery });
  }

  return (
    <div className="relative">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Search mail..."
          value={searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-10 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors duration-150 focus:border-blue-500"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors ${
            showFilters ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
          }`}
          title="Advanced filters"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      </div>

      {showFilters && (
        <SearchFilters
          filters={filters}
          onApply={handleFiltersApply}
          onClear={handleFiltersClear}
        />
      )}
    </div>
  );
}
