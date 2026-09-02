export const BASE = import.meta.env.VITE_API_URL || window.location.origin

let token = localStorage.getItem('elo_token') || null

export function setToken(t) {
  token = t
  if (t) localStorage.setItem('elo_token', t)
  else localStorage.removeItem('elo_token')
}

export function getToken() {
  return token
}

export async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `erro ${res.status}`)
  return data
}
