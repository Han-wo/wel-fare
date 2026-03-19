import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  birthDate?: string;
  gender?: string;
  sidoCode?: string;
  sigunguCode?: string;
  householdType?: string;
  householdCount?: number;
  occupationType?: string;
  incomeBracket?: number;
  isHomeowner?: boolean;
  isDisabled?: boolean;
  isVeteran?: boolean;
  isSingleParent?: boolean;
  hasChildren?: boolean;
  childrenCount?: number;
}

interface UserStore {
  _hasHydrated: boolean;
  accessToken: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  profile: UserProfile | null;
  setAuth: (token: string, userId: string, name: string, role?: string) => void;
  setProfile: (profile: UserProfile) => void;
  clearAuth: () => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      accessToken: null,
      userId: null,
      userName: null,
      userRole: null,
      profile: null,
      setAuth: (accessToken, userId, userName, userRole = 'USER') =>
        set({ accessToken, userId, userName, userRole }),
      setProfile: (profile) => set({ profile }),
      clearAuth: () =>
        set({ accessToken: null, userId: null, userName: null, userRole: null, profile: null }),
    }),
    {
      name: 'welfare-user',
      onRehydrateStorage: () => (state) => {
        if (state) state._hasHydrated = true;
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        userId: state.userId,
        userName: state.userName,
        userRole: state.userRole,
        profile: state.profile,
      }),
    },
  ),
);
