# Colocar o elo online (Render + MongoDB Atlas) — 100% grátis

O backend serve o frontend na mesma origem, então é **um serviço só** no Render.
Os dados ficam no **MongoDB Atlas** (não somem em deploy/reinício).

---

## Parte 1 — MongoDB Atlas (banco)

1. https://cloud.mongodb.com → crie conta / entre.
2. **Create** → **Cluster** → plano **M0 (Free)**. Provedor/região: qualquer (de preferência perto
   da região que você vai usar no Render).
3. **Database Access** → **Add New Database User**:
   - usuário: `elo` · senha: gere uma forte e **guarde**
   - role: *Read and write to any database*
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   (O Render não tem IP fixo no plano grátis.)
5. **Clusters** → **Connect** → **Drivers** → copie a connection string. Fica assim:
   ```
   mongodb+srv://elo:<SENHA>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Troque `<SENHA>` pela senha real do usuário `elo`.

> Pode ser o mesmo cluster do projeto RWC — o app usa um database separado (`elo`), não mistura.

---

## Parte 2 — Subir o código no GitHub

```bash
cd caminho/para/elo
gh repo create elo --private --source=. --push
```

(ou crie o repo no site e `git remote add origin ... && git push -u origin main`)

---

## Parte 3 — Render (servidor)

1. https://render.com → entre com o GitHub.
2. **New +** → **Blueprint** → escolha o repositório `elo`.
   O Render lê o `render.yaml` e já cria o serviço com quase tudo pronto.
3. Ele vai pedir o valor de **`MONGODB_URI`** → cole a connection string da Parte 1.
   (`JWT_SECRET` é gerado sozinho; `CLIENT_ORIGIN=*` e `MONGODB_DB=elo` já vêm do yaml.)
4. **Apply** / **Create**. Em ~2-3 min sai no ar em `https://elo-xxxx.onrender.com`.

Se preferir criar manualmente (sem blueprint):
- Runtime **Node** · Build `npm install && npm run install:all && npm run build` · Start `npm start`
- Health check path: `/api/health`
- Env: `MONGODB_URI`, `MONGODB_DB=elo`, `JWT_SECRET` (aleatório), `CLIENT_ORIGIN=*`, `NODE_VERSION=22`

---

## Parte 4 — Manter acordado (o Render free dorme após 15 min)

Um "pinger" externo batendo em `/api/health` mantém o serviço no ar. Como você só tem 1 serviço,
isso cabe nas **750 h/mês** grátis (um serviço ligado o mês inteiro ≈ 730 h).

### Opção 1 — UptimeRobot (recomendado, mais confiável)
1. https://uptimerobot.com → conta grátis.
2. **Add New Monitor** → tipo **HTTP(s)** → URL `https://elo-xxxx.onrender.com/api/health`
   → intervalo **5 minutos**. Salvar. Pronto.

### Opção 2 — GitHub Action (já incluído no repo, como reforço)
1. No GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - nome: `RENDER_URL` · valor: `https://elo-xxxx.onrender.com`
2. O workflow `.github/workflows/keep-alive.yml` roda a cada 10 min.
   > O GitHub pausa workflows agendados se o repo ficar 60 dias sem commits — por isso a UptimeRobot
   > como principal.

Mesmo com o pinger, se o serviço reiniciar (deploy, manutenção do Render) ele fica ~40 s fora do ar
até acordar. Como os dados estão no Atlas, **nada se perde**.

---

## Rodar localmente depois

- Dev (recarga automática): `npm run dev` — usa o arquivo `server/data/db.json`, não o Mongo.
- Testar local contra o Mongo: ponha `MONGODB_URI=...` em `server/.env` e rode `npm start`.

---

## Se a voz conectar mas alguém não ouvir ninguém

NAT restritivo — precisa de um servidor **TURN**. Me avisa que eu configuro um (tem grátis).
Variáveis em `web/.env.production` (depois `npm run build` e novo deploy).

---

## Checklist

- [ ] cluster M0 criado, usuário + senha, Network Access `0.0.0.0/0`
- [ ] connection string copiada (com a senha no lugar de `<SENHA>`)
- [ ] repo no GitHub
- [ ] Render: Blueprint aplicado, `MONGODB_URI` colada
- [ ] abriu `https://elo-xxxx.onrender.com`, criou sua conta (admin)
- [ ] UptimeRobot monitorando `/api/health` a cada 5 min
- [ ] gerou o link `?invite=...` e mandou pros amigos
