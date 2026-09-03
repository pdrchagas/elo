// Volume por pessoa (0..2), salvo no navegador.
function key(userId) {
  return `elo_vol_${userId}`
}
export function getUserVolume(userId) {
  const v = Number(localStorage.getItem(key(userId)))
  return Number.isFinite(v) && v >= 0 ? v : 1
}
export function saveUserVolume(userId, v) {
  localStorage.setItem(key(userId), String(v))
}
