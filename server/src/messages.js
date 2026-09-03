import { db, mongoClient } from './db.js'

// Mensagens ficam FORA do documento de estado:
//  - com Mongo: colecao propria "messages" (evita estourar o limite de 16MB do doc)
//  - sem Mongo (dev): array no arquivo local, com teto
const PER_CHANNEL_HISTORY = 80
const LOCAL_CAP = 3000
const TTL_DAYS = 120

let col = null
if (mongoClient) {
  col = mongoClient.db(process.env.MONGODB_DB || 'elo').collection('messages')
  await col.createIndex({ channelId: 1, createdAt: 1 })
  await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * TTL_DAYS }).catch(() => {})
}

export const messages = {
  async list(channelId, limit = PER_CHANNEL_HISTORY) {
    if (col) {
      const docs = await col
        .find({ channelId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
      return docs.reverse()
    }
    return db.data.messages.filter((m) => m.channelId === channelId).slice(-limit)
  },

  async add(msg) {
    if (col) {
      await col.insertOne({ ...msg })
      return
    }
    db.data.messages.push(msg)
    if (db.data.messages.length > LOCAL_CAP) db.data.messages = db.data.messages.slice(-LOCAL_CAP)
    await db.write()
  },

  async deleteChannels(channelIds) {
    if (col) {
      await col.deleteMany({ channelId: { $in: channelIds } })
      return
    }
    db.data.messages = db.data.messages.filter((m) => !channelIds.includes(m.channelId))
    await db.write()
  },

  // todas as mensagens (usado so no backup)
  async all() {
    if (col) return col.find({}, { projection: { _id: 0 } }).toArray()
    return [...db.data.messages]
  },
}
