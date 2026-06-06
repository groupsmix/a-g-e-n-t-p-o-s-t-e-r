import { create } from 'zustand'

/**
 * Global UI state. Server data lives in react-query.
 */

interface UiState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
}

export const useUi = create<UiState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}))
