import { create } from 'zustand'
import { getSocket } from './socket.js'
import { MeshManager } from './webrtc.js'
import { createSpeakingDetector } from './audio.js'

let mesh = null
let cleanupMeta = null
const speaking = new Map() // socketId | 'self' -> cleanup fn

function clearSpeaking() {
  for (const fn of speaking.values()) fn?.()
  speaking.clear()
}

export const useVoice = create((set, get) => ({
  channelId: null,
  connecting: false,
  error: null,
  muted: false,
  deafened: false,
  sharing: false,
  selfSpeaking: false,
  localStream: null,
  screenStream: null,
  participants: {}, // socketId -> { user, state, stream, speaking }

  async connect(channelId) {
    if (get().channelId === channelId) return
    if (get().channelId) get().disconnect()

    const socket = getSocket()
    if (!socket) return set({ error: 'sem conexao com o servidor' })

    set({ connecting: true, channelId, error: null, participants: {} })

    const patch = (sid, data) =>
      set((s) => ({
        participants: { ...s.participants, [sid]: { ...(s.participants[sid] || {}), ...data } },
      }))

    mesh = new MeshManager(socket, {
      onRemoteStream: (sid, stream) => {
        patch(sid, { stream })
        speaking.get(sid)?.()
        speaking.set(
          sid,
          createSpeakingDetector(stream, (sp) => {
            if (get().participants[sid]) patch(sid, { speaking: sp })
          }),
        )
      },
      onPeerGone: (sid) => {
        speaking.get(sid)?.()
        speaking.delete(sid)
        set((s) => {
          const next = { ...s.participants }
          delete next[sid]
          return { participants: next }
        })
      },
      onScreenEnded: () => get().stopShare(),
    })

    const onPeerJoined = ({ socketId, user, state }) => patch(socketId, { user, state })
    const onPeers = ({ peers }) => peers.forEach((p) => patch(p.socketId, { user: p.user, state: p.state }))
    const onPeerState = ({ socketId, state }) => {
      if (get().participants[socketId]) patch(socketId, { state })
    }
    const onError = ({ error }) => {
      set({ error })
      get().disconnect()
    }

    socket.on('voice:peer-joined', onPeerJoined)
    socket.on('voice:peers', onPeers)
    socket.on('voice:peer-state', onPeerState)
    socket.on('voice:error', onError)
    cleanupMeta = () => {
      socket.off('voice:peer-joined', onPeerJoined)
      socket.off('voice:peers', onPeers)
      socket.off('voice:peer-state', onPeerState)
      socket.off('voice:error', onError)
    }

    try {
      const localStream = await mesh.start()
      set({ localStream, connecting: false })
      speaking.set(
        'self',
        createSpeakingDetector(localStream, (sp) => set({ selfSpeaking: sp && !get().muted })),
      )
      socket.emit('voice:join', { channelId })
    } catch {
      set({ error: 'preciso da permissao do microfone para entrar na call' })
      get().disconnect()
    }
  },

  disconnect() {
    getSocket()?.emit('voice:leave')
    cleanupMeta?.()
    cleanupMeta = null
    clearSpeaking()
    mesh?.destroy()
    mesh = null
    set({
      channelId: null,
      connecting: false,
      participants: {},
      localStream: null,
      screenStream: null,
      sharing: false,
      muted: false,
      deafened: false,
      selfSpeaking: false,
    })
  },

  toggleMute() {
    if (get().deafened) return
    const muted = !get().muted
    mesh?.setMuted(muted)
    set({ muted, selfSpeaking: muted ? false : get().selfSpeaking })
    getSocket()?.emit('voice:state', { muted })
  },

  toggleDeafen() {
    const deafened = !get().deafened
    const muted = deafened || get().muted
    mesh?.setMuted(muted)
    set({ deafened, muted })
    getSocket()?.emit('voice:state', { deafened, muted })
  },

  async startShare() {
    try {
      const screenStream = await mesh?.startScreenShare()
      set({ sharing: true, screenStream })
      getSocket()?.emit('voice:state', { sharing: true })
    } catch {
      /* cancelado pelo usuario */
    }
  },

  stopShare() {
    mesh?.stopScreenShare()
    set({ sharing: false, screenStream: null })
    getSocket()?.emit('voice:state', { sharing: false })
  },
}))
