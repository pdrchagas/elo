// Gerenciador de malha WebRTC: uma RTCPeerConnection por participante.
// Usa "perfect negotiation" para lidar com renegociacao (ligar/desligar tela).
// Todo o audio/video de saida vai por um unico MediaStream (this.outbound),
// entao cada peer recebe um stream so com tudo dentro.

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]
if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  })
}

export class MeshManager {
  constructor(socket, handlers = {}) {
    this.socket = socket
    this.handlers = handlers // { onRemoteStream, onPeerGone, onScreenEnded }
    this.peers = new Map() // socketId -> { pc, polite, makingOffer, ignoreOffer }
    this.outbound = new MediaStream()
    this.micTrack = null
    this.screenStream = null
    this._bindings = {
      'voice:peers': this._onPeers.bind(this),
      'voice:peer-joined': this._onPeerJoined.bind(this),
      'voice:peer-left': this._onPeerLeft.bind(this),
      'voice:signal': this._onSignal.bind(this),
    }
  }

  async start() {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    this.micTrack = mic.getAudioTracks()[0]
    this.outbound.addTrack(this.micTrack)
    for (const [event, fn] of Object.entries(this._bindings)) this.socket.on(event, fn)
    return this.outbound
  }

  _onPeers({ peers }) {
    // Sou o novato: eu inicio a negociacao com quem ja estava aqui.
    for (const p of peers) this._ensurePeer(p.socketId, true)
  }

  _onPeerJoined({ socketId }) {
    // Alguem novo entrou: ele vai me mandar a oferta. Crio o peer como "polite".
    this._ensurePeer(socketId, false)
  }

  _onPeerLeft({ socketId }) {
    this._destroyPeer(socketId)
  }

  _ensurePeer(socketId, isInitiator) {
    if (this.peers.has(socketId)) return this.peers.get(socketId)

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const peer = { pc, polite: !isInitiator, makingOffer: false, ignoreOffer: false }
    this.peers.set(socketId, peer)

    for (const track of this.outbound.getTracks()) pc.addTrack(track, this.outbound)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.emit('voice:signal', { to: socketId, data: { candidate } })
    }

    pc.ontrack = ({ streams }) => {
      const stream = streams[0]
      if (stream) this.handlers.onRemoteStream?.(socketId, stream)
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true
        await pc.setLocalDescription()
        this.socket.emit('voice:signal', { to: socketId, data: { description: pc.localDescription } })
      } catch (err) {
        console.error('negotiationneeded', err)
      } finally {
        peer.makingOffer = false
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        try { pc.restartIce() } catch {}
      }
    }

    return peer
  }

  async _onSignal({ from, data }) {
    const peer = this._ensurePeer(from, false)
    const { pc } = peer
    try {
      if (data.description) {
        const collision =
          data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
        peer.ignoreOffer = !peer.polite && collision
        if (peer.ignoreOffer) return

        await pc.setRemoteDescription(data.description)
        if (data.description.type === 'offer') {
          await pc.setLocalDescription()
          this.socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } })
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate)
        } catch (err) {
          if (!peer.ignoreOffer) throw err
        }
      }
    } catch (err) {
      console.error('signal', err)
    }
  }

  setMuted(muted) {
    if (this.micTrack) this.micTrack.enabled = !muted
  }

  async startScreenShare() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 1920 } },
      audio: true,
    })
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () =>
      this.handlers.onScreenEnded?.(),
    )

    for (const track of this.screenStream.getTracks()) {
      this.outbound.addTrack(track)
      for (const { pc } of this.peers.values()) pc.addTrack(track, this.outbound)
    }
    return this.screenStream
  }

  stopScreenShare() {
    if (!this.screenStream) return
    const tracks = new Set(this.screenStream.getTracks())
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track && tracks.has(sender.track)) {
          try { pc.removeTrack(sender) } catch {}
        }
      }
    }
    for (const track of tracks) {
      this.outbound.removeTrack(track)
      track.stop()
    }
    this.screenStream = null
  }

  _destroyPeer(socketId) {
    const peer = this.peers.get(socketId)
    if (!peer) return
    try { peer.pc.close() } catch {}
    this.peers.delete(socketId)
    this.handlers.onPeerGone?.(socketId)
  }

  destroy() {
    for (const [event, fn] of Object.entries(this._bindings)) this.socket.off(event, fn)
    for (const id of [...this.peers.keys()]) this._destroyPeer(id)
    this.stopScreenShare()
    this.micTrack?.stop()
    this.micTrack = null
    this.outbound = new MediaStream()
  }
}
