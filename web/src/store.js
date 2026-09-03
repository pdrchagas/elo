import { create } from 'zustand'
import { api, setToken, getToken } from './api.js'
import { connectSocket, disconnectSocket, getSocket } from './socket.js'
import { playMention } from './sounds.js'

let autoRefreshWired = false

export const useStore = create((set, get) => ({
  user: null,
  booting: true,
  servers: [],
  friends: [],
  online: {}, // { [userId]: true } — quem esta online agora
  voiceRosters: {}, // { [channelId]: [ { id, displayName, color, avatar, state } ] }
  mentions: {}, // { [channelId]: quantidade de mencoes nao vistas }
  activeServerId: null,
  activeChannelId: null,
  voiceChannelId: null,

  async boot() {
    const token = getToken()
    get()._autoRefresh()
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

  // garante que a tela nunca fica velha: refetch ao voltar pra aba + a cada 45s
  _autoRefresh() {
    if (autoRefreshWired) return
    autoRefreshWired = true
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && get().user) get().refreshAll()
    })
    setInterval(() => {
      if (!document.hidden && get().user) get().refreshAll()
    }, 45000)
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
      voiceRosters: {},
      mentions: {},
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
      else {
        get().refreshMe()
        get().refreshAll()
      }
    })
    socket.on('kicked', () => {
      alert('sua conta foi removida pelo admin.')
      get().logout()
    })
    socket.on('presence', ({ userId, online }) => {
      set((s) => {
        const next = { ...s.online }
        if (online) next[userId] = true
        else delete next[userId]
        return { online: next }
      })
    })
    socket.on('voice:roster', ({ channelId, members }) => {
      set((s) => ({ voiceRosters: { ...s.voiceRosters, [channelId]: members || [] } }))
    })
    socket.on('mention', (m) => {
      const s = get()
      const seeing = s.activeChannelId === m.channelId && !document.hidden
      if (seeing) return
      set((st) => ({ mentions: { ...st.mentions, [m.channelId]: (st.mentions[m.channelId] || 0) + 1 } }))
      try {
        playMention()
      } catch {}
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(`${m.from} te mencionou em #${m.channelName}`, {
          body: m.preview,
          tag: m.channelId,
        })
        n.onclick = () => {
          window.focus()
          get().selectServer(m.serverId)
          get().selectChannel(m.channelId)
          n.close()
        }
      }
    })
    socket.on('connect', () => get().refreshAll())
    socket.on('reconnect', () => get().refreshAll())
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

  _seedRosters(servers) {
    const rosters = {}
    for (const sv of servers) Object.assign(rosters, sv.voiceRosters || {})
    set({ voiceRosters: rosters })
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
    get()._seedRosters(servers)
  },

  async refreshServers() {
    const { servers } = await api('/servers')
    set({ servers })
    get()._seedPresence(servers.map((sv) => sv.members))
    get()._seedRosters(servers)
  },

  async refreshFriends() {
    const { friends } = await api('/friends')
    set({ friends })
    get()._seedPresence([friends])
  },

  async refreshMe() {
    try {
      const { user } = await api('/auth/me')
      set({ user })
    } catch {}
  },

  async setAvatar(image) {
    const { user } = await api('/auth/avatar', { method: 'POST', body: { image } })
    set({ user })
    get().refreshAll()
  },

  async setDisplayName(displayName) {
    const { user } = await api('/auth/profile', { method: 'POST', body: { displayName } })
    set({ user })
    get().refreshAll()
  },

  async logoutEverywhere() {
    const { token, user } = await api('/auth/logout-all', { method: 'POST' })
    setToken(token)
    set({ user })
  },

  async changePassword(current, next) {
    const { token, user } = await api('/auth/password', { method: 'POST', body: { current, next } })
    setToken(token)
    set({ user })
  },

  isOnline(userId) {
    return !!get().online[userId]
  },

  selectServer(id) {
    const srv = get().servers.find((x) => x.id === id)
    const ch = srv?.channels?.[0]?.id || null
    set((s) => {
      const mentions = { ...s.mentions }
      if (ch) delete mentions[ch]
      return { activeServerId: id, activeChannelId: ch, mentions }
    })
  },

  selectChannel(id) {
    set((s) => {
      const mentions = { ...s.mentions }
      delete mentions[id]
      return { activeChannelId: id, mentions }
    })
  },

  clearMentions(channelId) {
    set((s) => {
      if (!s.mentions[channelId]) return {}
      const mentions = { ...s.mentions }
      delete mentions[channelId]
      return { mentions }
    })
  },

  async askNotifications() {
    if (typeof Notification === 'undefined') return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    return Notification.requestPermission()
  },

  setVoiceChannel(id) {
    set({ voiceChannelId: id })
  },
}))
