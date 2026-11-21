/* ================= POS CASHIER ================= */
const POS = (function () {
  const state = {
    cart: [],
    customerId: '',
    search: '',
    category: 'all',
    held: [],
    lastReceipt: null
  };

  /* ---------- Pricing (mirror server) ---------- */
  function selectedCustomer() {
    return (App.state.customers || []).find(function (c) { return c.customer_id === state.customerId; }) || null;
  }
  function isMember() {
    const c = selectedCustomer();
    return !!(c && String(c.tier) !== 'Regular' && String(App.state.settings.member_pricing) !== 'false');
  }
  function priceFor(prod, qty) {
    let p = Number(prod.sell_price) || 0;
    if (isMember() && Number(prod.member_price) > 0) p = Number(prod.member_price);
    const w = Number(prod.wholesale_min_qty) || 0;
    if (w > 0 && qty >= w && Number(prod.wholesale_price) > 0) p = Number(prod.wholesale_price);
    return Math.round(p);
  }

  /* ---------- Cart ---------- */
  function addToCart(productId) {
    const prod = (App.state.products || []).find(function (p) { return p.product_id === productId; });
    if (!prod) return;
    const existing = state.cart.find(function (c) { return c.product_id === productId; });
    const nextQty = existing ? existing.qty + 1 : 1;

    if (nextQty > (Number(prod.stock) || 0) && String(App.state.settings.allow_negative_stock) !== 'true') {
      toast('Stok ' + prod.name + ' hanya ' + prod.stock, 'bad');
      return;
    }

    if (existing) {
      existing.qty = nextQty;
      existing.unit_price = priceFor(prod, existing.qty);
    } else {
      state.cart.push({
        product_id: prod.product_id,
        name: prod.name,
        sku: prod.sku,
        unit: prod.unit || 'pcs',
        qty: 1,
        unit_price: priceFor(prod, 1),
        discount: 0,
        stock: Number(prod.stock) || 0
      });
    }
    renderCart();
    App.updateChrome();
  }

  function setQty(productId, qty) {
    const item = state.cart.find(function (c) { return c.product_id === productId; });
    if (!item) return;
    const prod = (App.state.products || []).find(function (p) { return p.product_id === productId; });
    const q = Math.max(0, Math.round(qty));
    if (q === 0) { removeFromCart(productId); return; }
    if (prod && q > (Number(prod.stock) || 0) && String(App.state.settings.allow_negative_stock) !== 'true') {
      toast('Stok tidak cukup', 'bad');
      return;
    }
    item.qty = q;
    item.unit_price = priceFor(prod || {}, q);
    renderCart();
  }

  function setItemDiscount(productId, disc) {
    const item = state.cart.find(function (c) { return c.product_id === productId; });
    if (!item) return;
    const max = item.unit_price * item.qty;
    item.discount = Math.min(Math.max(0, Math.round(Number(disc) || 0)), max);
    renderCart();
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter(function (c) { return c.product_id !== productId; });
    renderCart();
    App.updateChrome();
  }

  function clearCart() {
    state.cart = [];
    state.customerId = '';
    renderCart();
    App.updateChrome();
  }

  function totals() {
    const s = App.state.settings || {};
    let subtotal = 0, disc = 0;
    state.cart.forEach(function (it) {
      subtotal += it.unit_price * it.qty;
      disc += Number(it.discount) || 0;
    });
    const base = Math.max(0, subtotal - disc);
    const tax = Math.round(base * (Number(s.tax_percent) || 0) / 100);
    const svc = Math.round(base * (Number(s.service_charge_percent) || 0) / 100);
    return { subtotal: subtotal, item_discount: disc, tax: tax, service: svc, grand: base + tax + svc };
  }

  /* ---------- Render ---------- */
  function render(root) {
    root.innerHTML = `
      <div class="pos-grid">
        <section class="card pos-catalog">
          <div class="between wrap gap">
            <div style="flex:1;min-width:200px">
              <input id="pos-search" placeholder="Cari produk / SKU / scan barcode…" value="${esc(state.search)}">
            </div>
            <select id="pos-category" style="max-width:180px">
              <option value="all">Semua Kategori</option>
              ${categories().map(function (c) { return `<option value="${esc(c)}" ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`; }).join('')}
            </select>
          </div>
          <div class="prod-grid" id="prod-grid"></div>
        </section>

        <aside class="card pos-cart">
          <div class="between">
            <h3>Keranjang</h3>
            <button class="btn sm ghost" id="btn-hold">Hold</button>
          </div>

          <select id="pos-customer" style="margin-top:10px">
            <option value="">— Pelanggan Umum —</option>
            ${(App.state.customers || []).map(function (c) {
              return `<option value="${c.customer_id}" ${state.customerId === c.customer_id ? 'selected' : ''}>${esc(c.name)} (${esc(c.tier)})</option>`;
            }).join('')}
          </select>

          <div class="cart-list" id="cart-list"></div>

          <div class="totals" id="cart-totals"></div>
          <button class="btn primary w-full" id="btn-checkout" style="margin-top:12px">Bayar</button>
        </aside>
      </div>

      <div id="held-bar" style="margin-top:12px"></div>
    `;

    bindEvents(root);
    renderProducts();
    renderCart();
    renderHeld();
  }

  function categories() {
    const set = {};
    (App.state.products || []).forEach(function (p) { if (p.category) set[p.category] = true; });
    return Object.keys(set).sort();
  }

  function filteredProducts() {
    const q = state.search.toLowerCase().trim();
    return (App.state.products || []).filter(function (p) {
      if (state.category !== 'all' && String(p.category) !== state.category) return false;
      if (!q) return true;
      return (String(p.name) + ' ' + String(p.sku) + ' ' + String(p.barcode)).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderProducts() {
    const grid = document.getElementById('prod-grid');
    if (!grid) return;
    const list = filteredProducts();
    if (!list.length) {
      grid.innerHTML = '<div class="empty">Tidak ada produk.</div>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      const stock = Number(p.stock) || 0;
      const low = stock <= (Number(p.min_stock) || 0);
      return `
        <button class="prod-card" data-add="${esc(p.product_id)}">
          <div class="pname">${esc(p.name)}</div>
          <div class="pprice mono">${fmt(p.sell_price)}</div>
          <div class="pstock">
            ${stock > 0
              ? `<span class="pill ${low ? 'warn' : 'ok'}">Stok ${stock}</span>`
              : `<span class="pill bad">Habis</span>`}
          </div>
        </button>`;
    }).join('');
  }

  function renderCart() {
    const list = document.getElementById('cart-list');
    if (!list) return;

    if (!state.cart.length) {
      list.innerHTML = '<div class="empty">Keranjang kosong.<br>Pilih produk di kiri.</div>';
    } else {
      list.innerHTML = state.cart.map(function (it) {
        return `
          <div class="cart-item">
            <div class="between">
              <div class="ci-name">${esc(it.name)}</div>
              <button class="btn xs danger" data-del="${esc(it.product_id)}">✕</button>
            </div>
            <div class="ci-meta">${esc(it.sku || '')} • ${fmt(it.unit_price)}</div>
            <div class="between" style="margin-top:8px">
              <div class="qty-ctrl">
                <button data-dec="${esc(it.product_id)}">−</button>
                <input data-qty="${esc(it.product_id)}" value="${it.qty}" style="width:52px;text-align:center;padding:4px">
                <button data-inc="${esc(it.product_id)}">+</button>
              </div>
              <div class="mono" style="font-weight:700">${fmt(it.unit_price * it.qty - (it.discount || 0))}</div>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
              <span class="muted small">Diskon</span>
              <input data-disc="${esc(it.product_id)}" value="${it.discount || 0}" style="width:90px;padding:4px 8px;font-size:12px">
            </div>
          </div>`;
      }).join('');
    }

    const t = totals();
    const el = document.getElementById('cart-totals');
    if (el) {
      el.innerHTML = `
        <div class="row between"><span class="muted">Subtotal</span><span class="mono">${fmt(t.subtotal)}</span></div>
        <div class="row between"><span class="muted">Diskon Item</span><span class="mono">-${fmt(t.item_discount)}</span></div>
        <div class="row between"><span class="muted">Pajak</span><span class="mono">${fmt(t.tax)}</span></div>
        <div class="row between"><span class="muted">Service</span><span class="mono">${fmt(t.service)}</span></div>
        <div class="divider"></div>
        <div class="row between"><strong>Total</strong><span class="grand mono">${fmt(t.grand)}</span></div>
      `;
    }
  }

  function renderHeld() {
    const bar = document.getElementById('held-bar');
    if (!bar) return;
    if (!state.held.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = '<div class="card" style="padding:12px">' +
      '<strong class="small">Transaksi Ditahan</strong>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      state.held.map(function (h, idx) {
        return `<button class="chip" data-resume="${idx}">${esc(h.label)} • ${fmt(h.total)}</button>`;
      }).join('') +
      '</div></div>';
  }

  /* ---------- Events ---------- */
  function bindEvents(root) {
    const search = document.getElementById('pos-search');
    if (search) {
      search.addEventListener('input', function (e) {
        state.search = e.target.value;
        renderProducts();
      });
    }
    const cat = document.getElementById('pos-category');
    if (cat) cat.addEventListener('change', function (e) { state.category = e.target.value; renderProducts(); });

    const cust = document.getElementById('pos-customer');
    if (cust) cust.addEventListener('change', function (e) {
      state.customerId = e.target.value;
      state.cart.forEach(function (it) {
        const prod = (App.state.products || []).find(function (p) { return p.product_id === it.product_id; });
        if (prod) it.unit_price = priceFor(prod, it.qty);
      });
      renderCart();
    });

    document.getElementById('btn-checkout').addEventListener('click', openCheckout);
    document.getElementById('btn-hold').addEventListener('click', holdCart);

    root.addEventListener('click', function (e) {
      const add = e.target.closest('[data-add]');
      if (add) { addToCart(add.getAttribute('data-add')); return; }
      const del = e.target.closest('[data-del]');
      if (del) { removeFromCart(del.getAttribute('data-del')); return; }
      const inc = e.target.closest('[data-inc]');
      if (inc) {
        const id = inc.getAttribute('data-inc');
        const it = state.cart.find(function (c) { return c.product_id === id; });
        if (it) setQty(id, it.qty + 1);
        return;
      }
      const dec = e.target.closest('[data-dec]');
      if (dec) {
        const id = dec.getAttribute('data-dec');
        const it = state.cart.find(function (c) { return c.product_id === id; });
        if (it) setQty(id, it.qty - 1);
        return;
      }
      const resume = e.target.closest('[data-resume]');
      if (resume) { resumeCart(Number(resume.getAttribute('data-resume'))); return; }
    });

    root.addEventListener('change', function (e) {
      const q = e.target.getAttribute('data-qty');
      if (q) { setQty(q, Number(e.target.value)); return; }
      const d = e.target.getAttribute('data-disc');
      if (d) { setItemDiscount(d, Number(e.target.value)); }
    });
  }

  /* ---------- Hold / Resume ---------- */
  function holdCart() {
    if (!state.cart.length) { toast('Keranjang kosong', 'bad'); return; }
    const t = totals();
    state.held.push({
      label: 'Hold ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      cart: JSON.parse(JSON.stringify(state.cart)),
      customerId: state.customerId,
      total: t.grand
    });
    state.cart = [];
    state.customerId = '';
    renderCart(); renderHeld(); App.updateChrome();
    toast('Transaksi ditahan', 'info');
  }

  function resumeCart(idx) {
    const h = state.held[idx];
    if (!h) return;
    if (state.cart.length) { toast('Selesaikan/hold keranjang aktif dulu', 'bad'); return; }
    state.cart = h.cart;
    state.customerId = h.customerId;
    state.held.splice(idx, 1);
    renderCart(); renderHeld(); App.updateChrome();
  }

  /* ---------- Checkout ---------- */
  function openCheckout() {
    if (!state.cart.length) { toast('Keranjang kosong', 'bad'); return; }
    const t = totals();
    const customers = App.state.customers || [];

    openModal(`
      <div class="modal-head">
        <h3>Pembayaran</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>

      <label>Pelanggan</label>
      <select id="co-customer">
        <option value="">— Umum —</option>
        ${customers.map(function (c) {
          return `<option value="${c.customer_id}" ${state.customerId === c.customer_id ? 'selected' : ''}>${esc(c.name)} • ${esc(c.tier)} • hutang ${fmt(c.current_debt)}</option>`;
        }).join('')}
      </select>

      <label>Metode Pembayaran</label>
      <select id="co-method">
        <option>Cash</option>
        <option>QRIS</option>
        <option>Transfer</option>
        <option>Card</option>
        <option>Kasbon/Credit</option>
        <option>Split</option>
      </select>

      <div id="split-box" class="hidden">
        <label>Split Payment</label>
        <div id="split-rows"></div>
        <button class="btn sm ghost" id="btn-add-split" type="button" style="margin-top:8px">+ Tambah Baris</button>
      </div>

      <label>Jumlah Dibayar (Rp)</label>
      <input id="co-paid" type="number" min="0" value="${t.grand}">

      <label>Catatan</label>
      <input id="co-notes" placeholder="opsional">

      <div class="totals" style="margin-top:14px">
        <div class="row between"><span>Total Tagihan</span><strong class="mono">${fmt(t.grand)}</strong></div>
      </div>

      <button class="btn primary w-full" id="btn-confirm-pay" style="margin-top:14px">Konfirmasi & Bayar</button>
      <p id="co-error" class="error-text hidden"></p>
    `);

    const methodSel = document.getElementById('co-method');
    const splitBox = document.getElementById('split-box');
    const splitRows = document.getElementById('split-rows');

    function addSplitRow(m, a) {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;gap:8px;margin-bottom:6px';
      div.innerHTML = `
        <select class="sp-method" style="flex:1">
          <option ${m === 'Cash' ? 'selected' : ''}>Cash</option>
          <option ${m === 'QRIS' ? 'selected' : ''}>QRIS</option>
          <option ${m === 'Transfer' ? 'selected' : ''}>Transfer</option>
          <option ${m === 'Card' ? 'selected' : ''}>Card</option>
        </select>
        <input class="sp-amount" type="number" style="width:130px" value="${a || 0}">
      `;
      splitRows.appendChild(div);
    }

    methodSel.addEventListener('change', function () {
      const isSplit = methodSel.value === 'Split';
      splitBox.classList.toggle('hidden', !isSplit);
      if (isSplit && !splitRows.children.length) {
        addSplitRow('Cash', Math.floor(t.grand / 2));
        addSplitRow('QRIS', t.grand - Math.floor(t.grand / 2));
      }
    });
    document.getElementById('btn-add-split').addEventListener('click', function () { addSplitRow('Cash', 0); });

    document.getElementById('btn-confirm-pay').addEventListener('click', async function () {
      const btn = this;
      btn.disabled = true;
      const errEl = document.getElementById('co-error');
      errEl.classList.add('hidden');

      try {
        const method = methodSel.value;
        const paid = Math.round(Number(document.getElementById('co-paid').value) || 0);
        const notes = document.getElementById('co-notes').value;
        const customerId = document.getElementById('co-customer').value;

        let details = null;
        if (method === 'Split') {
          details = [];
          splitRows.querySelectorAll('div').forEach(function (row) {
            const m = row.querySelector('.sp-method').value;
            const a = Math.round(Number(row.querySelector('.sp-amount').value) || 0);
            if (a > 0) details.push({ method: m, amount: a });
          });
          if (!details.length) throw new Error('Isi nominal split payment.');
        }

        const payload = {
          customer_id: customerId,
          items: state.cart.map(function (it) {
            return { product_id: it.product_id, qty: it.qty, discount: it.discount || 0 };
          }),
          payment_method: method === 'Split' ? (details[0] ? details[0].method : 'Cash') : method,
          payment_details: details,
          amount_paid: details ? details.reduce(function (s, d) { return s + d.amount; }, 0) : paid,
          notes: notes,
          shift_id: App.state.shift ? App.state.shift.shift_id : ''
        };

        const res = await API.call('checkout', payload);
        closeModal();
        showSuccess(res);
        clearCart();
        App.refreshSilent();
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function showSuccess(res) {
    state.lastReceipt = res;
    const autoPrint = localStorage.getItem('pos_auto_print') === 'true';

    openModal(`
      <div class="modal-head"><h3>Transaksi Berhasil</h3>
        <button class="modal-close" onclick="closeModal()">✕</button></div>
      <div style="text-align:center;padding:8px 0 16px">
        <div class="pill ok" style="font-size:13px">${esc(res.payment_status)}</div>
        <h2 class="mono" style="margin-top:12px">${fmt(res.grand_total)}</h2>
        <p class="muted small">${esc(res.invoice_no)}</p>
        ${res.change_due ? `<p style="margin-top:8px">Kembali: <strong class="mono">${fmt(res.change_due)}</strong></p>` : ''}
        ${res.points_earned ? `<p class="small muted">Poin +${res.points_earned}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <button class="btn primary" onclick="POS.printLast()">🖨 Cetak Struk</button>
        <button class="btn ghost" onclick="POS.sendWhatsApp()">📱 WhatsApp</button>
        <button class="btn ghost" onclick="closeModal()">Transaksi Baru</button>
      </div>
    `);

    if (autoPrint && Printer.isConnected()) {
      Printer.printReceipt(res, App.state.settings).catch(function (e) { toast('Print gagal: ' + e.message, 'bad'); });
    }
  }

  async function printLast() {
    if (!state.lastReceipt) { toast('Belum ada struk', 'bad'); return; }
    try {
      if (!Printer.isConnected()) {
        const name = await Printer.connect();
        toast('Terhubung ke ' + name, 'ok');
      }
      await Printer.printReceipt(state.lastReceipt, App.state.settings);
      toast('Struk tercetak', 'ok');
    } catch (e) { toast('Print gagal: ' + e.message, 'bad'); }
  }

  function sendWhatsApp() {
    const r = state.lastReceipt;
    if (!r) return;
    const lines = [
      '*' + (App.state.settings.store_name || 'Super POS') + '*',
      'Invoice: ' + r.invoice_no,
      'Tanggal: ' + r.timestamp,
      ''
    ];
    (r.items || []).forEach(function (it) {
      lines.push(it.qty + 'x ' + it.product_name + ' = Rp ' + (it.line_total || 0).toLocaleString('id-ID'));
    });
    lines.push('');
    lines.push('Total: Rp ' + (r.grand_total || 0).toLocaleString('id-ID'));
    lines.push('Terima kasih!');
    const text = encodeURIComponent(lines.join('\n'));
    window.open('https://wa.me/?text=' + text, '_blank');
  }

  return {
    render: render,
    addToCart: addToCart,
    clearCart: clearCart,
    totals: totals,
    state: state,
    printLast: printLast,
    sendWhatsApp: sendWhatsApp,
    renderProducts: renderProducts
  };
})();