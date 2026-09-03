import { create } from 'zustand'

// Card de perfil (abre ao clicar num avatar/nome).
export const useProfile = create((set) => ({
  user: null,
  open: (user) => user?.id && set({ user }),
  close: () => set({ user: null }),
}))
