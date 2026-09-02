# elo

Plataforma de voz + compartilhamento de tela para você e seus amigos — estilo Discord, só que
sua e por convite.

- **Login só com usuário + senha** (sem e-mail).
- **Acesso ao app só por link de convite** (o primeiro cadastro vira admin e gera os convites).
- **Lista de amigos** e **servidores** com canais de texto e de voz.
- **Call em grupo (até ~8 pessoas)** com **compartilhamento de tela em tempo real**.
- Áudio/vídeo vão **direto entre os navegadores** (WebRTC P2P em malha). O servidor só faz
  autenticação, dados e a "sinalização".

## Stack

| Parte    | Tecnologia                                        |
| -------- | ------------------------------------------------- |
| Frontend | React + Vite, zustand, socket.io-client, WebRTC   |
| Backend  | Node + Express + Socket.IO, lowdb (arquivo JSON)  |
| Auth     | JWT + bcrypt                                      |

## Rodando localmente

Pré-requisito: Node 18+.

```bash
# 1. instalar tudo
npm install
npm run install:all

# 2. configurar o backend
cp server/.env.example server/.env      # edite JWT_SECRET
cp web/.env.example web/.env            # opcional

# 3. subir backend + frontend juntos
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

O **primeiro** cadastro não precisa de convite e vira **admin**. Depois disso, novos cadastros só
com um link `?invite=CÓDIGO` gerado na engrenagem de um servidor ("convite para o app").

## Fluxo de uso

1. Você cria a conta (admin), cria um **servidor** e escolhe amigos (ou gera um link de convite do app).
2. Manda o link `http://SEU_HOST/?invite=CÓDIGO` para os amigos — eles se cadastram só com nome e senha.
3. Todo mundo entra num **canal de voz**, clica em **compartilhar tela** e pronto.

## Testando na mesma máquina

Abra duas janelas (uma normal e uma anônima), cadastre dois usuários e entre no mesmo canal de voz.
Use fones para não dar microfonia.

## Rede / NAT

A conexão é P2P e usa STUN público do Google. Na maioria das redes domésticas funciona direto.
Se algum amigo estiver atrás de NAT restritivo (CGNAT, redes corporativas), a conexão pode falhar —
nesse caso configure um servidor **TURN** (ex.: [coturn](https://github.com/coturn/coturn) ou um
serviço como Metered/Twilio) nas variáveis `VITE_TURN_*` em `web/.env`.

## Deploy (resumo)

- **Backend**: qualquer host Node (Render, Railway, Fly, VPS). Precisa de WebSocket. Defina
  `JWT_SECRET` e `CLIENT_ORIGIN`.
- **Frontend**: `npm run build --prefix web` gera `web/dist`. Sirva como site estático (Cloudflare
  Pages, Netlify, Vercel) apontando `VITE_API_URL` para o backend — **ou** deixe o próprio backend
  servir: se `web/dist` existir, o Express serve o front na mesma origem.
- Use **HTTPS** em produção: `getUserMedia`/`getDisplayMedia` só funcionam em contexto seguro
  (localhost é exceção).

## Estrutura

```
elo/
├── server/            # API + sinalização
│   └── src/
│       ├── index.js
│       ├── db.js           # lowdb
│       ├── auth.js         # JWT
│       ├── signaling.js    # WebRTC signaling + chat
│       └── routes/
└── web/               # React app
    └── src/
        ├── webrtc.js       # malha P2P (perfect negotiation)
        ├── voice.js        # store da call
        ├── store.js        # store geral
        └── *.jsx
```

## Limitações conhecidas (é um MVP)

- Malha P2P: cada pessoa envia sua mídia para todas as outras. Com 8 pessoas **todas**
  compartilhando tela ao mesmo tempo o upload fica pesado. Para grupos maiores o caminho é um
  SFU (LiveKit/mediasoup).
- Sem permissões/moderação finas, sem reconexão automática de sessão, sem notificações push.
- O banco é um arquivo JSON (`server/data/db.json`) — ótimo para uso entre amigos, não para escala.
