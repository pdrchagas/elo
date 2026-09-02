import { create } from 'zustand'
import { api, setToken, getToken } from './api.js'
import { connectSocket, disconnectSocket } from './socket.js'

export const useStore = create((set, get) => ({
  user: null,
  booting: true,
  servers: [],
  friends: [],
  activeServerId: null,
  activeChannelId: null,
  // canal de voz em que estou conectado (independe do canal que estou vendo)
  voiceChannelId: null,

  async boot() {
    const token = getToken()
    if (!token) return set({ booting: false })
    try {
      const { user } = await api('/auth/me')
      connectSocket(token)
      set({ user })
      await get().refreshAll()
    } catch {
      setToken(null)
    }
    set({ booting: false })
  },

  async login(username, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } })
    setToken(token)
    connectSocket(token)
    set({ user })
    await get().refreshAll()
  },

  async register(payload) {
    const { token, user } = await api('/auth/register', { method: 'POST', body: payload })
    setToken(token)
    connectSocket(token)
    set({ user })
    await get().refreshAll()
  },

  logout() {
    disconnectSocket()
    setToken(null)
    set({
      user: null,
      servers: [],
      friends: [],
      activeServerId: null,
      activeChannelId: null,
      voiceChannelId: null,
    })
  },

  async refreshAll() {
    const [{ servers }, { friends }] = await Promise.all([api('/servers'), api('/friends')])
    set((s) => {
      const active = servers.find((x) => x.id === s.activeServerId) || servers[0] || null
      return {
        servers,
        friends,
        activeServerId: active?.id || null,
        activeChannelId:
          active?.channels?.find((c) => c.id === s.activeChannelId)?.id ||
          active?.channels?.[0]?.id ||
          null,
      }
    })
  },

  async refreshServers() {
    const { servers } = await api('/servers')
    set({ servers })
  },

  async refreshFriends() {
    const { friends } = await api('/friends')
    set({ friends })
  },

  selectServer(id) {
    const s = get().servers.find((x) => x.id === id)
    set({ activeServerId: id, activeChannelId: s?.channels?.[0]?.id || null })
  },

  selectChannel(id) {
    set({ activeChannelId: id })
  },

  setVoiceChannel(id) {
    set({ voiceChannelId: id })
  },
}))
