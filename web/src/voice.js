import { create } from 'zustand'
import { getSocket } from './socket.js'
import { MeshManager } from './webrtc.js'
import { createSpeakingDetector } from './audio.js'
import { playJoin, playLeave, playSelfJoin } from './sounds.js'
import {
  ensureMixer, teardownMixer, attach as mixAttach, detach as mixDetach,
  updateUserId as mixUpdateUser, setVolume as mixSetVolume, getUserVolume,
} from './mixer.js'

let mesh = null
let cleanupMeta = null
const speaking = new Map() // socketId | 'self' -> cleanup fn
const rawStreams = new Map() // socketId -> Map(streamId -> MediaStream)
const trackKinds = new Map() // socketId -> { mic, screen, camera }
const micStreamId = new Map() // socketId -> id do stream com detector ativo

function clearSpeaking() {
  for (const fn of speaking.values()) fn?.()
  speaking.clear()
}

export const useVoice = create((set, get) => ({
  channelId: null,
  connecting: false,
  error: null,
  // preferencias persistem mesmo fora da call
  muted: localStorage.getItem('elo_muted') === '1',
  deafened: localStorage.getItem('elo_deafened') === '1',
  forceMuted: false,
  notice: '',
  micDeviceId: localStorage.getItem('elo_mic') || '',
  spkDeviceId: localStorage.getItem('elo_spk') || '',
  noiseSuppress: localStorage.getItem('elo_ns') !== '0', // padrao ligado
  echoCancel: localStorage.getItem('elo_ec') !== '0', // padrao ligado
  sounds: localStorage.getItem('elo_sounds') !== '0', // padrao ligado
  hiddenScreens: [], // ids de telas que voce parou de assistir
  sharing: false,
  camera: false,
  selfSpeaking: false,
  localStream: null,
  screenStream: null,
  cameraStream: null,
  mixStream: null, // audio somado de todo mundo (tocado pelo Shell)
  volumes: {}, // { [userId]: multiplicador 0..2 } — pra UI
  participants: {}, // socketId -> { user, state, micStream, screenStream, cameraStream, speaking }

  async connect(channelId) {
    if (get().channelId === channelId) return
    if (get().channelId) get().disconnect()

    const socket = getSocket()
    if (!socket) return set({ error: 'sem conexao com o servidor' })

    set({ connecting: true, channelId, error: null, participants: {}, mixStream: ensureMixer() })
    rawStreams.clear()
    trackKinds.clear()
    micStreamId.clear()

    const patch = (sid, data) =>
      set((s) => ({
        participants: { ...s.participants, [sid]: { ...(s.participants[sid] || {}), ...data } },
      }))

    const reconcile = (sid) => {
      const raw = rawStreams.get(sid) || new Map()
      const kinds = trackKinds.get(sid) || {}
      const all = [...raw.values()]

      const micStream = kinds.mic
        ? raw.get(kinds.mic)
        : all.find((st) => st.getAudioTracks().length > 0) || null
      const cameraStream = kinds.camera ? raw.get(kinds.camera) : null
      const screenStream = kinds.screen
        ? raw.get(kinds.screen)
        : all.find((st) => st.getVideoTracks().length > 0 && st !== cameraStream && st !== micStream) || null

      patch(sid, { micStream, screenStream, cameraStream })

      // (re)liga o detector de fala + o mixer se o stream de microfone mudou
      if (micStream && micStreamId.get(sid) !== micStream.id) {
        speaking.get(sid)?.()
        micStreamId.set(sid, micStream.id)
        speaking.set(
          sid,
          createSpeakingDetector(micStream, (sp) => {
            if (get().participants[sid]) patch(sid, { speaking: sp })
          }),
        )
        const uid = get().participants[sid]?.user?.id
        mixAttach(sid, micStream, uid)
        if (uid) {
          set((s) => ({ volumes: { ...s.volumes, [uid]: s.volumes[uid] ?? getUserVolume(uid) } }))
        }
      }
    }

    mesh = new MeshManager(socket, {
      onRemoteStream: (sid, stream) => {
        const raw = rawStreams.get(sid) || new Map()
        raw.set(stream.id, stream)
        rawStreams.set(sid, raw)
        stream.addEventListener('removetrack', () => reconcile(sid))
        reconcile(sid)
      },
      onPeerTracks: (sid, kinds) => {
        trackKinds.set(sid, kinds)
        reconcile(sid)
      },
      onPeerGone: (sid) => {
        speaking.get(sid)?.()
        speaking.delete(sid)
        mixDetach(sid)
        rawStreams.delete(sid)
        trackKinds.delete(sid)
        micStreamId.delete(sid)
        if (get().sounds && !get().deafened) playLeave()
        set((s) => {
          const next = { ...s.participants }
          delete next[sid]
          return { participants: next, hiddenScreens: s.hiddenScreens.filter((x) => x !== sid) }
        })
      },
      onScreenEnded: () => get().stopShare(),
      onCameraEnded: () => get().stopCamera(),
      onMicChanged: (stream) => {
        speaking.get('self')?.()
        speaking.set(
          'self',
          createSpeakingDetector(stream, (sp) => set({ selfSpeaking: sp && !get().muted })),
        )
      },
    })

    const linkVolume = (socketId, user) => {
      if (!user?.id) return
      mixUpdateUser(socketId, user.id)
      set((s) => ({ volumes: { ...s.volumes, [user.id]: s.volumes[user.id] ?? getUserVolume(user.id) } }))
    }
    const onPeerJoined = ({ socketId, user, state }) => {
      patch(socketId, { user, state })
      linkVolume(socketId, user)
      if (get().sounds && !get().deafened) playJoin()
    }
    const onPeers = ({ peers }) =>
      peers.forEach((p) => {
        patch(p.socketId, { user: p.user, state: p.state })
        linkVolume(p.socketId, p.user)
      })
    const onPeerState = ({ socketId, state }) => {
      if (get().participants[socketId]) patch(socketId, { state })
    }
    const onError = ({ error }) => {
      set({ error })
      get().disconnect()
    }

    const onForceMute = ({ muted, by }) => {
      mesh?.setMuted(true)
      set({
        forceMuted: muted,
        muted: muted || get().muted,
        notice: muted ? `voce foi silenciado por ${by}` : `${by} tirou seu silenciamento`,
      })
      getSocket()?.emit('voice:state', { muted: muted || get().muted })
      setTimeout(() => set({ notice: '' }), 4000)
    }
    const onMove = ({ channelId: to, by }) => {
      set({ notice: `${by} te moveu de canal` })
      get().connect(to)
      setTimeout(() => set({ notice: '' }), 4000)
    }

    socket.on('voice:peer-joined', onPeerJoined)
    socket.on('voice:peers', onPeers)
    socket.on('voice:peer-state', onPeerState)
    socket.on('voice:error', onError)
    socket.on('voice:force-mute', onForceMute)
    socket.on('voice:move', onMove)
    cleanupMeta = () => {
      socket.off('voice:peer-joined', onPeerJoined)
      socket.off('voice:peers', onPeers)
      socket.off('voice:peer-state', onPeerState)
      socket.off('voice:error', onError)
      socket.off('voice:force-mute', onForceMute)
      socket.off('voice:move', onMove)
    }

    try {
      const localStream = await mesh.start({
        deviceId: get().micDeviceId || undefined,
        noiseSuppression: get().noiseSuppress,
        echoCancellation: get().echoCancel,
      })
      // aplica preferencia de mudo/surdo
      mesh.setMuted(get().muted || get().deafened)
      set({ localStream, connecting: false, hiddenScreens: [] })
      speaking.set(
        'self',
        createSpeakingDetector(localStream, (sp) => set({ selfSpeaking: sp && !get().muted })),
      )
      socket.emit('voice:join', { channelId })
      socket.emit('voice:state', { muted: get().muted, deafened: get().deafened })
      if (get().sounds) playSelfJoin()
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
    teardownMixer()
    rawStreams.clear()
    trackKinds.clear()
    micStreamId.clear()
    mesh?.destroy()
    mesh = null
    // muted/deafened/micDeviceId/spkDeviceId sao preferencias — nao resetam
    set({
      channelId: null,
      connecting: false,
      participants: {},
      localStream: null,
      screenStream: null,
      cameraStream: null,
      mixStream: null,
      sharing: false,
      camera: false,
      selfSpeaking: false,
      forceMuted: false,
    })
  },

  setUserVolume(userId, v) {
    const val = Math.max(0, Math.min(2, v))
    mixSetVolume(userId, val)
    set((s) => ({ volumes: { ...s.volumes, [userId]: val } }))
  },

  toggleMute() {
    if (get().deafened || get().forceMuted) return
    const muted = !get().muted
    mesh?.setMuted(muted)
    localStorage.setItem('elo_muted', muted ? '1' : '0')
    set({ muted, selfSpeaking: muted ? false : get().selfSpeaking })
    getSocket()?.emit('voice:state', { muted })
  },

  toggleDeafen() {
    const deafened = !get().deafened
    const muted = deafened || get().muted
    mesh?.setMuted(muted)
    localStorage.setItem('elo_deafened', deafened ? '1' : '0')
    localStorage.setItem('elo_muted', muted ? '1' : '0')
    set({ deafened, muted })
    getSocket()?.emit('voice:state', { deafened, muted })
  },

  async setMicDevice(id) {
    localStorage.setItem('elo_mic', id || '')
    set({ micDeviceId: id || '' })
    await mesh?.setMicDevice({ deviceId: id || undefined })
  },

  setSpkDevice(id) {
    localStorage.setItem('elo_spk', id || '')
    set({ spkDeviceId: id || '' })
  },

  async toggleNoiseSuppress() {
    const noiseSuppress = !get().noiseSuppress
    localStorage.setItem('elo_ns', noiseSuppress ? '1' : '0')
    set({ noiseSuppress })
    await mesh?.setMicDevice({ noiseSuppression: noiseSuppress })
  },

  async toggleEchoCancel() {
    const echoCancel = !get().echoCancel
    localStorage.setItem('elo_ec', echoCancel ? '1' : '0')
    set({ echoCancel })
    await mesh?.setMicDevice({ echoCancellation: echoCancel })
  },

  toggleSounds() {
    const sounds = !get().sounds
    localStorage.setItem('elo_sounds', sounds ? '1' : '0')
    set({ sounds })
  },

  hideScreen(id) {
    set((s) => ({ hiddenScreens: [...new Set([...s.hiddenScreens, id])] }))
  },
  showScreen(id) {
    set((s) => ({ hiddenScreens: s.hiddenScreens.filter((x) => x !== id) }))
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

  async startCamera() {
    try {
      const cameraStream = await mesh?.startCamera()
      set({ camera: true, cameraStream })
      getSocket()?.emit('voice:state', { camera: true })
    } catch {
      /* cancelado / sem camera */
    }
  },

  stopCamera() {
    mesh?.stopCamera()
    set({ camera: false, cameraStream: null })
    getSocket()?.emit('voice:state', { camera: false })
  },

  // moderacao (quem tem cargo com permissao)
  modMute(targetSocketId, muted) {
    getSocket()?.emit('voice:mod', { action: muted ? 'mute' : 'unmute', targetSocketId })
  },
  modMove(targetSocketId, toChannelId) {
    getSocket()?.emit('voice:mod', { action: 'move', targetSocketId, toChannelId })
  },
}))
