# elo

Plataforma de voz, vídeo e chat pra você e seus amigos — privada e só por convite. Chamada em
grupo, compartilhamento de tela, webcam, canais de texto com imagens e figurinhas, cargos,
moderação, tudo em tempo real.

> **Privado.** O app roda num host próprio e tem uma **trava de acesso** (`GATE_KEY`): quem não
> abrir pelo link com a chave vê uma página vazia. A URL não é divulgada aqui de propósito.

---

## O que dá pra fazer

### Voz e vídeo
- **Call em grupo** (até ~8 pessoas) — áudio P2P (WebRTC em malha), o servidor só faz a sinalização
- **Compartilhar tela** — vários ao mesmo tempo; clica numa tela pra ver em tela cheia
- **Webcam** — liga/desliga na call
- Escolha de **microfone** e **saída de áudio** (fone), com teste de microfone
- Indicador de quem está falando, mudo, surdo

### Servidores e canais
- Criar **servidores** (só o admin) com canais de **texto** e de **voz**
- **Lista de amigos** (adicionar por @usuário, aceitar pedidos)
- **Acesso ao app só por link de convite** (o 1º cadastro vira admin e gera os convites; convites
  expiram em 7 dias e valem pra 20 pessoas por padrão)
- Convite pra servidor específico

### Chat
- Texto em tempo real
- **Imagens** (cola ou botão; redimensionadas no navegador antes de enviar)
- **Figurinhas** — emojis grandes + figurinhas de imagem que qualquer um pode subir pro servidor
- Card de perfil ao clicar no avatar de alguém (nome, servidores em comum, adicionar amigo)

### Cargos e moderação
- **Cargos por servidor** com nome livre e 3 permissões: **expulsar**, **silenciar na call**,
  **mover de canal de voz**
- Na sala de voz, quem tem permissão vê um menu por pessoa: silenciar no servidor
  (a pessoa não se desmuta) ou mover pra outro canal
- **Expulsar** membro (dono, admin, ou cargo) — pelo painel do servidor ou pelo card de perfil

### Admin
- Painel de **usuários** (engrenagem → aba usuarios) — quem cadastrou/logou, remover conta,
  promover admin, **baixar backup completo**
- O admin do app enxerga e gerencia **todos** os servidores

### Conta
- Editar perfil: **nome de exibição** (único) e **foto** (recorte quadrado automático)
- **Trocar senha** (mínimo 8, bloqueia senhas comuns)
- **Sair de todos os aparelhos** (invalida tokens antigos na hora)

### Extra
- Layout **responsivo pra celular** (gaveta de canais e de membros)
- Tema escuro, scrollbars discretas

---

## Stack

| Parte     | Tecnologia                                                        |
| --------- | ---------------------------------------------------------------- |
| Frontend  | React + Vite, zustand, WebRTC nativo, socket.io-client          |
| Backend   | Node + Express 5 + Socket.IO                                     |
| Banco     | MongoDB (via adapter do lowdb: estado num doc + coleção `messages`) |
| Auth      | JWT (com `tokenVersion`) + bcrypt                               |
| Segurança | helmet + CSP, express-rate-limit                                |

O áudio/vídeo vão **direto entre os navegadores**. O backend cuida de login, dados, sinalização
WebRTC e chat.

---

## Rodando localmente

Pré-requisito: Node 20+.

```bash
git clone https://github.com/pdrchagas/elo.git
cd elo
npm install
npm run install:all          # instala server/ e web/

cp server/.env.example server/.env    # edite JWT_SECRET
# sem MONGODB_URI o backend usa um arquivo local (server/data/db.json) — ótimo pra dev

npm run dev                   # sobe backend (:4000) + frontend (:5173)
```

Depois que aparecer `VITE ... ready`, abra no navegador: `http://localhost:5173`
(não é um link clicável — só funciona com o `npm run dev` rodando). O backend fica em `:4000`.

- O **primeiro cadastro** não precisa de convite e vira **admin**.
- Em dev não tem `GATE_KEY`, então o app abre direto.
- Testar sozinho: uma janela normal + uma anônima, dois usuários, mesmo canal de voz (use fone).

---

## Variáveis de ambiente (backend)

| Variável        | Pra quê                                                            |
| --------------- | ---------------------------------------------------------------- |
| `JWT_SECRET`    | **obrigatório em produção** — segredo dos tokens (32+ caracteres) |
| `GATE_KEY`      | trava de acesso — sem ela o app abre pra qualquer um. Os links de convite já incluem o `?k=` |
| `CLIENT_ORIGIN` | origens permitidas (`*` ou lista separada por vírgula)          |
| `MONGODB_URI`   | conexão do MongoDB Atlas (sem ela, usa arquivo local)          |
| `MONGODB_DB`    | nome do banco (padrão `elo`)                                    |
| `PORT`          | porta (padrão 4000)                                             |

Frontend: `web/.env.production` deixa `VITE_API_URL` vazio (mesma origem). TURN opcional em
`VITE_TURN_*` (só necessário se algum amigo estiver atrás de NAT muito restritivo).

---

## Deploy

**É um serviço só:** o Express serve `web/dist` (o site compilado) + a API + o WebSocket na
mesma origem. Hoje está no **Render** (free) + **MongoDB Atlas** (M0).

- Passo a passo do zero: **[TESTAR-ONLINE.md](TESTAR-ONLINE.md)**
- Backup, restauração, deploy manual e rollback: **[BACKUP-E-DEPLOY.md](BACKUP-E-DEPLOY.md)**

O `render.yaml` é um blueprint — o Render lê e monta o serviço; você só cola o `MONGODB_URI`.

---

## Segurança (resumo)

- Senha em bcrypt, nunca enviada ao cliente. Mínimo 8, bloqueio de senhas comuns.
- Toda rota (menos `/api/auth/*` e `/api/health`) exige token válido; `tokenVersion` permite
  revogar sessões.
- helmet + CSP (script só `self`, imagens só `data:`), rate limit global + apertado no login.
- CORS, `trust proxy`, validação no backend, sem `dangerouslySetInnerHTML`.
- **Trava de acesso** (`GATE_KEY`): sem a chave no link, o app nem carrega — não gasta recurso
  com visitante aleatório. Os links de convite já embutem a chave.
- Convite de app só o admin cria; convites expiram e têm limite de usos.
- Correção de IDOR (canal tem que pertencer ao servidor da URL).
- `npm audit` limpo.
- Usuário do Mongo com `readWrite` só no banco `elo`.
- Backup diário (GitHub Action) + backup sob demanda + trava anti-corrupção (o servidor não sobe
  com estado corrompido e nunca sobrescreve o banco com estado inválido).

---

## Estrutura

```
elo/
├── server/                  # API + sinalização + chat
│   └── src/
│       ├── index.js          # express + socket.io + helmet + rate limit
│       ├── db.js             # lowdb com adapter de MongoDB + trava anti-corrupção
│       ├── auth.js           # JWT + tokenVersion
│       ├── perms.js          # isAppAdmin / isServerOwner / memberCan
│       ├── realtime.js       # presença (online) + eventos "sync"
│       ├── messages.js       # coleção de mensagens (Mongo) com TTL
│       ├── projection.js     # espelho legível dos usuários em elo.users
│       ├── signaling.js      # WebRTC signaling + chat + moderação de voz
│       ├── routes/           # auth, invites, friends, servers, admin, stickers
│       └── scripts/restore.mjs
├── web/                     # app React
│   └── src/
│       ├── webrtc.js         # malha P2P (perfect negotiation)
│       ├── voice.js          # store da call
│       ├── store.js          # store geral (auth, servidores, amigos, presença)
│       ├── Shell.jsx         # layout (desktop + mobile)
│       ├── VoiceStage.jsx / Chat.jsx / Settings.jsx / ...
│       └── ...
├── render.yaml
├── .github/workflows/       # keep-alive + backup-mongo
├── TESTAR-ONLINE.md
└── BACKUP-E-DEPLOY.md
```

---

## Limitações conhecidas

- Malha P2P: cada pessoa manda a mídia pra todas as outras. Com 8 pessoas **todas** compartilhando
  tela ao mesmo tempo, o upload pesa. Pra grupos maiores o caminho é um SFU (LiveKit/mediasoup).
- Render free dorme após 15 min sem uso (1ª visita ~40s pra acordar).
- Sem TURN por padrão — se algum amigo estiver atrás de CGNAT/rede corporativa, a call pode falhar.
- Compartilhar a tela do celular depende do navegador (Android/Chrome geralmente deixa; iOS não).
