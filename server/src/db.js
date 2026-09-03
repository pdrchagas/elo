import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { nanoid } from 'nanoid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const defaultData = {
  users: [],     // { id, username, displayName, passwordHash, color, isAdmin, createdAt }
  invites: [],    // { code, kind:'app'|'server', serverId, createdBy, maxUses, uses, expiresAt, createdAt }
  friends: [],    // { id, a, b, status:'pending'|'accepted', requestedBy }
  servers: [],    // { id, name, ownerId, color, createdAt }
  members: [],    // { serverId, userId, role, roleIds:[] }
  roles: [],      // { id, serverId, name, color, canKick, canMute, canMove, canDisconnect }
  stickers: [],   // { id, url, name, addedBy, createdAt }
  channels: [],   // { id, serverId, name, type:'text'|'voice', position }
  messages: [],   // { id, channelId, userId, content, createdAt }
}

const KEYS = Object.keys(defaultData)
const CORE_KEYS = ['users', 'servers', 'members', 'channels'] // existem desde sempre

// Nao esta corrompido = objeto com as colecoes centrais sendo arrays.
// (chaves novas podem faltar num banco antigo — isso e ok, a gente preenche)
function looksValid(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    CORE_KEYS.every((k) => Array.isArray(data[k]))
  )
}

// Adapter do lowdb que guarda todo o estado num unico documento do MongoDB.
// Mantem a mesma API sincrona (db.data.users.push / .find + await db.write()),
// entao as rotas e a sinalizacao nao mudam.
class MongoAdapter {
  constructor(collection) {
    this.col = collection
  }
  async read() {
    const doc = await this.col.findOne({ _id: 'main' })
    return doc?.data ?? null
  }
  async write(data) {
    // trava de seguranca: nunca sobrescreve o estado com algo malformado
    if (!looksValid(data)) {
      console.error('db.write BLOQUEADO: estado malformado, nao vou sobrescrever o Mongo', Object.keys(data || {}))
      return
    }
    await this.col.updateOne({ _id: 'main' }, { $set: { data, savedAt: Date.now() } }, { upsert: true })
  }
}

let adapter
let mongoClient = null

if (process.env.MONGODB_URI) {
  const { MongoClient } = await import('mongodb')
  mongoClient = new MongoClient(process.env.MONGODB_URI)
  await mongoClient.connect()
  const col = mongoClient.db(process.env.MONGODB_DB || 'elo').collection('state')
  adapter = new MongoAdapter(col)
  console.log('db: MongoDB')
} else {
  const dataDir = path.join(__dirname, '..', 'data')
  mkdirSync(dataDir, { recursive: true })
  adapter = new JSONFile(path.join(dataDir, 'db.json'))
  console.log('db: arquivo local (server/data/db.json) — defina MONGODB_URI para usar o Mongo')
}

export const db = new Low(adapter, defaultData)
await db.read()

const wasEmpty = db.data == null
db.data ||= structuredClone(defaultData)

// se o banco tinha algo mas veio malformado, NAO continua (evita sobrescrever tudo)
if (!wasEmpty && !looksValid(db.data)) {
  console.error('FATAL: o estado no banco parece corrompido. Nao vou subir pra nao piorar.')
  console.error('Restaure de um backup (ver BACKUP-E-DEPLOY.md). Chaves lidas:', Object.keys(db.data))
  process.exit(1)
}

// backfill de chaves novas so em memoria; so grava se o banco estava vazio
let filled = false
for (const key of KEYS) {
  if (db.data[key] == null) {
    db.data[key] = []
    filled = true
  }
}
if (wasEmpty || (filled && looksValid(db.data))) await db.write()

export { nanoid, mongoClient }
