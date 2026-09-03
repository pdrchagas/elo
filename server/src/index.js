import 'dotenv/config'
import http from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'

import { authUser } from './auth.js'
import authRoutes from './routes/auth.js'
import inviteRoutes from './routes/invites.js'
import friendRoutes from './routes/friends.js'
import serverRoutes from './routes/servers.js'
import adminRoutes from './routes/admin.js'
import stickerRoutes from './routes/stickers.js'
import { registerSignaling } from './signaling.js'
import { initRealtime } from './realtime.js'
import { db } from './db.js'
import { syncAll } from './projection.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const origins = (process.env.CLIENT_ORIGIN || '*').split(',').map((s) => s.trim())
const corsOrigin = origins.includes('*') ? true : origins

const app = express()
app.set('trust proxy', 1) // Render fica atras de proxy — X-Forwarded-For

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)
app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '1mb' }))

// limite global de requisicoes por IP
app.use(
  '/api',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'muitas requisicoes, tenta de novo daqui a pouco' },
  }),
)

// limite bem mais apertado para login/cadastro (anti brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'muitas tentativas — espera uns minutos' },
})

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }))
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth', authRoutes)
app.use('/api/invites', inviteRoutes)
app.use('/api/friends', friendRoutes)
app.use('/api/servers', serverRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/stickers', stickerRoutes)

// serve o frontend compilado, se existir (deploy num unico servico)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist')
if (existsSync(webDist)) {
  app.use(express.static(webDist))
  // fallback do SPA (compativel com Express 5 — sem rota curinga)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: corsOrigin }, maxHttpBufferSize: 1.2e6 })

io.use((socket, next) => {
  try {
    socket.user = authUser(socket.handshake.auth?.token)
    next()
  } catch {
    next(new Error('nao autenticado'))
  }
})

initRealtime(io)
registerSignaling(io)

syncAll(db.data.users) // espelha usuarios pra colecao elo.users (visualizacao no Mongo)

const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`elo server rodando em http://localhost:${PORT}`))
