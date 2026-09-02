import { io } from 'socket.io-client'
import { BASE } from './api.js'

let socket = null

export function connectSocket(token) {
  if (socket) socket.disconnect()
  socket = io(BASE, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) socket.disconnect()
  socket = null
}
