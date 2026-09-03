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
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"], // RNNoise (supressao de ruido) roda em WASM
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

// ---- Trava de acesso (opcional) ----
// Se GATE_KEY estiver definida, o app so carrega pra quem chegou pelo link
// https://SEU_HOST/?k=GATE_KEY (que grava um cookie). Sem o cookie: pagina vazia,
// nenhuma chamada de API. Nao substitui o login — so evita gente aleatoria
// carregando o site e gastando recurso.
const GATE_KEY = process.env.GATE_KEY || ''
if (GATE_KEY) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next() // health check do Render / keepalive

    const cookie = (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([k]) => k === 'elo_gate')
    const hasCookie = cookie && cookie[1] === GATE_KEY

    if (req.query.k === GATE_KEY) {
      res.cookie('elo_gate', GATE_KEY, {
        maxAge: 365 * 24 * 3600 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      })
      // tira o ?k= da URL, preserva o resto (ex: ?invite=CODE)
      const rest = { ...req.query }
      delete rest.k
      const qs = new URLSearchParams(rest).toString()
      return res.redirect(302, req.path + (qs ? `?${qs}` : ''))
    }

    if (hasCookie) return next()

    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res
        .status(404)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>404</title>' +
            '<body style="margin:0;height:100vh;display:grid;place-content:center;background:#1e1f22;color:#5b5d63;font:15px system-ui">nada aqui</body>',
        )
    }
    return res.status(404).json({ error: 'not found' })
  })
}

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
  if (GATE_KEY) {
    const ok = (socket.handshake.headers.cookie || '')
      .split(';')
      .some((c) => c.trim() === `elo_gate=${GATE_KEY}`)
    if (!ok) return next(new Error('sem acesso'))
  }
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
