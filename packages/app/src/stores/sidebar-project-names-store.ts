import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarProjectNamesState {
  namesByProjectKey: Record<string, string>;
  setProjectName: (projectKey: string, name: string) => void;
  clearProjectName: (projectKey: string) => void;
  getProjectName: (projectKey: string) => string | undefined;
}

export const useSidebarProjectNamesStore = create<SidebarProjectNamesState>()(
  persist(
    (set, get) => ({
      namesByProjectKey: {},
      setProjectName: (projectKey, name) =>
        set((state) => ({
          namesByProjectKey: { ...state.namesByProjectKey, [projectKey]: name },
        })),
      clearProjectName: (projectKey) =>
        set((state) => {
          const { [projectKey]: _, ...rest } = state.namesByProjectKey;
          return { namesByProjectKey: rest };
        }),
      getProjectName: (projectKey) => get().namesByProjectKey[projectKey],
    }),
    {
      name: "sidebar-project-names",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
