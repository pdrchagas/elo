import jwt from 'jsonwebtoken'

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
    { sub: user.id, username: user.username, displayName: user.displayName },
    SECRET,
    { expiresIn: '30d' },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  try {
    const payload = verifyToken(token)
    req.user = { id: payload.sub, username: payload.username, displayName: payload.displayName }
    next()
  } catch {
    res.status(401).json({ error: 'nao autenticado' })
  }
}
