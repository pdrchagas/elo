import jwt from 'jsonwebtoken'
import { db } from './db.js'

const isProd = process.env.NODE_ENV === 'production'
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'dev-secret-somente-local')

if (!SECRET) {
  console.error('FATAL: defina JWT_SECRET nas variaveis de ambiente.')
  process.exit(1)
}
if (SECRET.length < 16) {
  console.error('FATAL: JWT_SECRET muito curto (use >= 32 caracteres aleatorios).')
  process.exit(1)
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, displayName: user.displayName, tv: user.tokenVersion || 0 },
    SECRET,
    { expiresIn: '30d' },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

// verifica o token E confere se ainda e valido (usuario existe e tokenVersion bate)
export function authUser(token) {
  const payload = verifyToken(token)
  const user = db.data.users.find((u) => u.id === payload.sub)
  if (!user) throw new Error('conta nao existe mais')
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) throw new Error('sessao expirada')
  return { id: user.id, username: user.username, displayName: user.displayName }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  try {
    req.user = authUser(token)
    next()
  } catch {
    res.status(401).json({ error: 'nao autenticado' })
  }
}
