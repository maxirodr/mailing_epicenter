import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  selectedMailboxId: number | null;
  selectedThreadId: number | null;
  composeOpen: boolean;
  searchQuery: string;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedMailboxId: (id: number | null) => void;
  setSelectedThreadId: (id: number | null) => void;
  setComposeOpen: (open: boolean) => void;
  toggleCompose: () => void;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  selectedMailboxId: null,
  selectedThreadId: null,
  composeOpen: false,
  searchQuery: '',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedMailboxId: (id) => set({ selectedMailboxId: id }),
  setSelectedThreadId: (id) => set({ selectedThreadId: id }),
  setComposeOpen: (open) => set({ composeOpen: open }),
  toggleCompose: () => set((s) => ({ composeOpen: !s.composeOpen })),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
