import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarSortMode = "project" | "time";

interface SidebarSortState {
  sortMode: SidebarSortMode;
  setSortMode: (mode: SidebarSortMode) => void;
}

export const useSidebarSortStore = create<SidebarSortState>()(
  persist(
    (set) => ({
      sortMode: "project" as SidebarSortMode,
      setSortMode: (mode) => set({ sortMode: mode }),
    }),
    {
      name: "sidebar-sort",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
