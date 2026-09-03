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
  roles: [],      // { id, serverId, name, color, canKick, canMute, canMove }
  stickers: [],   // { id, url, name, addedBy, createdAt }
  channels: [],   // { id, serverId, name, type:'text'|'voice', position }
  messages: [],   // { id, channelId, userId, content, createdAt }
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
    await this.col.updateOne({ _id: 'main' }, { $set: { data } }, { upsert: true })
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
db.data ||= structuredClone(defaultData)
for (const key of Object.keys(defaultData)) db.data[key] ??= defaultData[key]
await db.write()

export { nanoid, mongoClient }
