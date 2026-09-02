import { create } from 'zustand'
import { api, setToken, getToken } from './api.js'
import { connectSocket, disconnectSocket, getSocket } from './socket.js'

export const useStore = create((set, get) => ({
  user: null,
  booting: true,
  servers: [],
  friends: [],
  online: {}, // { [userId]: true } — quem esta online agora
  activeServerId: null,
  activeChannelId: null,
  voiceChannelId: null,

  async boot() {
    const token = getToken()
    if (!token) return set({ booting: false })
    try {
      const { user } = await api('/auth/me')
      set({ user })
      get()._wireSocket(connectSocket(token))
      await get().refreshAll()
    } catch {
      setToken(null)
    }
    set({ booting: false })
  },

  async login(username, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } })
    setToken(token)
    set({ user })
    get()._wireSocket(connectSocket(token))
    await get().refreshAll()
  },

  async register(payload) {
    const { token, user } = await api('/auth/register', { method: 'POST', body: payload })
    setToken(token)
    set({ user })
    get()._wireSocket(connectSocket(token))
    await get().refreshAll()
  },

  logout() {
    disconnectSocket()
    setToken(null)
    set({
      user: null,
      servers: [],
      friends: [],
      online: {},
      activeServerId: null,
      activeChannelId: null,
      voiceChannelId: null,
    })
  },

  // liga os eventos de tempo real (uma vez por conexao)
  _wireSocket(socket) {
    if (!socket) return
    socket.on('sync', ({ scope } = {}) => {
      if (scope === 'friends') get().refreshFriends()
      else if (scope === 'servers') get().refreshServers()
      else get().refreshAll()
    })
    socket.on('presence', ({ userId, online }) => {
      set((s) => {
        const next = { ...s.online }
        if (online) next[userId] = true
        else delete next[userId]
        return { online: next }
      })
    })
    socket.on('connect', () => get().refreshAll())
  },

  _seedPresence(lists) {
    set((s) => {
      const next = { ...s.online }
      for (const arr of lists) {
        for (const item of arr || []) {
          const u = item.user || item
          if (u?.id && (u.online || item.online)) next[u.id] = true
        }
      }
      return { online: next }
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
    get()._seedPresence([friends, ...servers.map((sv) => sv.members)])
  },

  async refreshServers() {
    const { servers } = await api('/servers')
    set({ servers })
    get()._seedPresence(servers.map((sv) => sv.members))
  },

  async refreshFriends() {
    const { friends } = await api('/friends')
    set({ friends })
    get()._seedPresence([friends])
  },

  isOnline(userId) {
    return !!get().online[userId]
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
