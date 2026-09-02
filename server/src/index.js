import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'

import { verifyToken } from './auth.js'
import authRoutes from './routes/auth.js'
import inviteRoutes from './routes/invites.js'
import friendRoutes from './routes/friends.js'
import serverRoutes from './routes/servers.js'
import { registerSignaling } from './signaling.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const origins = (process.env.CLIENT_ORIGIN || '*').split(',').map((s) => s.trim())
const corsOrigin = origins.includes('*') ? true : origins

const app = express()
app.use(cors({ origin: corsOrigin }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }))
app.use('/api/auth', authRoutes)
app.use('/api/invites', inviteRoutes)
app.use('/api/friends', friendRoutes)
app.use('/api/servers', serverRoutes)

// serve o frontend compilado, se existir (deploy num unico servico)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist')
if (existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: corsOrigin } })

io.use((socket, next) => {
  try {
    const payload = verifyToken(socket.handshake.auth?.token)
    socket.user = { id: payload.sub, username: payload.username, displayName: payload.displayName }
    next()
  } catch {
    next(new Error('nao autenticado'))
  }
})

registerSignaling(io)

const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`elo server rodando em http://localhost:${PORT}`))
