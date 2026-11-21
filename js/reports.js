/* ================= REPORTS ================= */
const Reports = (function () {
  let lastReport = null;
  let lastCustomerReport = null;

  function presetRange(preset) {
    const now = new Date();
    const fmtD = function (d) { return d.toISOString().slice(0, 10); };
    if (preset === 'today') return { from: fmtD(now), to: fmtD(now) };
    if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: fmtD(y), to: fmtD(y) };
    }
    if (preset === '7d') {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { from: fmtD(s), to: fmtD(now) };
    }
    if (preset === 'month') {
      return { from: fmtD(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtD(now) };
    }
    if (preset === 'lastmonth') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmtD(s), to: fmtD(e) };
    }
    return { from: fmtD(now), to: fmtD(now) };
  }

  function render(root) {
    const r = presetRange('7d');
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Laporan</h1><p>Laporan periode & pelanggan</p></div>
        <button class="btn ghost" id="btn-export-csv">⬇ Export CSV</button>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label>Dari</label><input type="date" id="rep-from" value="${r.from}"></div>
          <div><label>Sampai</label><input type="date" id="rep-to" value="${r.to}"></div>
          <div><label>Pelanggan</label>
            <select id="rep-customer">
              <option value="">Semua Pelanggan</option>
              ${(App.state.customers || []).map(function (c) {
                return `<option value="${c.customer_id}">${esc(c.name)}</option>`;
              }).join('')}
            </select>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn sm ghost" data-preset="today">Hari Ini</button>
            <button class="btn sm ghost" data-preset="yesterday">Kemarin</button>
            <button class="btn sm ghost" data-preset="7d">7 Hari</button>
            <button class="btn sm ghost" data-preset="month">Bulan Ini</button>
            <button class="btn sm ghost" data-preset="lastmonth">Bulan Lalu</button>
          </div>
          <button class="btn primary" id="btn-run-report">Tampilkan</button>
        </div>
      </div>

      <div id="rep-result"><div class="empty">Tekan "Tampilkan" untuk memuat laporan.</div></div>
    `;

    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = presetRange(b.getAttribute('data-preset'));
        document.getElementById('rep-from').value = p.from;
        document.getElementById('rep-to').value = p.to;
      });
    });

    document.getElementById('btn-run-report').addEventListener('click', run);
    document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
    run();
  }

  async function run() {
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const customerId = document.getElementById('rep-customer').value;
    const box = document.getElementById('rep-result');
    box.innerHTML = '<div class="card">Memuat…</div>';

    try {
      if (customerId) {
        const rep = await API.call('customerReport', { customer_id: customerId, date_from: from, date_to: to });
        lastCustomerReport = rep;
        lastReport = null;
        renderCustomer(rep, box);
      } else {
        const rep = await API.call('report', { date_from: from, date_to: to });
        lastReport = rep;
        lastCustomerReport = null;
        renderFinancial(rep, box);
      }
    } catch (e) {
      box.innerHTML = `<div class="card"><p class="error-text">${esc(e.message)}</p></div>`;
    }
  }

  function renderFinancial(rep, box) {
    const s = rep.summary;
    box.innerHTML = `
      <div class="kpi-grid">
        ${kpi('Penjualan Kotor', fmt(s.gross_sales))}
        ${kpi('Penjualan Bersih', fmt(s.net_sales))}
        ${kpi('HPP', fmt(s.cogs))}
        ${kpi('Laba Kotor', fmt(s.gross_profit))}
        ${kpi('Biaya Operasional', fmt(s.expense))}
        ${kpi('Laba Bersih', fmt(s.net_profit))}
        ${kpi('Transaksi', s.trx_count)}
        ${kpi('Unit Terjual', s.units)}
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Metode Pembayaran</h3>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Metode</th><th class="num">Total</th></tr></thead>
            <tbody>${(rep.by_payment || []).map(function (p) {
              return `<tr><td>${esc(p.method)}</td><td class="num">${fmt(p.total)}</td></tr>`;
            }).join('') || '<tr><td colspan="2" class="muted">Tidak ada data</td></tr>'}</tbody>
          </table></div>
        </div>

        <div class="card">
          <h3>Kategori</h3>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Kategori</th><th class="num">Qty</th><th class="num">Omzet</th></tr></thead>
            <tbody>${(rep.by_category || []).map(function (c) {
              return `<tr><td>${esc(c.category)}</td><td class="num">${c.qty}</td><td class="num">${fmt(c.revenue)}</td></tr>`;
            }).join('') || '<tr><td colspan="3" class="muted">Tidak ada data</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Produk Terlaris</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Omzet</th><th class="num">Profit</th></tr></thead>
          <tbody>${(rep.top_products || []).map(function (p) {
            return `<tr><td>${esc(p.name)}</td><td class="num">${p.qty}</td><td class="num">${fmt(p.revenue)}</td><td class="num">${fmt(p.profit)}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Tidak ada data</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Transaksi</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Metode</th><th class="num">Total</th></tr></thead>
          <tbody>${(rep.transactions || []).map(function (t) {
            return `<tr>
              <td class="mono">${esc(t.invoice_no)}</td>
              <td>${esc(String(t.date_ymd))}</td>
              <td>${esc(t.customer_name || 'Umum')}</td>
              <td>${esc(t.payment_method)}</td>
              <td class="num">${fmt(t.grand_total)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">Tidak ada transaksi</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
  }

  function renderCustomer(rep, box) {
    const t = rep.totals;
    const c = rep.customer;
    box.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3>${esc(c.name)}</h3>
        <p class="muted small">${esc(c.member_code || '')} • ${esc(c.phone || '-')} • Tier ${esc(c.tier)}</p>
      </div>

      <div class="kpi-grid">
        ${kpi('Total Belanja', fmt(t.total_spend))}
        ${kpi('Transaksi', t.trx_count)}
        ${kpi('Diskon Diterima', fmt(t.total_discount))}
        ${kpi('Poin', t.points)}
        ${kpi('Hutang (Kasbon)', fmt(t.current_debt))}
        ${kpi('Total Pembayaran Hutang', fmt(t.total_paid))}
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Produk Favorit</h3>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Omzet</th></tr></thead>
            <tbody>${(rep.favorites || []).map(function (f) {
              return `<tr><td>${esc(f.name)}</td><td class="num">${f.qty}</td><td class="num">${fmt(f.revenue)}</td></tr>`;
            }).join('') || '<tr><td colspan="3" class="muted">Tidak ada data</td></tr>'}</tbody>
          </table></div>
        </div>

        <div class="card">
          <h3>Invoice Belum Lunas</h3>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Invoice</th><th>Tanggal</th><th class="num">Total</th><th>Status</th></tr></thead>
            <tbody>${(rep.unpaid_invoices || []).map(function (x) {
              return `<tr>
                <td class="mono">${esc(x.invoice_no)}</td>
                <td>${esc(String(x.date_ymd))}</td>
                <td class="num">${fmt(x.grand_total)}</td>
                <td><span class="pill warn">${esc(x.payment_status)}</span></td>
              </tr>`;
            }).join('') || '<tr><td colspan="4" class="muted">Semua lunas</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Riwayat Pembayaran Hutang</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Tanggal</th><th>Nominal</th><th>Metode</th><th>Catatan</th></tr></thead>
          <tbody>${(rep.payments || []).map(function (p) {
            return `<tr>
              <td>${esc(String(p.timestamp))}</td>
              <td class="num">${fmt(p.amount)}</td>
              <td>${esc(p.method)}</td>
              <td>${esc(p.notes || '')}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Belum ada pembayaran</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Riwayat Transaksi</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Invoice</th><th>Tanggal</th><th class="num">Total</th><th>Status</th></tr></thead>
          <tbody>${(rep.transactions || []).map(function (x) {
            return `<tr>
              <td class="mono">${esc(x.invoice_no)}</td>
              <td>${esc(String(x.date_ymd))}</td>
              <td class="num">${fmt(x.grand_total)}</td>
              <td><span class="pill ${x.payment_status === 'Paid' ? 'ok' : 'warn'}">${esc(x.payment_status)}</span></td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">Tidak ada transaksi</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
  }

  function exportCsv() {
    let rows = [];
    if (lastReport) {
      const s = lastReport.summary;
      rows.push(['LAPORAN PERIODE', lastReport.date_from + ' s/d ' + lastReport.date_to]);
      rows.push([]);
      Object.keys(s).forEach(function (k) { rows.push([k, s[k]]); });
      rows.push([]);
      rows.push(['INVOICE', 'TANGGAL', 'PELANGGAN', 'METODE', 'TOTAL']);
      (lastReport.transactions || []).forEach(function (t) {
        rows.push([t.invoice_no, t.date_ymd, t.customer_name, t.payment_method, t.grand_total]);
      });
    } else if (lastCustomerReport) {
      rows.push(['LAPORAN PELANGGAN', lastCustomerReport.customer.name]);
      rows.push(['TOTAL BELANJA', lastCustomerReport.totals.total_spend]);
      rows.push(['TRANSAKSI', lastCustomerReport.totals.trx_count]);
      rows.push(['HUTANG', lastCustomerReport.totals.current_debt]);
    } else {
      toast('Belum ada laporan untuk diexport', 'bad');
      return;
    }
    const csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'laporan-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { render: render, presetRange: presetRange };
})();