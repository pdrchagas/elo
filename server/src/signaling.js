import { db, nanoid } from './db.js'
import { messages } from './messages.js'
import { trackPresence, notifyServer, notifyUser, setVoiceRoster } from './realtime.js'
import { memberCan, serverOfChannel } from './perms.js'

function briefOf(u) {
  const rec = db.data.users.find((x) => x.id === u.id)
  return {
    id: u.id,
    username: u.username,
    displayName: rec?.displayName || u.displayName,
    color: rec?.color || '#5865F2',
    avatar: rec?.avatar || null,
  }
}

// Sinalizacao WebRTC (malha P2P) + chat de texto em tempo real.
// O servidor so repassa mensagens de negociacao; a midia vai direto entre os navegadores.

const IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]{16,}$/i
const MAX_IMAGE_CHARS = 900_000 // ~650KB depois do base64
const MAX_STICKER_CHARS = 450_000
const MAX_SIGNAL_CHARS = 200_000

// limitador simples por socket (janela deslizante grosseira)
function makeLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(key, arr)
    return arr.length <= max
  }
}

export function registerSignaling(io) {
  const chatLimit = makeLimiter(15, 10_000) // 15 msgs / 10s
  const signalLimit = makeLimiter(200, 10_000) // negociacao WebRTC e verbosa

  // monta e transmite pra TODO o servidor quem esta num canal de voz (mesmo quem nao entrou)
  function broadcastRoster(channelId) {
    const room = io.sockets.adapter.rooms.get(`voice:${channelId}`) || new Set()
    const members = []
    for (const sid of room) {
      const s = io.sockets.sockets.get(sid)
      if (s?.user) members.push({ socketId: sid, ...briefOf(s.user), state: s.voiceState || {} })
    }
    setVoiceRoster(channelId, members)
    const ch = db.data.channels.find((c) => c.id === channelId)
    if (ch) notifyServer(ch.serverId, 'voice:roster', { channelId, members })
  }

  io.on('connection', (socket) => {
    const user = socket.user
    let currentChannel = null

    trackPresence(socket)

    const voiceRoom = (id) => `voice:${id}`

    function leaveVoice() {
      if (!currentChannel) return
      const left = currentChannel
      socket.to(voiceRoom(left)).emit('voice:peer-left', { socketId: socket.id })
      socket.leave(voiceRoom(left))
      currentChannel = null
      socket.voiceState = null
      broadcastRoster(left)
    }

    function canUseChannel(channelId, type) {
      const ch = db.data.channels.find((c) => c.id === channelId && (!type || c.type === type))
      if (!ch) return null
      const rec = db.data.users.find((u) => u.id === user.id)
      if (rec?.isAdmin) return ch
      const member = db.data.members.find((m) => m.serverId === ch.serverId && m.userId === user.id)
      return member ? ch : null
    }

    // ---- Voz / tela ----
    socket.on('voice:join', ({ channelId } = {}) => {
      if (!canUseChannel(channelId, 'voice')) return socket.emit('voice:error', { error: 'sem acesso a esse canal' })
      leaveVoice()
      currentChannel = channelId
      socket.voiceState = { muted: false, deafened: false, sharing: false, camera: false }
      socket.join(voiceRoom(channelId))

      const peers = []
      for (const sid of io.sockets.adapter.rooms.get(voiceRoom(channelId)) || []) {
        if (sid === socket.id) continue
        const s = io.sockets.sockets.get(sid)
        if (s) peers.push({ socketId: sid, user: briefOf(s.user), state: s.voiceState || {} })
      }
      socket.emit('voice:peers', { channelId, peers })
      socket.to(voiceRoom(channelId)).emit('voice:peer-joined', {
        socketId: socket.id,
        user: briefOf(user),
        state: socket.voiceState,
      })
      broadcastRoster(channelId)
    })

    socket.on('voice:signal', ({ to, data } = {}) => {
      if (!currentChannel || typeof to !== 'string') return
      if (!signalLimit(socket.id)) return
      if (JSON.stringify(data || '').length > MAX_SIGNAL_CHARS) return
      // so repassa para quem esta na MESMA sala de voz
      const room = io.sockets.adapter.rooms.get(voiceRoom(currentChannel))
      if (!room || !room.has(to)) return
      io.to(to).emit('voice:signal', { from: socket.id, data })
    })

    socket.on('voice:state', (state = {}) => {
      const clean = {}
      for (const k of ['muted', 'deafened', 'sharing', 'camera']) {
        if (k in state) clean[k] = !!state[k]
      }
      socket.voiceState = { ...(socket.voiceState || {}), ...clean }
      if (socket.voiceState.forceMuted) socket.voiceState.muted = true
      if (currentChannel) {
        socket.to(voiceRoom(currentChannel)).emit('voice:peer-state', {
          socketId: socket.id,
          state: socket.voiceState,
        })
        broadcastRoster(currentChannel)
      }
    })

    socket.on('voice:leave', leaveVoice)

    // ---- Moderacao de voz (cargos: mutar / mover) ----
    socket.on('voice:mod', ({ action, targetSocketId, toChannelId } = {}) => {
      if (!currentChannel || typeof targetSocketId !== 'string') return
      const room = io.sockets.adapter.rooms.get(voiceRoom(currentChannel))
      if (!room || !room.has(targetSocketId)) return
      const target = io.sockets.sockets.get(targetSocketId)
      if (!target) return

      const server = serverOfChannel(currentChannel)
      if (!server) return

      if (action === 'mute' || action === 'unmute') {
        if (!memberCan(server, user.id, 'canMute')) return
        const forceMuted = action === 'mute'
        target.voiceState = { ...(target.voiceState || {}), forceMuted, muted: forceMuted || target.voiceState?.muted }
        target.emit('voice:force-mute', { muted: forceMuted, by: user.displayName })
        io.to(voiceRoom(currentChannel)).emit('voice:peer-state', {
          socketId: targetSocketId,
          state: target.voiceState,
        })
        broadcastRoster(currentChannel)
      } else if (action === 'move') {
        if (!memberCan(server, user.id, 'canMove')) return
        const dest = db.data.channels.find((c) => c.id === toChannelId && c.type === 'voice')
        if (!dest || dest.serverId !== server.id) return
        target.emit('voice:move', { channelId: toChannelId, by: user.displayName })
      }
    })

    // ---- Chat de texto ----
    socket.on('chat:subscribe', ({ channelId } = {}) => {
      if (!canUseChannel(channelId, 'text')) return
      for (const room of socket.rooms) if (room.startsWith('chat:')) socket.leave(room)
      socket.join(`chat:${channelId}`)
    })

    socket.on('chat:send', async ({ channelId, content, image, sticker } = {}) => {
      const ch = canUseChannel(channelId, 'text')
      if (!ch) return
      if (!chatLimit(socket.id)) return socket.emit('chat:error', { error: 'devagar com as mensagens' })

      const text = String(content || '').trim().slice(0, 2000)
      let img = null
      if (image) {
        const str = String(image)
        if (str.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(str)) img = str
        else return socket.emit('chat:error', { error: 'imagem invalida ou muito grande' })
      }
      let stk = null
      if (sticker) {
        const s = String(sticker)
        if (s.startsWith('data:image/')) {
          if (s.length <= MAX_STICKER_CHARS && IMAGE_RE.test(s)) stk = s
          else return socket.emit('chat:error', { error: 'figurinha invalida' })
        } else {
          stk = s.slice(0, 24) // emoji
        }
      }

      if (!text && !img && !stk) return

      // mencoes: @username de quem e membro do servidor
      const serverMembers = db.data.members
        .filter((m) => m.serverId === ch.serverId)
        .map((m) => db.data.users.find((x) => x.id === m.userId))
        .filter(Boolean)
      const mentionIds = []
      const mentionUsers = []
      if (text) {
        const tags = new Set((text.toLowerCase().match(/@([a-z0-9._-]{3,20})/g) || []).map((s) => s.slice(1)))
        const everyone = /@everyone\b|@todos\b/i.test(text)
        for (const mu of serverMembers) {
          if (mu.id === user.id) continue
          if (everyone || tags.has(mu.username)) {
            mentionIds.push(mu.id)
            mentionUsers.push({ id: mu.id, username: mu.username, displayName: mu.displayName })
          }
        }
      }

      const msg = {
        id: nanoid(),
        channelId,
        userId: user.id,
        content: text,
        image: img,
        sticker: stk,
        mentions: mentionIds,
        createdAt: Date.now(),
      }
      await messages.add(msg)
      const u = db.data.users.find((x) => x.id === user.id)
      const author = {
        id: user.id,
        username: user.username,
        displayName: u?.displayName || user.displayName,
        color: u?.color || '#5865F2',
        avatar: u?.avatar || null,
      }
      io.to(`chat:${channelId}`).emit('chat:message', {
        id: msg.id,
        channelId,
        content: text,
        image: img,
        sticker: stk,
        mentions: mentionIds,
        mentionUsers,
        createdAt: msg.createdAt,
        author,
      })

      // notifica quem foi mencionado (mesmo quem nao esta olhando o canal)
      const preview = (text || (img ? '📷 imagem' : stk ? 'figurinha' : '')).slice(0, 120)
      for (const mid of mentionIds) {
        notifyUser(mid, 'mention', {
          serverId: ch.serverId,
          channelId,
          channelName: ch.name,
          from: author.displayName,
          preview,
          createdAt: msg.createdAt,
        })
      }
    })

    socket.on('disconnect', leaveVoice)
  })
}
