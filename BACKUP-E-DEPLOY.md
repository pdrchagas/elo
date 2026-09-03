# Backup, restauração e deploy sem susto

## Backups (3 camadas)

1. **Automático diário** — GitHub Actions (`.github/workflows/backup.yml`)
   - roda todo dia ~03:00 (BRT), faz `mongodump` do banco `elo`
   - o arquivo fica em **GitHub → Actions → (a run) → Artifacts**, guardado 90 dias
   - **precisa do secret:** GitHub → repo `elo` → Settings → Secrets and variables → Actions →
     New repository secret → nome `MONGODB_URI`, valor = a connection string do Mongo
   - dá pra rodar na hora: Actions → "backup-mongo" → **Run workflow**

2. **Sob demanda (1 clique)** — dentro do app
   - engrenagem ⚙ → aba **usuarios** → **"baixar backup completo (json)"**
   - baixa TUDO (usuários, servidores, cargos, figurinhas, mensagens). Guarde num lugar seguro.
   - faça isso antes de qualquer mudança grande.

3. **Trava anti-corrupção** — o servidor **não sobe** se o estado no banco estiver malformado,
   e **nunca sobrescreve** o banco com um estado quebrado. Ele avisa no log e para, aí você restaura.

## Restaurar

### do backup JSON (do app)
```bash
MONGODB_URI="mongodb+srv://elo:SENHA@cluster0.xxxxx.mongodb.net/" \
  node server/scripts/restore.mjs elo-backup-2026-09-02.json
```
Depois: Render → serviço `elo` → **Manual Deploy → Deploy latest commit** (pra recarregar o estado).

### do dump do GitHub Actions (.archive)
```bash
mongorestore --uri="mongodb+srv://elo:SENHA@cluster0.xxxxx.mongodb.net/" \
  --gzip --archive=elo-20260902-0600.archive --nsInclude="elo.*" --drop
```

## Deploy sem rollback surpresa

### 1. Desligar o auto-deploy (deploy na mão)
Render → serviço `elo` → **Settings** → **Build & Deploy** → **Auto-Deploy: No**.
A partir daí, `git push` **não** sobe nada sozinho. Pra publicar:
Render → **Manual Deploy** → **Deploy latest commit** (ou escolher um commit específico).

> Mesmo com auto-deploy ligado, o Render só troca a versão no ar **depois** que o build passa e o
> health check (`/api/health`) responde. Build quebrado = produção continua na versão antiga.

### 2. Voltar uma versão (rollback)
Render → serviço `elo` → aba **Deploys** → acha um deploy verde antigo → **"Redeploy"**
(ou **"Rollback to this deploy"**). Volta pro código daquele deploy em ~2 min.

### 3. Marcar versões boas no git
Depois de confirmar que uma versão está ok:
```bash
git tag -a ok-2026-09-02 -m "versao estavel"
git push origin ok-2026-09-02
```
Se precisar voltar o código: `git checkout ok-2026-09-02` (ou faz o Redeploy pelo Render).

## Se o banco corromper

1. Não entre em pânico — o servidor vai recusar subir e **não vai piorar** o estado.
2. Pegue o backup mais recente (Actions/Artifacts ou o JSON que você baixou).
3. `node server/scripts/restore.mjs <arquivo>` (ou `mongorestore` do `.archive`).
4. Render → Manual Deploy.

## Checklist mensal

- [ ] confirmar que o workflow `backup-mongo` rodou (Actions, deve ter runs verdes)
- [ ] baixar um backup manual e guardar fora do GitHub (Drive, PC)
- [ ] confirmar que `Auto-Deploy` está como você quer no Render
