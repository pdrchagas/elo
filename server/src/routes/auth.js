import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db, nanoid } from '../db.js'
import { signToken, authMiddleware } from '../auth.js'
import { notifyUser, notifyRelated } from '../realtime.js'

const r = Router()

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55D', '#FAA61A', '#00A8FC']
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    color: u.color,
    avatar: u.avatar || null,
    isAdmin: !!u.isAdmin,
  }
}

const AVATAR_RE = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]{16,}$/i
const MAX_AVATAR_CHARS = 500_000

// Consulta publica de um convite (usada pela tela de cadastro)
r.get('/invite/:code', (req, res) => {
  const inv = db.data.invites.find((i) => i.code === req.params.code)
  if (!inv) return res.status(404).json({ error: 'convite invalido' })
  const expired = inv.expiresAt && Date.now() > inv.expiresAt
  const used = inv.maxUses && inv.uses >= inv.maxUses
  const inviter = db.data.users.find((u) => u.id === inv.createdBy)
  res.json({
    invite: {
      code: inv.code,
      kind: inv.kind,
      valid: !expired && !used,
      invitedBy: inviter ? inviter.displayName : null,
    },
  })
})

r.post('/register', async (req, res) => {
  const { username, password, displayName, invite } = req.body || {}
  const uname = String(username || '').trim().toLowerCase()
  if (!USERNAME_RE.test(uname)) {
    return res.status(400).json({ error: 'usuario: 3-20 caracteres, so letras minusculas, numeros, . _ -' })
  }
  const pass = String(password || '')
  if (pass.length < 4 || pass.length > 200) return res.status(400).json({ error: 'senha: entre 4 e 200 caracteres' })
  const display = String(displayName || username).trim().slice(0, 32)

  const isFirstUser = db.data.users.length === 0
  let inviteRec = null
  if (!isFirstUser) {
    inviteRec = db.data.invites.find((i) => i.code === invite && i.kind === 'app')
    if (!inviteRec) return res.status(403).json({ error: 'esse app e so por convite — peca um link pro admin' })
    if (inviteRec.expiresAt && Date.now() > inviteRec.expiresAt) return res.status(403).json({ error: 'convite expirado' })
    if (inviteRec.maxUses && inviteRec.uses >= inviteRec.maxUses) return res.status(403).json({ error: 'convite ja foi usado o maximo de vezes' })
  }
  if (db.data.users.find((u) => u.username === uname)) return res.status(409).json({ error: 'esse nome de usuario ja existe' })

  const user = {
    id: nanoid(),
    username: uname,
    displayName: display || uname,
    passwordHash: bcrypt.hashSync(pass, 10),
    color: COLORS[db.data.users.length % COLORS.length],
    isAdmin: isFirstUser,
    createdAt: Date.now(),
  }
  db.data.users.push(user)

  if (inviteRec) {
    inviteRec.uses++
    if (inviteRec.createdBy && inviteRec.createdBy !== user.id) {
      db.data.friends.push({
        id: nanoid(),
        a: inviteRec.createdBy,
        b: user.id,
        status: 'accepted',
        requestedBy: inviteRec.createdBy,
      })
    }
  }
  await db.write()
  if (inviteRec?.createdBy) notifyUser(inviteRec.createdBy, 'sync', { scope: 'friends' })
  res.json({ token: signToken(user), user: publicUser(user) })
})

r.post('/login', async (req, res) => {
  const uname = String(req.body?.username || '').trim().toLowerCase()
  const user = db.data.users.find((u) => u.username === uname)
  if (!user || !bcrypt.compareSync(String(req.body?.password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'usuario ou senha invalidos' })
  }
  user.lastLogin = Date.now()
  user.loginCount = (user.loginCount || 0) + 1
  await db.write()
  res.json({ token: signToken(user), user: publicUser(user) })
})

r.get('/me', authMiddleware, (req, res) => {
  const user = db.data.users.find((u) => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'nao encontrado' })
  res.json({ user: publicUser(user) })
})

// editar perfil (nome de exibicao)
r.post('/profile', authMiddleware, async (req, res) => {
  const user = db.data.users.find((u) => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'nao encontrado' })
  const name = String(req.body?.displayName || '').trim().slice(0, 32)
  if (name.length < 1) return res.status(400).json({ error: 'o nome nao pode ficar vazio' })
  user.displayName = name
  await db.write()
  notifyRelated(user.id, 'sync', { scope: 'all' })
  res.json({ user: publicUser(user) })
})

// foto de perfil (envie image: null para remover)
r.post('/avatar', authMiddleware, async (req, res) => {
  const user = db.data.users.find((u) => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'nao encontrado' })

  const img = req.body?.image
  if (img === null || img === '') {
    user.avatar = null
  } else {
    const str = String(img || '')
    if (str.length > MAX_AVATAR_CHARS || !AVATAR_RE.test(str)) {
      return res.status(400).json({ error: 'imagem invalida ou muito grande' })
    }
    user.avatar = str
  }
  await db.write()
  notifyRelated(user.id, 'sync', { scope: 'all' })
  res.json({ user: publicUser(user) })
})

export default r
