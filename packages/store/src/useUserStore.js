// Shared Zustand user store
import { create } from 'zustand';

export const useUserStore = create((set) => ({
  user: null,
  userId: null,
  email: null,
  name: null,
  role: null, // 'DONOR' | 'RECEIVER' | 'BLOOD_BANK_STAFF' | 'PLATFORM_ADMIN'
  institution: null,
  donorProfile: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user, profile) =>
    set({
      user,
      userId: user ? user.uid : null,
      email: user ? user.email : null,
      name: profile ? profile.name : null,
      role: profile ? profile.role : null,
      institution: profile ? profile.institution : null,
      donorProfile: profile ? profile.donorProfile : null,
      isAuthenticated: Boolean(user),
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  clearUser: () =>
    set({
      user: null,
      userId: null,
      email: null,
      name: null,
      role: null,
      institution: null,
      donorProfile: null,
      isAuthenticated: false,
      isLoading: false,
    }),
}));
