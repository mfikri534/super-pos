/* ================= API CLIENT ================= */
const API = (function () {
  const LS_URL = 'pos_api_url';
  const LS_TOKEN = 'pos_token';

  let baseUrl = localStorage.getItem(LS_URL) || '';
  let token = localStorage.getItem(LS_TOKEN) || '';

  function setUrl(u) {
    baseUrl = String(u || '').trim();
    localStorage.setItem(LS_URL, baseUrl);
  }
  function getUrl() { return baseUrl; }

  function setToken(t) {
    token = t || '';
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
  }
  function getToken() { return token; }

  async function call(action, payload) {
    if (!baseUrl) throw new Error('URL API belum diset (Pengaturan → Koneksi).');

    let res;
    try {
      res = await fetch(baseUrl, {
        method: 'POST',
        // WAJIB text/plain agar GAS tidak kena CORS preflight
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: token, payload: payload || {} }),
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('Tidak dapat menghubungi server: ' + e.message);
    }

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('Respons server tidak valid. Pastikan Web App di-deploy "Anyone".'); }

    if (!json.ok) {
      if (json.error === 'SESSION_EXPIRED' || json.error === 'UNAUTHORIZED') {
        setToken('');
        setTimeout(function () { location.reload(); }, 400);
      }
      throw new Error(json.error || 'API_ERROR');
    }
    return json.data;
  }

  return { call: call, setUrl: setUrl, getUrl: getUrl, setToken: setToken, getToken: getToken };
})();