import { db, nanoid } from './db.js'

// Sinalizacao WebRTC (malha P2P) + chat de texto em tempo real.
// O servidor so repassa mensagens de negociacao; a midia vai direto entre os navegadores.
export function registerSignaling(io) {
  io.on('connection', (socket) => {
    const user = socket.user
    let currentChannel = null

    function voiceRoom(id) {
      return `voice:${id}`
    }

    function leaveVoice() {
      if (!currentChannel) return
      socket.to(voiceRoom(currentChannel)).emit('voice:peer-left', { socketId: socket.id })
      socket.leave(voiceRoom(currentChannel))
      currentChannel = null
      socket.voiceState = null
    }

    function canUseChannel(channelId, type) {
      const ch = db.data.channels.find((c) => c.id === channelId && (!type || c.type === type))
      if (!ch) return null
      const member = db.data.members.find((m) => m.serverId === ch.serverId && m.userId === user.id)
      return member ? ch : null
    }

    // ---- Voz / tela ----
    socket.on('voice:join', ({ channelId }) => {
      if (!canUseChannel(channelId, 'voice')) return socket.emit('voice:error', { error: 'sem acesso a esse canal' })
      leaveVoice()

      currentChannel = channelId
      socket.voiceState = { muted: false, deafened: false, sharing: false }
      socket.join(voiceRoom(channelId))

      const peers = []
      for (const sid of io.sockets.adapter.rooms.get(voiceRoom(channelId)) || []) {
        if (sid === socket.id) continue
        const s = io.sockets.sockets.get(sid)
        if (s) peers.push({ socketId: sid, user: s.user, state: s.voiceState || {} })
      }
      socket.emit('voice:peers', { channelId, peers })
      socket.to(voiceRoom(channelId)).emit('voice:peer-joined', {
        socketId: socket.id,
        user,
        state: socket.voiceState,
      })
    })

    socket.on('voice:signal', ({ to, data }) => {
      io.to(to).emit('voice:signal', { from: socket.id, data })
    })

    socket.on('voice:state', (state) => {
      socket.voiceState = { ...(socket.voiceState || {}), ...state }
      if (currentChannel) {
        socket.to(voiceRoom(currentChannel)).emit('voice:peer-state', {
          socketId: socket.id,
          state: socket.voiceState,
        })
      }
    })

    socket.on('voice:leave', leaveVoice)

    // ---- Chat de texto ----
    socket.on('chat:subscribe', ({ channelId }) => {
      if (!canUseChannel(channelId, 'text')) return
      for (const room of socket.rooms) if (room.startsWith('chat:')) socket.leave(room)
      socket.join(`chat:${channelId}`)
    })

    socket.on('chat:send', async ({ channelId, content }) => {
      const text = String(content || '').trim().slice(0, 2000)
      if (!text || !canUseChannel(channelId, 'text')) return
      const msg = { id: nanoid(), channelId, userId: user.id, content: text, createdAt: Date.now() }
      db.data.messages.push(msg)
      if (db.data.messages.length > 5000) db.data.messages = db.data.messages.slice(-5000)
      await db.write()
      io.to(`chat:${channelId}`).emit('chat:message', {
        id: msg.id,
        channelId,
        content: text,
        createdAt: msg.createdAt,
        author: { id: user.id, username: user.username, displayName: user.displayName },
      })
    })

    socket.on('disconnect', leaveVoice)
  })
}
