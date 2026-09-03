// Restaura o banco a partir de um backup JSON (o que voce baixa em Settings > usuarios).
//
//   MONGODB_URI="mongodb+srv://elo:senha@cluster0.../" node server/scripts/restore.mjs elo-backup-2026-09-02.json
//
// SOBRESCREVE o estado atual. Faca um backup novo antes, por seguranca.

import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const file = process.argv[2]
const uri = process.env.MONGODB_URI
if (!file || !uri) {
  console.error('uso: MONGODB_URI=... node server/scripts/restore.mjs <arquivo.json>')
  process.exit(1)
}

const backup = JSON.parse(readFileSync(file, 'utf8'))
if (!backup._elo_backup || !backup.state?.users) {
  console.error('arquivo nao parece um backup do elo')
  process.exit(1)
}

const dbName = process.env.MONGODB_DB || 'elo'
const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)

console.log(`restaurando para ${dbName} — ${backup.state.users.length} usuarios, ${(backup.messages || []).length} mensagens`)

await db.collection('state').updateOne(
  { _id: 'main' },
  { $set: { data: backup.state, savedAt: Date.now(), restoredFrom: file } },
  { upsert: true },
)

if (Array.isArray(backup.messages)) {
  await db.collection('messages').deleteMany({})
  if (backup.messages.length) await db.collection('messages').insertMany(backup.messages)
}

// reconstroi a colecao "users" (espelho de leitura)
await db.collection('users').deleteMany({})
for (const u of backup.state.users) {
  await db.collection('users').updateOne(
    { _id: u.id },
    {
      $set: {
        username: u.username,
        displayName: u.displayName,
        isAdmin: !!u.isAdmin,
        createdAt: u.createdAt || 0,
        lastLogin: u.lastLogin || 0,
        loginCount: u.loginCount || 0,
      },
    },
    { upsert: true },
  )
}

console.log('pronto. reinicie o serviço no Render (Manual Deploy) para recarregar o estado.')
await client.close()
