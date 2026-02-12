import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ApiType = 'ollama' | 'gemini' | 'openai';

export interface UserProfile {
  id: string;
  name: string; // e.g., "Personal", "Work", "Testing"
  apiType: ApiType;
  apiUrl: string;
  apiKey: string;
  noAuth?: boolean;
  customApiUrl?: boolean;
  selectedModel: string;
  updatedAt?: number;
}

export type Theme = 'light' | 'dark';
export type Language = 'en' | 'vi';

interface SettingsState {
  // --- Profile State ---
  profiles: UserProfile[];
  activeProfileId: string;
  
  // --- Global Settings ---
  theme: Theme;
  language: Language;
  disableSuggestions: boolean;
  availableModels: string[];

  // --- Profile Actions ---
  addProfile: (profile: UserProfile) => void;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  
  // --- Global Actions ---
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setDisableSuggestions: (disable: boolean) => void;
  setAvailableModels: (models: string[]) => void;

  // --- Legacy Compatibility Getters (Computed properties) ---
  // These are not state, but derived from activeProfile
   getApiUrl: () => string;
  getApiKey: () => string;
  getApiType: () => ApiType;
  getNoAuth: () => boolean;
  getModel: () => string;
  isConfigured: () => boolean;

  // --- Legacy Setters (Proxies to update active profile) ---
  setApiUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setSelectedModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: '',
      theme: 'dark',
      language: 'en',
      disableSuggestions: false,
      availableModels: [],

      // --- Profile Actions ---
      addProfile: (profile) => {
        set((state) => ({
          profiles: [...state.profiles, { ...profile, updatedAt: Date.now() }]
        }));
      },

      updateProfile: (id, updates) => set((state) => ({
        profiles: state.profiles.map(p => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p)
      })),

      deleteProfile: (id) => set((state) => {
        const newProfiles = state.profiles.filter(p => p.id !== id);
        // If deleting active, switch to the first available or empty
        let newActive = state.activeProfileId;
        if (id === state.activeProfileId) {
           newActive = newProfiles.length > 0 ? newProfiles[0].id : '';
        }
        return { profiles: newProfiles, activeProfileId: newActive };
      }),

      setActiveProfile: (id) => set({ activeProfileId: id }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setDisableSuggestions: (disableSuggestions) => set({ disableSuggestions }),
      setAvailableModels: (models) => set({ availableModels: models }),

      // --- Computed Helpers ---
      // Used by API calls to get current credentials
      getApiUrl: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        return active?.apiUrl || ''; // Default/Fallback
      },
      getApiKey: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        return active?.apiKey || '';
      },
      getApiType: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        return active?.apiType || 'openai';
      },
      getNoAuth: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        return !!active?.noAuth;
      },
      getModel: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        return active?.selectedModel || 'gemini-2.5-flash';
      },
      isConfigured: () => {
        const { profiles, activeProfileId } = get();
        const active = profiles.find(p => p.id === activeProfileId);
        if (!active) return false;
        const apiAuthValid = active.noAuth || active.apiKey?.trim();
        return !!(apiAuthValid && active.apiUrl?.trim() && active.selectedModel?.trim());
      },

      // --- Legacy Setters (Update the ACTIVE profile) ---
      setApiUrl: (url) => set((state) => ({
        profiles: state.profiles.map(p => p.id === state.activeProfileId ? { ...p, apiUrl: url, updatedAt: Date.now() } : p)
      })),
      setApiKey: (key) => set((state) => ({
        profiles: state.profiles.map(p => p.id === state.activeProfileId ? { ...p, apiKey: key, updatedAt: Date.now() } : p)
      })),
      setSelectedModel: (model) => set((state) => ({
        profiles: state.profiles.map(p => p.id === state.activeProfileId ? { ...p, selectedModel: model, updatedAt: Date.now() } : p)
      })),
    }),
    {
      name: 'vibriona-settings',
    }
  )
);
