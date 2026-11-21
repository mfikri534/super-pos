/* ================= GEMINI AI COPILOT (BYOK) ================= */
const Gemini = (function () {
  const KEY_LS = 'pos_gemini_api_key';
  const MODEL_LS = 'pos_gemini_model';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

  let log = []; // { role:'user'|'bot', text }

  function getKey() { return localStorage.getItem(KEY_LS) || ''; }
  function setKey(k) { localStorage.setItem(KEY_LS, String(k || '').trim()); }
  function getModel() { return localStorage.getItem(MODEL_LS) || 'gemini-2.5-flash'; }
  function setModel(m) { localStorage.setItem(MODEL_LS, m || 'gemini-2.5-flash'); }

  async function testKey() {
    const key = getKey();
    if (!key) throw new Error('API key belum diisi.');
    const res = await fetch(API_BASE + '/models?key=' + encodeURIComponent(key));
    if (!res.ok) {
      const t = await res.text();
      throw new Error('API key tidak valid / ditolak: ' + res.status + ' ' + t.slice(0, 120));
    }
    const j = await res.json();
    return { ok: true, models: (j.models || []).length };
  }

  async function generate(prompt, contextText) {
    const key = getKey();
    if (!key) throw new Error('Isi Gemini API key di Pengaturan → Gemini AI.');
    const model = getModel();

    const body = {
      contents: [{
        role: 'user',
        parts: [{ text:
          'Kamu adalah analis bisnis ritel/F&B untuk toko Indonesia. ' +
          'Jawab ringkas, terstruktur, pakai angka dari data, dan beri rekomendasi aksi konkret. ' +
          'Gunakan Bahasa Indonesia.\n\n' +
          '=== SNAPSHOT DATA TOKO ===\n' + contextText + '\n\n' +
          '=== PERTANYAAN ===\n' + prompt
        }]
      }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
    };

    const res = await fetch(
      API_BASE + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const t = await res.text();
      throw new Error('Gemini error ' + res.status + ': ' + t.slice(0, 200));
    }
    const json = await res.json();
    const parts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    return parts.map(function (p) { return p.text || ''; }).join('\n').trim() || '(tidak ada jawaban)';
  }

  async function buildSnapshot(from, to) {
    const dash = await API.call('dashboard');
    const rep = await API.call('report', { date_from: from, date_to: to });

    const lines = [];
    lines.push('Periode: ' + rep.date_from + ' s/d ' + rep.date_to);
    lines.push('Penjualan hari ini: Rp ' + (dash.today_sales || 0).toLocaleString('id-ID') + ' (' + dash.today_trx + ' transaksi)');
    lines.push('Total piutang pelanggan: Rp ' + (dash.total_debt || 0).toLocaleString('id-ID'));
    lines.push('');
    lines.push('RINGKASAN PERIODE:');
    Object.keys(rep.summary).forEach(function (k) {
      lines.push('- ' + k + ': ' + Number(rep.summary[k] || 0).toLocaleString('id-ID'));
    });
    lines.push('');
    lines.push('PAYMENT METHOD: ' + (rep.by_payment || []).map(function (p) { return p.method + '=Rp ' + p.total.toLocaleString('id-ID'); }).join('; '));
    lines.push('');
    lines.push('TOP PRODUK:');
    (rep.top_products || []).slice(0, 10).forEach(function (p) {
      lines.push('- ' + p.name + ' | qty ' + p.qty + ' | omzet Rp ' + p.revenue.toLocaleString('id-ID') + ' | profit Rp ' + p.profit.toLocaleString('id-ID'));
    });
    lines.push('');
    lines.push('KATEGORI:');
    (rep.by_category || []).forEach(function (c) {
      lines.push('- ' + c.category + ' | qty ' + c.qty + ' | omzet Rp ' + c.revenue.toLocaleString('id-ID'));
    });
    lines.push('');
    lines.push('STOK RENDAH:');
    (dash.low_stock || []).forEach(function (p) {
      lines.push('- ' + p.name + ' | stok ' + p.stock + ' | min ' + p.min_stock);
    });
    lines.push('');
    lines.push('HARIAN: ' + (rep.by_day || []).map(function (d) { return d.date + '=Rp ' + d.total.toLocaleString('id-ID'); }).join('; '));
    lines.push('EXPENSES: ' + (rep.expenses || []).map(function (e) { return e.category + '=Rp ' + (Number(e.amount) || 0).toLocaleString('id-ID'); }).join('; '));

    return lines.join('\n');
  }

  function pushLog(role, text) { log.push({ role: role, text: text }); }
  function getLog() { return log; }
  function clearLog() { log = []; }

  return {
    getKey: getKey, setKey: setKey,
    getModel: getModel, setModel: setModel,
    testKey: testKey, generate: generate, buildSnapshot: buildSnapshot,
    pushLog: pushLog, getLog: getLog, clearLog: clearLog
  };
})();