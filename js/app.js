/* ================= APP ================= */
const App = (function () {
  const state = {
    user: null, settings: {}, products: [], customers: [],
    suppliers: [], shift: null, route: 'dashboard', dashboard: null
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'pos', label: 'Kasir', icon: '🛒' },
    { id: 'transactions', label: 'Transaksi', icon: '⇄' },
    { id: 'reports', label: 'Laporan', icon: '▤' },
    { id: 'products', label: 'Produk', icon: '▣' },
    { id: 'customers', label: 'Pelanggan', icon: '◉' },
    { id: 'purchases', label: 'Pembelian', icon: '⛁' },
    { id: 'shift', label: 'Shift', icon: '◔' },
    { id: 'gemini', label: 'AI Copilot', icon: '✦' },
    { id: 'settings', label: 'Pengaturan', icon: '⚙' }
  ];

  /* ---------- Utils ---------- */
  function buildNav() {
    const rail = document.getElementById('rail-nav');
    const tabbar = document.getElementById('tabbar');
    const html = NAV.map(function (n) {
      return `<button class="nav-item" data-route="${n.id}"><span class="ico">${n.icon}</span><span>${n.label}</span></button>`;
    }).join('');
    rail.innerHTML = html;
    tabbar.innerHTML = html;

    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { navigate(b.getAttribute('data-route')); });
    });
  }

  function updateChrome() {
    const cartPill = document.getElementById('cart-pill');
    if (cartPill) {
      const count = (POS.state.cart || []).reduce(function (s, i) { return s + i.qty; }, 0);
      cartPill.textContent = '🛒 ' + count;
    }
    const shiftPill = document.getElementById('shift-pill');
    if (shiftPill) {
      shiftPill.textContent = state.shift ? 'Shift: Open' : 'Shift: —';
      shiftPill.className = 'pill ' + (state.shift ? 'ok' : '');
    }
    const title = document.getElementById('topbar-title');
    if (title) {
      const nav = NAV.find(function (n) { return n.id === state.route; });
      title.textContent = nav ? nav.label : 'Dashboard';
    }
  }

  /* ---------- Boot ---------- */
  async function refresh() {
    const data = await API.call('bootstrap');
    state.user = data.user;
    state.settings = data.settings || {};
    state.products = data.products || [];
    state.customers = data.customers || [];
    state.suppliers = data.suppliers || [];
    state.shift = data.shift || null;
  }

  async function refreshSilent() {
    try {
      await refresh();
      if (state.route === 'pos') POS.renderProducts();
      updateChrome();
    } catch (e) { /* ignore */ }
  }

  function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
    document.getElementById('login-api-url').value = API.getUrl();
  }

  async function showApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');

    document.getElementById('user-name').textContent = state.user.full_name || state.user.username;
    document.getElementById('user-role').textContent = state.user.role;
    document.getElementById('user-avatar').textContent = (state.user.full_name || 'U').charAt(0).toUpperCase();
    document.getElementById('rail-outlet').textContent = state.settings.store_name || state.user.outlet_id;

    buildNav();
    navigate('dashboard');
    updateChrome();
  }

  function navigate(route) {
    state.route = route;
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-route') === route);
    });
    const root = document.getElementById('view');
    root.innerHTML = '';
    updateChrome();

    const map = {
      dashboard: renderDashboard,
      pos: function (r) { POS.render(r); },
      transactions: renderTransactions,
      reports: function (r) { Reports.render(r); },
      products: renderProducts,
      customers: renderCustomers,
      purchases: renderPurchases,
      shift: renderShift,
      gemini: renderGemini,
      settings: renderSettings
    };

    const fn = map[route] || renderDashboard;
    Promise.resolve(fn(root)).catch(function (e) {
      root.innerHTML = `<div class="card"><p class="error-text">${esc(e.message)}</p></div>`;
    });
  }

  /* ---------- Dashboard ---------- */
  async function renderDashboard(root) {
    root.innerHTML = '<div class="card">Memuat dashboard…</div>';
    const d = await API.call('dashboard');
    state.dashboard = d;

    const maxDay = Math.max.apply(null, d.days.map(function (x) { return x.total; }).concat([1]));

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Dashboard</h1><p>Ringkasan operasional ${esc(d.date)}</p></div>
        <button class="btn primary" onclick="App.navigate('pos')">+ Transaksi Baru</button>
      </div>

      <div class="kpi-grid">
        ${kpi('Penjualan Hari Ini', fmt(d.today_sales), 'brand')}
        ${kpi('Laba Hari Ini', fmt(d.today_profit))}
        ${kpi('Transaksi', d.today_trx)}
        ${kpi('Rata-rata / Transaksi', fmt(d.avg_basket))}
        ${kpi('Produk Aktif', d.product_count)}
        ${kpi('Pelanggan', d.customer_count)}
        ${kpi('Total Piutang', fmt(d.total_debt), 'warn')}
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>7 Hari Terakhir</h3>
          <div style="display:flex;align-items:flex-end;gap:8px;height:150px;margin-top:14px">
            ${d.days.map(function (x) {
              const h = Math.round((x.total / maxDay) * 120);
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
                <div title="${fmt(x.total)}" style="width:100%;background:var(--brand-soft);border-radius:8px;height:${Math.max(4, h)}px;border:1px solid #C7D2FE"></div>
                <span class="muted" style="font-size:10px">${x.date.slice(5)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card">
          <h3>Stok Menipis</h3>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Produk</th><th class="num">Stok</th><th class="num">Min</th></tr></thead>
            <tbody>${d.low_stock.map(function (p) {
              return `<tr><td>${esc(p.name)}</td><td class="num">${p.stock}</td><td class="num">${p.min_stock}</td></tr>`;
            }).join('') || '<tr><td colspan="3" class="muted">Semua stok aman</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Produk Terlaris Hari Ini</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Omzet</th></tr></thead>
          <tbody>${d.top_products.map(function (p) {
            return `<tr><td>${esc(p.name)}</td><td class="num">${p.qty}</td><td class="num">${fmt(p.revenue)}</td></tr>`;
          }).join('') || '<tr><td colspan="3" class="muted">Belum ada penjualan hari ini</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
  }

  /* ---------- Products ---------- */
  async function renderProducts(root) {
    const list = await API.call('listProducts');
    state.products = list.filter(function (p) { return String(p.is_active) !== 'false'; });

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Produk & Stok</h1><p>${list.length} produk terdaftar</p></div>
        <button class="btn primary" id="btn-add-product">+ Produk Baru</button>
      </div>
      <div class="card">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>SKU</th><th>Nama</th><th>Kategori</th>
            <th class="num">HPP</th><th class="num">Harga</th>
            <th class="num">Stok</th><th>Aksi</th>
          </tr></thead>
          <tbody>${list.map(function (p) {
            const low = (Number(p.stock) || 0) <= (Number(p.min_stock) || 0);
            return `<tr>
              <td class="mono">${esc(p.sku)}</td>
              <td>${esc(p.name)}</td>
              <td>${esc(p.category)}</td>
              <td class="num">${fmt(p.buy_price)}</td>
              <td class="num">${fmt(p.sell_price)}</td>
              <td class="num"><span class="pill ${low ? 'warn' : 'ok'}">${p.stock}</span></td>
              <td>
                <button class="btn xs ghost" data-edit-product="${esc(p.product_id)}">Edit</button>
                <button class="btn xs ghost" data-adjust="${esc(p.product_id)}">Stok</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" class="muted">Belum ada produk</td></tr>'}</tbody>
        </table></div>
      </div>
    `;

    document.getElementById('btn-add-product').addEventListener('click', function () { productModal(null); });

    root.querySelectorAll('[data-edit-product]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-edit-product');
        productModal(list.find(function (p) { return p.product_id === id; }));
      });
    });
    root.querySelectorAll('[data-adjust]').forEach(function (b) {
      b.addEventListener('click', function () { stockModal(b.getAttribute('data-adjust')); });
    });
  }

  function productModal(prod) {
    const isNew = !prod;
    prod = prod || {};
    openModal(`
      <div class="modal-head">
        <h3>${isNew ? 'Produk Baru' : 'Edit Produk'}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <label>Nama</label><input id="p-name" value="${esc(prod.name || '')}">
      <div class="row gap">
        <div style="flex:1"><label>SKU</label><input id="p-sku" value="${esc(prod.sku || '')}"></div>
        <div style="flex:1"><label>Barcode</label><input id="p-barcode" value="${esc(prod.barcode || '')}"></div>
      </div>
      <div class="row gap">
        <div style="flex:1"><label>Kategori</label><input id="p-category" value="${esc(prod.category || 'Umum')}"></div>
        <div style="flex:1"><label>Unit</label><input id="p-unit" value="${esc(prod.unit || 'pcs')}"></div>
      </div>
      <div class="row gap">
        <div style="flex:1"><label>HPP</label><input id="p-buy" type="number" value="${prod.buy_price || 0}"></div>
        <div style="flex:1"><label>Harga Jual</label><input id="p-sell" type="number" value="${prod.sell_price || 0}"></div>
      </div>
      <div class="row gap">
        <div style="flex:1"><label>Harga Member</label><input id="p-member" type="number" value="${prod.member_price || 0}"></div>
        <div style="flex:1"><label>Min Stok</label><input id="p-min" type="number" value="${prod.min_stock || 0}"></div>
      </div>
      <div class="row gap">
        <div style="flex:1"><label>Qty Grosir</label><input id="p-wmin" type="number" value="${prod.wholesale_min_qty || 0}"></div>
        <div style="flex:1"><label>Harga Grosir</label><input id="p-wprice" type="number" value="${prod.wholesale_price || 0}"></div>
      </div>
      ${isNew ? '<label>Stok Awal</label><input id="p-stock" type="number" value="0">' : ''}
      <button class="btn primary w-full" id="btn-save-product" style="margin-top:16px">Simpan</button>
      <p id="p-error" class="error-text hidden"></p>
    `);

    document.getElementById('btn-save-product').addEventListener('click', async function () {
      try {
        const payload = {
          product_id: prod.product_id || '',
          name: document.getElementById('p-name').value,
          sku: document.getElementById('p-sku').value,
          barcode: document.getElementById('p-barcode').value,
          category: document.getElementById('p-category').value,
          unit: document.getElementById('p-unit').value,
          buy_price: Number(document.getElementById('p-buy').value),
          sell_price: Number(document.getElementById('p-sell').value),
          member_price: Number(document.getElementById('p-member').value),
          min_stock: Number(document.getElementById('p-min').value),
          wholesale_min_qty: Number(document.getElementById('p-wmin').value),
          wholesale_price: Number(document.getElementById('p-wprice').value)
        };
        if (isNew) payload.stock = Number(document.getElementById('p-stock').value);
        await API.call('saveProduct', payload);
        closeModal();
        toast('Produk tersimpan', 'ok');
        await refreshSilent();
        navigate('products');
      } catch (e) {
        const el = document.getElementById('p-error');
        el.textContent = e.message; el.classList.remove('hidden');
      }
    });
  }

  function stockModal(productId) {
    const prod = (state.products || []).find(function (p) { return p.product_id === productId; });
    if (!prod) return;
    openModal(`
      <div class="modal-head">
        <h3>Penyesuaian Stok — ${esc(prod.name)}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <p class="muted small">Stok sekarang: <strong>${prod.stock}</strong></p>
      <label>Mode</label>
      <select id="st-mode">
        <option value="delta">Tambah / Kurangi (delta)</option>
        <option value="set">Set Nilai Akhir</option>
      </select>
      <label>Jumlah</label>
      <input id="st-value" type="number" value="0">
      <label>Catatan</label>
      <input id="st-notes" placeholder="Stock opname, rusak, dsb.">
      <button class="btn primary w-full" id="btn-save-stock" style="margin-top:16px">Terapkan</button>
    `);
    document.getElementById('btn-save-stock').addEventListener('click', async function () {
      try {
        await API.call('adjustStock', {
          product_id: productId,
          mode: document.getElementById('st-mode').value,
          value: Number(document.getElementById('st-value').value),
          notes: document.getElementById('st-notes').value
        });
        closeModal(); toast('Stok diperbarui', 'ok');
        await refreshSilent(); navigate('products');
      } catch (e) { toast(e.message, 'bad'); }
    });
  }

  /* ---------- Customers ---------- */
  async function renderCustomers(root) {
    const list = await API.call('listCustomers');
    state.customers = list;

    root.innerHTML = `
      <div class="page-head">
        <div><h1>Pelanggan & Piutang</h1><p>${list.length} pelanggan</p></div>
        <button class="btn primary" id="btn-add-cust">+ Pelanggan Baru</button>
      </div>
      <div class="card">
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr>
            <th>Nama</th><th>Kode</th><th>Telepon</th><th>Tier</th>
            <th class="num">Poin</th><th class="num">Hutang</th>
            <th class="num">Limit</th><th>Aksi</th>
          </tr></thead>
          <tbody>${list.map(function (c) {
            const debt = Number(c.current_debt) || 0;
            return `<tr>
              <td>${esc(c.name)}</td>
              <td class="mono">${esc(c.member_code)}</td>
              <td>${esc(c.phone || '-')}</td>
              <td><span class="pill">${esc(c.tier)}</span></td>
              <td class="num">${c.points || 0}</td>
              <td class="num">${debt > 0 ? `<span class="pill bad">${fmt(debt)}</span>` : fmt(0)}</td>
              <td class="num">${fmt(c.credit_limit)}</td>
              <td>
                <button class="btn xs ghost" data-edit-cust="${esc(c.customer_id)}">Edit</button>
                ${debt > 0 ? `<button class="btn xs ghost" data-pay-cust="${esc(c.customer_id)}">Bayar Hutang</button>` : ''}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="8" class="muted">Belum ada pelanggan</td></tr>'}</tbody>
        </table></div>
      </div>
    `;

    document.getElementById('btn-add-cust').addEventListener('click', function () { customerModal(null); });
    root.querySelectorAll('[data-edit-cust]').forEach(function (b) {
      b.addEventListener('click', function () {
        customerModal(list.find(function (c) { return c.customer_id === b.getAttribute('data-edit-cust'); }));
      });
    });
    root.querySelectorAll('[data-pay-cust]').forEach(function (b) {
      b.addEventListener('click', function () { debtModal(b.getAttribute('data-pay-cust')); });
    });
  }

  function customerModal(cust) {
    const isNew = !cust;
    cust = cust || {};
    openModal(`
      <div class="modal-head">
        <h3>${isNew ? 'Pelanggan Baru' : 'Edit Pelanggan'}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <label>Nama</label><input id="c-name" value="${esc(cust.name || '')}">
      <div class="row gap">
        <div style="flex:1"><label>Telepon</label><input id="c-phone" value="${esc(cust.phone || '')}"></div>
        <div style="flex:1"><label>Tier</label>
          <select id="c-tier">
            ${['Regular', 'Silver', 'Gold', 'VIP'].map(function (t) {
              return `<option ${cust.tier === t ? 'selected' : ''}>${t}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
      <label>Alamat</label><input id="c-address" value="${esc(cust.address || '')}">
      <label>Limit Kredit (Rp)</label><input id="c-limit" type="number" value="${cust.credit_limit || 0}">
      <button class="btn primary w-full" id="btn-save-cust" style="margin-top:16px">Simpan</button>
    `);
    document.getElementById('btn-save-cust').addEventListener('click', async function () {
      try {
        await API.call('saveCustomer', {
          customer_id: cust.customer_id || '',
          name: document.getElementById('c-name').value,
          phone: document.getElementById('c-phone').value,
          tier: document.getElementById('c-tier').value,
          address: document.getElementById('c-address').value,
          credit_limit: Number(document.getElementById('c-limit').value)
        });
        closeModal(); toast('Pelanggan tersimpan', 'ok');
        await refreshSilent(); navigate('customers');
      } catch (e) { toast(e.message, 'bad'); }
    });
  }

  function debtModal(customerId) {
    const cust = (state.customers || []).find(function (c) { return c.customer_id === customerId; });
    if (!cust) return;
    openModal(`
      <div class="modal-head">
        <h3>Terima Pembayaran Hutang</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <p class="muted small">${esc(cust.name)} — Hutang: <strong>${fmt(cust.current_debt)}</strong></p>
      <label>Nominal</label><input id="d-amount" type="number" value="${cust.current_debt}">
      <label>Metode</label>
      <select id="d-method"><option>Cash</option><option>QRIS</option><option>Transfer</option></select>
      <label>Catatan</label><input id="d-notes">
      <button class="btn primary w-full" id="btn-save-debt" style="margin-top:16px">Simpan Pembayaran</button>
    `);
    document.getElementById('btn-save-debt').addEventListener('click', async function () {
      try {
        await API.call('recordDebtPayment', {
          customer_id: customerId,
          amount: Number(document.getElementById('d-amount').value),
          method: document.getElementById('d-method').value,
          notes: document.getElementById('d-notes').value
        });
        closeModal(); toast('Pembayaran dicatat', 'ok');
        await refreshSilent(); navigate('customers');
      } catch (e) { toast(e.message, 'bad'); }
    });
  }

  /* ---------- Transactions ---------- */
  async function renderTransactions(root) {
    const today = new Date().toISOString().slice(0, 10);
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Transaksi</h1><p>Riwayat, void, refund, cetak ulang</p></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label>Dari</label><input type="date" id="tx-from" value="${today}"></div>
          <div><label>Sampai</label><input type="date" id="tx-to" value="${today}"></div>
          <div style="flex:1;min-width:180px"><label>Cari</label><input id="tx-search" placeholder="Invoice / pelanggan"></div>
          <button class="btn primary" id="btn-load-tx">Tampilkan</button>
        </div>
      </div>
      <div class="card"><div id="tx-table">Memuat…</div></div>
    `;

    document.getElementById('btn-load-tx').addEventListener('click', loadTx);
    loadTx();

    async function loadTx() {
      const box = document.getElementById('tx-table');
      box.innerHTML = 'Memuat…';
      try {
        const list = await API.call('listTransactions', {
          date_from: document.getElementById('tx-from').value,
          date_to: document.getElementById('tx-to').value,
          search: document.getElementById('tx-search').value
        });
        if (!list.length) { box.innerHTML = '<div class="empty">Tidak ada transaksi.</div>'; return; }
        box.innerHTML = `
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr>
              <th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Metode</th>
              <th class="num">Total</th><th>Status</th><th>Aksi</th>
            </tr></thead>
            <tbody>${list.map(function (t) {
              const badge = t.status === 'Completed' ? 'ok' : (t.status === 'Void' ? 'bad' : 'warn');
              return `<tr>
                <td class="mono">${esc(t.invoice_no)}</td>
                <td>${esc(String(t.timestamp))}</td>
                <td>${esc(t.customer_name || 'Umum')}</td>
                <td>${esc(t.payment_method)}</td>
                <td class="num">${fmt(t.grand_total)}</td>
                <td><span class="pill ${badge}">${esc(t.status)}</span></td>
                <td>
                  <button class="btn xs ghost" data-view="${esc(t.trx_id)}">Detail</button>
                  <button class="btn xs ghost" data-print="${esc(t.trx_id)}">🖨</button>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        `;
        box.querySelectorAll('[data-view]').forEach(function (b) {
          b.addEventListener('click', function () { txDetail(b.getAttribute('data-view')); });
        });
        box.querySelectorAll('[data-print]').forEach(function (b) {
          b.addEventListener('click', function () { reprint(b.getAttribute('data-print')); });
        });
      } catch (e) {
        box.innerHTML = `<p class="error-text">${esc(e.message)}</p>`;
      }
    }
  }

  async function txDetail(trxId) {
    const data = await API.call('getTransaction', { trx_id: trxId });
    const t = data.transaction;
    const items = data.items || [];
    openModal(`
      <div class="modal-head">
        <h3>${esc(t.invoice_no)}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <p class="muted small">${esc(String(t.timestamp))} • ${esc(t.customer_name)} • ${esc(t.payment_method)}</p>
      <div class="divider"></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Total</th></tr></thead>
        <tbody>${items.map(function (i) {
          return `<tr><td>${esc(i.product_name)}</td><td class="num">${i.qty}</td><td class="num">${fmt(i.unit_price)}</td><td class="num">${fmt(i.line_total)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="divider"></div>
      <div class="totals">
        <div class="row between"><span>Subtotal</span><span class="mono">${fmt(t.subtotal)}</span></div>
        <div class="row between"><span>Pajak</span><span class="mono">${fmt(t.tax_amount)}</span></div>
        <div class="row between"><strong>Grand Total</strong><strong class="mono">${fmt(t.grand_total)}</strong></div>
        <div class="row between"><span>Dibayar</span><span class="mono">${fmt(t.amount_paid)}</span></div>
        <div class="row between"><span>Status</span><span class="pill ${t.payment_status === 'Paid' ? 'ok' : 'warn'}">${esc(t.payment_status)}</span></div>
      </div>
      ${t.status === 'Completed' ? `
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn danger" id="btn-void">Void</button>
          <button class="btn ghost" id="btn-refund">Refund</button>
        </div>` : `<p class="muted small" style="margin-top:12px">Transaksi ${esc(t.status)}</p>`}
    `);

    if (t.status === 'Completed') {
      document.getElementById('btn-void').addEventListener('click', async function () {
        if (!confirm('Void transaksi ini? Stok akan dikembalikan.')) return;
        try { await API.call('voidTransaction', { trx_id: trxId, reason: 'Void manual' }); closeModal(); toast('Transaksi di-void', 'ok'); navigate('transactions'); }
        catch (e) { toast(e.message, 'bad'); }
      });
      document.getElementById('btn-refund').addEventListener('click', async function () {
        if (!confirm('Refund transaksi ini? Stok akan dikembalikan.')) return;
        try { await API.call('refundTransaction', { trx_id: trxId, reason: 'Refund manual' }); closeModal(); toast('Transaksi direfund', 'ok'); navigate('transactions'); }
        catch (e) { toast(e.message, 'bad'); }
      });
    }
  }

  async function reprint(trxId) {
    try {
      const data = await API.call('getTransaction', { trx_id: trxId });
      const t = data.transaction;
      t.items = data.items;
      if (!Printer.isConnected()) {
        const name = await Printer.connect();
        toast('Terhubung ke ' + name, 'ok');
      }
      await Printer.printReceipt(t, state.settings);
      toast('Struk tercetak', 'ok');
    } catch (e) { toast('Print gagal: ' + e.message, 'bad'); }
  }

  /* ---------- Purchases ---------- */
  async function renderPurchases(root) {
    root.innerHTML = `
      <div class="page-head"><div><h1>Pembelian & Biaya</h1><p>Supplier, Purchase Order, Expenses</p></div></div>
      <div class="card" style="margin-bottom:16px">
        <div class="row gap wrap">
          <button class="btn primary sm" data-tab="exp">Biaya Operasional</button>
          <button class="btn ghost sm" data-tab="sup">Supplier</button>
          <button class="btn ghost sm" data-tab="po">Purchase Order</button>
        </div>
      </div>
      <div id="purch-body"></div>
    `;
    const body = document.getElementById('purch-body');
    const tabs = root.querySelectorAll('[data-tab]');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.forEach(function (x) { x.className = 'btn ghost sm'; });
        b.className = 'btn primary sm';
        if (b.getAttribute('data-tab') === 'exp') renderExpenses(body);
        if (b.getAttribute('data-tab') === 'sup') renderSuppliers(body);
        if (b.getAttribute('data-tab') === 'po') renderPO(body);
      });
    });
    renderExpenses(body);
  }

  async function renderExpenses(body) {
    const list = await API.call('listExpenses', {});
    body.innerHTML = `
      <div class="card">
        <div class="between" style="margin-bottom:12px">
          <h3>Biaya Operasional</h3>
          <button class="btn primary sm" id="btn-add-exp">+ Biaya</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th class="num">Nominal</th></tr></thead>
          <tbody>${list.map(function (e) {
            return `<tr>
              <td>${esc(String(e.date_ymd))}</td>
              <td>${esc(e.category)}</td>
              <td>${esc(e.description || '')}</td>
              <td class="num">${fmt(e.amount)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Belum ada biaya</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
    document.getElementById('btn-add-exp').addEventListener('click', function () {
      openModal(`
        <div class="modal-head"><h3>Catat Biaya</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
        <label>Tanggal</label><input type="date" id="ex-date" value="${new Date().toISOString().slice(0, 10)}">
        <label>Kategori</label>
        <select id="ex-cat">
          ${['Rent', 'Utilities', 'Salary', 'Supplies', 'Marketing', 'Other'].map(function (c) { return `<option>${c}</option>`; }).join('')}
        </select>
        <label>Deskripsi</label><input id="ex-desc">
        <label>Nominal</label><input type="number" id="ex-amount" value="0">
        <button class="btn primary w-full" id="btn-save-exp" style="margin-top:16px">Simpan</button>
      `);
      document.getElementById('btn-save-exp').addEventListener('click', async function () {
        try {
          await API.call('saveExpense', {
            date_ymd: document.getElementById('ex-date').value,
            category: document.getElementById('ex-cat').value,
            description: document.getElementById('ex-desc').value,
            amount: Number(document.getElementById('ex-amount').value)
          });
          closeModal(); toast('Biaya tersimpan', 'ok'); renderExpenses(body);
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
  }

  async function renderSuppliers(body) {
    const list = await API.call('listSuppliers');
    body.innerHTML = `
      <div class="card">
        <div class="between" style="margin-bottom:12px">
          <h3>Supplier</h3>
          <button class="btn primary sm" id="btn-add-sup">+ Supplier</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Nama</th><th>Kontak</th><th>Telepon</th><th>Term</th></tr></thead>
          <tbody>${list.map(function (s) {
            return `<tr>
              <td>${esc(s.name)}</td><td>${esc(s.contact_person || '-')}</td>
              <td>${esc(s.phone || '-')}</td><td>${esc(s.payment_terms || '-')}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Belum ada supplier</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
    document.getElementById('btn-add-sup').addEventListener('click', function () {
      openModal(`
        <div class="modal-head"><h3>Supplier Baru</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
        <label>Nama</label><input id="s-name">
        <label>Kontak</label><input id="s-contact">
        <label>Telepon</label><input id="s-phone">
        <button class="btn primary w-full" id="btn-save-sup" style="margin-top:16px">Simpan</button>
      `);
      document.getElementById('btn-save-sup').addEventListener('click', async function () {
        try {
          await API.call('saveSupplier', {
            name: document.getElementById('s-name').value,
            contact_person: document.getElementById('s-contact').value,
            phone: document.getElementById('s-phone').value
          });
          closeModal(); toast('Supplier tersimpan', 'ok'); renderSuppliers(body);
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
  }

  async function renderPO(body) {
    const list = await API.call('listPO');
    body.innerHTML = `
      <div class="card">
        <h3>Purchase Order</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>No</th><th>Supplier</th><th class="num">Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${list.map(function (po) {
            return `<tr>
              <td class="mono">${esc(po.po_no)}</td>
              <td>${esc(po.supplier_name || '-')}</td>
              <td class="num">${fmt(po.total_amount)}</td>
              <td><span class="pill ${po.status === 'Received' ? 'ok' : 'warn'}">${esc(po.status)}</span></td>
              <td>${po.status !== 'Received'
                ? `<button class="btn xs ghost" data-receive="${esc(po.po_id)}">Terima</button>`
                : '<span class="muted small">—</span>'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">Belum ada PO</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
    body.querySelectorAll('[data-receive]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Terima PO ini? Stok produk akan bertambah.')) return;
        try {
          await API.call('receivePO', { po_id: b.getAttribute('data-receive') });
          toast('PO diterima, stok diperbarui', 'ok');
          await refreshSilent();
          renderPO(body);
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
  }

  /* ---------- Shift ---------- */
  async function renderShift(root) {
    const shift = await API.call('currentShift');
    state.shift = shift;
    updateChrome();

    root.innerHTML = `
      <div class="page-head"><div><h1>Shift & Kas</h1><p>Buka / tutup shift kasir</p></div></div>
      <div class="grid-2">
        <div class="card">
          <h3>Status Shift</h3>
          ${shift ? `
            <p class="muted small" style="margin-top:8px">Dibuka: ${esc(String(shift.opened_at))}</p>
            <div class="totals" style="margin-top:12px">
              <div class="row between"><span>Kas Awal</span><span class="mono">${fmt(shift.opening_cash)}</span></div>
              <div class="row between"><span>Penjualan Cash</span><span class="mono">${fmt(shift.cash_sales)}</span></div>
            </div>
            <label style="margin-top:14px">Kas Akhir (actual)</label>
            <input id="sh-actual" type="number" value="${(Number(shift.opening_cash) || 0) + (Number(shift.cash_sales) || 0)}">
            <button class="btn danger w-full" id="btn-close-shift" style="margin-top:12px">Tutup Shift</button>
          ` : `
            <p class="muted small" style="margin-top:8px">Belum ada shift terbuka.</p>
            <label style="margin-top:14px">Kas Awal</label>
            <input id="sh-opening" type="number" value="0">
            <button class="btn primary w-full" id="btn-open-shift" style="margin-top:12px">Buka Shift</button>
          `}
        </div>
        <div class="card">
          <h3>Printer Bluetooth</h3>
          <p class="muted small" style="margin-top:8px" id="printer-status">Belum terhubung</p>
          <label style="margin-top:14px"><input type="checkbox" id="auto-print" style="width:auto" ${localStorage.getItem('pos_auto_print') === 'true' ? 'checked' : ''}> Auto-print struk setelah bayar</label>
          <label>Lebar Kertas</label>
          <select id="paper-width">
            <option value="58" ${String(state.settings.paper_width) === '58' ? 'selected' : ''}>58mm</option>
            <option value="80" ${String(state.settings.paper_width) === '80' ? 'selected' : ''}>80mm</option>
          </select>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button class="btn ghost sm" id="btn-printer-connect">Hubungkan</button>
            <button class="btn ghost sm" id="btn-printer-test">Test Print</button>
          </div>
        </div>
      </div>
    `;

    if (shift) {
      document.getElementById('btn-close-shift').addEventListener('click', async function () {
        try {
          const res = await API.call('closeShift', {
            shift_id: shift.shift_id,
            actual_cash: Number(document.getElementById('sh-actual').value)
          });
          toast('Shift ditutup. Variance: ' + fmt(res.variance), 'ok');
          await refreshSilent(); navigate('shift');
        } catch (e) { toast(e.message, 'bad'); }
      });
    } else {
      document.getElementById('btn-open-shift').addEventListener('click', async function () {
        try {
          await API.call('openShift', { opening_cash: Number(document.getElementById('sh-opening').value) });
          toast('Shift dibuka', 'ok');
          await refreshSilent(); navigate('shift');
        } catch (e) { toast(e.message, 'bad'); }
      });
    }

    document.getElementById('auto-print').addEventListener('change', function (e) {
      localStorage.setItem('pos_auto_print', e.target.checked ? 'true' : 'false');
    });

    document.getElementById('paper-width').addEventListener('change', async function (e) {
      try {
        state.settings = await API.call('saveSettings', { settings: { paper_width: e.target.value } });
        toast('Lebar kertas disimpan', 'ok');
      } catch (err) { toast(err.message, 'bad'); }
    });

    document.getElementById('btn-printer-connect').addEventListener('click', async function () {
      try {
        const name = await Printer.connect();
        document.getElementById('printer-status').textContent = 'Terhubung: ' + name;
        toast('Printer terhubung', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    });

    document.getElementById('btn-printer-test').addEventListener('click', async function () {
      try {
        if (!Printer.isConnected()) await Printer.connect();
        await Printer.testPrint(state.settings);
        toast('Test print terkirim', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    });
  }

  /* ---------- Gemini ---------- */
  function renderGemini(root) {
    const key = Gemini.getKey();
    root.innerHTML = `
      <div class="page-head"><div><h1>Gemini AI Copilot</h1><p>Analisis bisnis dengan API key pribadi (BYOK)</p></div></div>

      <div class="card" style="margin-bottom:16px">
        <h3>Konfigurasi</h3>
        <label style="margin-top:10px">Gemini API Key (AIza...)</label>
        <input id="gm-key" type="password" placeholder="AIza..." value="${esc(key)}">
        <div class="row gap" style="margin-top:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <label>Model</label>
            <select id="gm-model">
              <option value="gemini-2.5-flash" ${Gemini.getModel() === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
              <option value="gemini-2.5-pro" ${Gemini.getModel() === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro</option>
            </select>
          </div>
          <button class="btn ghost sm" id="btn-gm-test" style="align-self:flex-end">Test API Key</button>
          <button class="btn primary sm" id="btn-gm-save" style="align-self:flex-end">Simpan</button>
        </div>
        <p class="muted small" style="margin-top:8px">Key disimpan di localStorage browser — tidak pernah masuk ke repo.</p>
      </div>

      <div class="card">
        <h3>Prompt Cepat</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="chip" data-prompt="Analisa profit & margin periode ini. Beri rekomendasi perbaikan.">Analisa Profit & Margin</button>
          <button class="chip" data-prompt="Rekomendasi restock & produk slow-moving berdasarkan data stok.">Rekomendasi Restock</button>
          <button class="chip" data-prompt="Buat strategi promo bundling & template WhatsApp blast pelanggan.">Strategi Promo & WA Blast</button>
          <button class="chip" data-prompt="Deteksi anomali void, diskon berlebih, dan piutang macet.">Deteksi Anomali</button>
        </div>

        <div class="divider"></div>
        <div class="ai-log" id="gm-log"></div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <input id="gm-input" placeholder="Tanya apa saja tentang bisnis Anda…" style="flex:1">
          <button class="btn primary" id="btn-gm-send">Kirim</button>
        </div>
        <p id="gm-error" class="error-text hidden"></p>
      </div>
    `;

    renderLog();

    document.getElementById('btn-gm-save').addEventListener('click', function () {
      Gemini.setKey(document.getElementById('gm-key').value);
      Gemini.setModel(document.getElementById('gm-model').value);
      toast('Konfigurasi Gemini disimpan', 'ok');
    });

    document.getElementById('btn-gm-test').addEventListener('click', async function () {
      Gemini.setKey(document.getElementById('gm-key').value);
      try {
        const r = await Gemini.testKey();
        toast('API key valid. Model tersedia: ' + r.models, 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    });

    root.querySelectorAll('[data-prompt]').forEach(function (b) {
      b.addEventListener('click', function () { ask(b.getAttribute('data-prompt')); });
    });
    document.getElementById('btn-gm-send').addEventListener('click', function () {
      ask(document.getElementById('gm-input').value);
    });
  }

  function renderLog() {
    const box = document.getElementById('gm-log');
    if (!box) return;
    const log = Gemini.getLog();
    if (!log.length) { box.innerHTML = '<p class="muted small">Belum ada percakapan.</p>'; return; }
    box.innerHTML = log.map(function (m) {
      return `<div class="ai-msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.text)}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function ask(prompt) {
    if (!prompt || !prompt.trim()) return;
    const errEl = document.getElementById('gm-error');
    errEl.classList.add('hidden');
    Gemini.pushLog('user', prompt);
    renderLog();
    document.getElementById('gm-input').value = '';

    const box = document.getElementById('gm-log');
    const loading = document.createElement('div');
    loading.className = 'ai-msg bot';
    loading.textContent = 'Menganalisis data…';
    box.appendChild(loading);

    try {
      const from = new Date(); from.setDate(from.getDate() - 29);
      const to = new Date();
      const ctx = await Gemini.buildSnapshot(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
      const answer = await Gemini.generate(prompt, ctx);
      loading.remove();
      Gemini.pushLog('bot', answer);
      renderLog();
    } catch (e) {
      loading.remove();
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }

  /* ---------- Settings ---------- */
  async function renderSettings(root) {
    const s = state.settings;
    let users = [];
    try { users = await API.call('listUsers'); } catch (e) {}

    root.innerHTML = `
      <div class="page-head"><div><h1>Pengaturan</h1><p>Profil toko, pajak, pengguna, koneksi</p></div></div>

      <div class="grid-2">
        <div class="card">
          <h3>Profil Toko</h3>
          <label>Nama Toko</label><input id="set-name" value="${esc(s.store_name || '')}">
          <label>Alamat</label><input id="set-address" value="${esc(s.store_address || '')}">
          <label>Telepon</label><input id="set-phone" value="${esc(s.store_phone || '')}">
          <label>Footer Struk</label><input id="set-footer" value="${esc(s.receipt_footer || '')}">
          <button class="btn primary w-full" id="btn-save-store" style="margin-top:16px">Simpan Profil</button>
        </div>

        <div class="card">
          <h3>Pajak & Operasional</h3>
          <label>Pajak (%)</label><input id="set-tax" type="number" value="${s.tax_percent || 0}">
          <label>Service Charge (%)</label><input id="set-service" type="number" value="${s.service_charge_percent || 0}">
          <label>Konversi Poin (Rp per 1 poin)</label><input id="set-points" type="number" value="${s.loyalty_point_rate || 10000}">
          <label class="check"><input type="checkbox" id="set-negative" ${String(s.allow_negative_stock) === 'true' ? 'checked' : ''}> Izinkan stok minus</label>
          <button class="btn primary w-full" id="btn-save-ops" style="margin-top:12px">Simpan</button>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Koneksi API</h3>
        <label>GAS Web App URL</label>
        <input id="set-api-url" value="${esc(API.getUrl())}">
        <button class="btn ghost" id="btn-save-url" style="margin-top:10px">Simpan URL</button>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="between" style="margin-bottom:12px">
          <h3>Pengguna</h3>
          <button class="btn primary sm" id="btn-add-user">+ Pengguna</button>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${users.map(function (u) {
            return `<tr>
              <td class="mono">${esc(u.username)}</td>
              <td>${esc(u.full_name)}</td>
              <td><span class="pill brand">${esc(u.role)}</span></td>
              <td><span class="pill ${u.status === 'Active' ? 'ok' : 'bad'}">${esc(u.status)}</span></td>
              <td><button class="btn xs ghost" data-edit-user="${esc(u.user_id)}">Edit</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">Belum ada pengguna</td></tr>'}</tbody>
        </table></div>
      </div>
    `;

    document.getElementById('btn-save-store').addEventListener('click', async function () {
      try {
        state.settings = await API.call('saveSettings', { settings: {
          store_name: document.getElementById('set-name').value,
          store_address: document.getElementById('set-address').value,
          store_phone: document.getElementById('set-phone').value,
          receipt_footer: document.getElementById('set-footer').value
        }});
        toast('Profil toko disimpan', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    });

    document.getElementById('btn-save-ops').addEventListener('click', async function () {
      try {
        state.settings = await API.call('saveSettings', { settings: {
          tax_percent: document.getElementById('set-tax').value,
          service_charge_percent: document.getElementById('set-service').value,
          loyalty_point_rate: document.getElementById('set-points').value,
          allow_negative_stock: document.getElementById('set-negative').checked ? 'true' : 'false'
        }});
        toast('Pengaturan operasional disimpan', 'ok');
      } catch (e) { toast(e.message, 'bad'); }
    });

    document.getElementById('btn-save-url').addEventListener('click', function () {
      API.setUrl(document.getElementById('set-api-url').value);
      toast('URL API disimpan', 'ok');
    });

    document.getElementById('btn-add-user').addEventListener('click', function () { userModal(null); });
    root.querySelectorAll('[data-edit-user]').forEach(function (b) {
      b.addEventListener('click', function () {
        userModal(users.find(function (u) { return u.user_id === b.getAttribute('data-edit-user'); }));
      });
    });
  }

  function userModal(user) {
    const isNew = !user;
    user = user || {};
    openModal(`
      <div class="modal-head">
        <h3>${isNew ? 'Pengguna Baru' : 'Edit Pengguna'}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <label>Username</label><input id="u-username" value="${esc(user.username || '')}">
      <label>Nama Lengkap</label><input id="u-fullname" value="${esc(user.full_name || '')}">
      <label>Role</label>
      <select id="u-role">
        ${['Owner', 'Admin', 'Manager', 'Cashier'].map(function (r) {
          return `<option ${user.role === r ? 'selected' : ''}>${r}</option>`;
        }).join('')}
      </select>
      <label>Status</label>
      <select id="u-status">
        <option ${user.status === 'Active' ? 'selected' : ''}>Active</option>
        <option ${user.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
      </select>
      <label>Password ${isNew ? '' : '(kosongkan jika tidak diubah)'}</label>
      <input id="u-password" type="password" placeholder="••••••••">
      <label>PIN 6 Digit</label>
      <input id="u-pin" type="text" maxlength="6" placeholder="123456">
      <button class="btn primary w-full" id="btn-save-user" style="margin-top:16px">Simpan</button>
      <p id="u-error" class="error-text hidden"></p>
    `);
    document.getElementById('btn-save-user').addEventListener('click', async function () {
      try {
        await API.call('saveUser', {
          user_id: user.user_id || '',
          username: document.getElementById('u-username').value,
          full_name: document.getElementById('u-fullname').value,
          role: document.getElementById('u-role').value,
          status: document.getElementById('u-status').value,
          password: document.getElementById('u-password').value,
          pin: document.getElementById('u-pin').value
        });
        closeModal(); toast('Pengguna disimpan', 'ok'); navigate('settings');
      } catch (e) {
        const el = document.getElementById('u-error');
        el.textContent = e.message; el.classList.remove('hidden');
      }
    });
  }

  /* ---------- Init ---------- */
  async function boot() {
    const urlInput = document.getElementById('login-api-url');
    if (urlInput) {
      urlInput.value = API.getUrl();
      urlInput.addEventListener('change', function () { API.setUrl(urlInput.value); });
    }

    let mode = 'password';
    document.querySelectorAll('#login-tabs .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('#login-tabs .tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        mode = tab.getAttribute('data-mode');
        document.getElementById('secret-label').textContent = mode === 'pin' ? 'PIN Kasir (6 digit)' : 'Password';
        document.getElementById('login-secret').type = mode === 'pin' ? 'text' : 'password';
        document.getElementById('login-secret').placeholder = mode === 'pin' ? '••••••' : '••••••••';
      });
    });

    document.getElementById('login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('btn-login');
      const err = document.getElementById('login-error');
      err.classList.add('hidden');
      btn.disabled = true;

      if (urlInput && urlInput.value.trim()) API.setUrl(urlInput.value);

      try {
        const username = document.getElementById('login-username').value;
        const secret = document.getElementById('login-secret').value;
        const res = await Auth.login(mode, username, secret);
        API.setToken(res.token);
        if (document.getElementById('remember').checked) {
          localStorage.setItem('pos_last_user', username);
        } else {
          localStorage.removeItem('pos_last_user');
        }
        await refresh();
        await showApp();
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });

    const lastUser = localStorage.getItem('pos_last_user');
    if (lastUser) document.getElementById('login-username').value = lastUser;

    document.getElementById('btn-logout').addEventListener('click', async function () {
      await Auth.logout();
      location.reload();
    });

    if (API.getToken()) {
      try {
        await refresh();
        await showApp();
        return;
      } catch (e) {
        API.setToken('');
      }
    }
    showLogin();
  }

  return {
    boot: boot,
    navigate: navigate,
    updateChrome: updateChrome,
    refreshSilent: refreshSilent,
    state: state
  };
})();

/* ================= GLOBAL HELPERS ================= */
function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return 'Rp ' + v.toLocaleString('id-ID');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function kpi(label, value, cls) {
  return `<div class="kpi ${cls || ''}"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
}
function toast(msg, type) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(function () { el.remove(); }, 320);
  }, 2600);
}
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-overlay"><div class="modal">' + html + '</div></div>';
  root.querySelector('.modal-overlay').addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}
document.addEventListener('DOMContentLoaded', function () { App.boot(); });