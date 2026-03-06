import { create } from 'zustand';

interface UserStore {
  accessToken: string | null;
  userId: string | null;
  userName: string | null;
  setAuth: (token: string, userId: string, name: string) => void;
  clearAuth: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  accessToken: null,
  userId: null,
  userName: null,
  setAuth: (accessToken, userId, userName) => set({ accessToken, userId, userName }),
  clearAuth: () => set({ accessToken: null, userId: null, userName: null }),
}));
