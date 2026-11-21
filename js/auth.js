/* ================= AUTH ================= */
const Auth = (function () {

  async function sha256Hex(str) {
    if (!window.crypto || !crypto.subtle) throw new Error('Butuh HTTPS untuk hashing (Vercel sudah HTTPS).');
    const buf = new TextEncoder().encode(String(str));
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  async function login(mode, username, secret) {
    const hash = await sha256Hex(secret);
    const payload = mode === 'pin'
      ? { mode: 'pin', username: username || '', pin_hash: hash }
      : { mode: 'password', username: username || '', password_hash: hash };
    return API.call('login', payload);
  }

  async function logout() {
    try { await API.call('logout', {}); } catch (e) {}
    API.setToken('');
  }

  return { sha256Hex: sha256Hex, login: login, logout: logout };
})();