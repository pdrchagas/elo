// Gerenciador de malha WebRTC: uma RTCPeerConnection por participante.
// Usa "perfect negotiation" para lidar com renegociacao (ligar/desligar tela/camera).
//
// Saidas: 3 MediaStreams independentes -> mic (this.outbound), tela (this.screenStream),
// camera (this.camStream). Cada peer recebe ate 3 streams; qual e qual e avisado
// por um "voice:signal" com { tracks: { mic, screen, camera } } (ids dos streams).

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
    this.handlers = handlers // { onRemoteStream, onPeerTracks, onPeerGone, onScreenEnded, onCameraEnded }
    this.peers = new Map() // socketId -> { pc, polite, makingOffer, ignoreOffer }
    this.outbound = new MediaStream() // microfone
    this.micTrack = null
    this.screenStream = null
    this.camStream = null
    this._bindings = {
      'voice:peers': this._onPeers.bind(this),
      'voice:peer-joined': this._onPeerJoined.bind(this),
      'voice:peer-left': this._onPeerLeft.bind(this),
      'voice:signal': this._onSignal.bind(this),
    }
  }

  async start(micDeviceId) {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: this._micConstraints(micDeviceId),
      video: false,
    })
    this.micTrack = mic.getAudioTracks()[0]
    this.outbound.addTrack(this.micTrack)
    for (const [event, fn] of Object.entries(this._bindings)) this.socket.on(event, fn)
    return this.outbound
  }

  _micConstraints(deviceId) {
    return {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  }

  // troca o microfone sem derrubar a call (replaceTrack, sem renegociacao)
  async setMicDevice(deviceId) {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: this._micConstraints(deviceId),
      video: false,
    })
    const newTrack = s.getAudioTracks()[0]
    newTrack.enabled = this.micTrack ? this.micTrack.enabled : true
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track && sender.track === this.micTrack) {
          await sender.replaceTrack(newTrack).catch(() => {})
        }
      }
    }
    if (this.micTrack) {
      this.outbound.removeTrack(this.micTrack)
      this.micTrack.stop()
    }
    this.outbound.addTrack(newTrack)
    this.micTrack = newTrack
    this.handlers.onMicChanged?.(this.outbound)
  }

  _tracksPayload() {
    return {
      tracks: {
        mic: this.outbound.id,
        screen: this.screenStream?.id || null,
        camera: this.camStream?.id || null,
      },
    }
  }

  _announceTo(socketId) {
    this.socket.emit('voice:signal', { to: socketId, data: this._tracksPayload() })
  }

  _announceAll() {
    for (const id of this.peers.keys()) this._announceTo(id)
  }

  _onPeers({ peers }) {
    for (const p of peers) this._ensurePeer(p.socketId, true)
  }

  _onPeerJoined({ socketId }) {
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
    if (this.screenStream) for (const t of this.screenStream.getTracks()) pc.addTrack(t, this.screenStream)
    if (this.camStream) for (const t of this.camStream.getTracks()) pc.addTrack(t, this.camStream)

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

    if (this.screenStream) this._capBitrate(this.screenStream, 3_000_000)
    if (this.camStream) this._capBitrate(this.camStream, 700_000)
    this._announceTo(socketId)
    return peer
  }

  async _onSignal({ from, data }) {
    if (data.tracks) {
      this.handlers.onPeerTracks?.(from, data.tracks)
      return
    }
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
      video: { frameRate: { ideal: 30 }, height: { max: 1440 } },
      audio: true,
    })
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () =>
      this.handlers.onScreenEnded?.(),
    )
    this._addStreamToPeers(this.screenStream)
    this._capBitrate(this.screenStream, 3_000_000)
    this._announceAll()
    return this.screenStream
  }

  // limita o bitrate de saida de um stream em todos os peers (protege CPU e rede)
  _capBitrate(stream, maxBitrate) {
    const tracks = new Set(stream.getTracks())
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (!sender.track || !tracks.has(sender.track) || sender.track.kind !== 'video') continue
        const params = sender.getParameters()
        params.encodings = params.encodings?.length ? params.encodings : [{}]
        params.encodings[0].maxBitrate = maxBitrate
        sender.setParameters(params).catch(() => {})
      }
    }
  }

  stopScreenShare() {
    if (!this.screenStream) return
    this._removeStreamFromPeers(this.screenStream)
    this.screenStream = null
    this._announceAll()
  }

  async startCamera() {
    this.camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
      audio: false,
    })
    this.camStream.getVideoTracks()[0]?.addEventListener('ended', () =>
      this.handlers.onCameraEnded?.(),
    )
    this._addStreamToPeers(this.camStream)
    this._capBitrate(this.camStream, 700_000)
    this._announceAll()
    return this.camStream
  }

  stopCamera() {
    if (!this.camStream) return
    this._removeStreamFromPeers(this.camStream)
    this.camStream = null
    this._announceAll()
  }

  _addStreamToPeers(stream) {
    for (const track of stream.getTracks()) {
      for (const { pc } of this.peers.values()) pc.addTrack(track, stream)
    }
  }

  _removeStreamFromPeers(stream) {
    const tracks = new Set(stream.getTracks())
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track && tracks.has(sender.track)) {
          try { pc.removeTrack(sender) } catch {}
        }
      }
    }
    for (const track of tracks) track.stop()
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
    for (const s of [this.screenStream, this.camStream]) {
      for (const t of s?.getTracks() || []) t.stop()
    }
    this.screenStream = null
    this.camStream = null
    this.micTrack?.stop()
    this.micTrack = null
    this.outbound = new MediaStream()
  }
}
