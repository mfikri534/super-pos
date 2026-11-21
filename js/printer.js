/* ================= ESC/POS BLUETOOTH PRINTER ================= */
const Printer = (function () {
  const SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455'
  ];

  let device = null;
  let characteristic = null;

  /* ---- Connection ---- */
  async function connect() {
    if (!navigator.bluetooth) {
      throw new Error('Browser tidak mendukung Web Bluetooth. Gunakan Chrome/Edge di HTTPS.');
    }
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SERVICES
    });
    device.addEventListener('gattserverdisconnected', function () { characteristic = null; });

    const server = await device.gatt.connect();
    let found = null;

    for (let i = 0; i < SERVICES.length && !found; i++) {
      try {
        const svc = await server.getPrimaryService(SERVICES[i]);
        const chars = await svc.getCharacteristics();
        found = chars.find(function (c) { return c.properties.write || c.properties.writeWithoutResponse; }) || null;
      } catch (e) { /* lanjut service berikutnya */ }
    }

    if (!found) {
      try {
        const svcs = await server.getPrimaryServices();
        for (let i = 0; i < svcs.length && !found; i++) {
          const chars = await svcs[i].getCharacteristics();
          found = chars.find(function (c) { return c.properties.write || c.properties.writeWithoutResponse; }) || null;
        }
      } catch (e) {}
    }

    if (!found) throw new Error('Karakteristik tulis tidak ditemukan pada printer.');
    characteristic = found;
    return device.name || 'Printer';
  }

  function isConnected() { return !!(characteristic && device && device.gatt.connected); }

  function disconnect() {
    try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
    characteristic = null;
  }

  /* ---- Byte helpers ---- */
  function encAscii(str) {
    const out = [];
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out.push(c < 128 ? c : (c === 0x2019 ? 39 : 63)); // non-ASCII -> '?'
    }
    return out;
  }
  function push(bytes, arr) { for (let i = 0; i < arr.length; i++) bytes.push(arr[i]); }

  const ESC = 0x1B, GS = 0x1D;
  const CMD = {
    init: [ESC, 0x40],
    alignLeft: [ESC, 0x61, 0],
    alignCenter: [ESC, 0x61, 1],
    alignRight: [ESC, 0x61, 2],
    boldOn: [ESC, 0x45, 1],
    boldOff: [ESC, 0x45, 0],
    sizeNormal: [GS, 0x21, 0x00],
    sizeDouble: [GS, 0x21, 0x11],
    sizeDoubleH: [GS, 0x21, 0x01],
    feed: [0x0A],
    feed3: [0x0A, 0x0A, 0x0A],
    cut: [GS, 0x56, 0x42, 0x00],
    drawer: [ESC, 0x70, 0x00, 0x19, 0xFA]
  };

  /* ---- Formatting ---- */
  function twoCol(left, right, width) {
    const w = width || 32;
    let l = String(left);
    let r = String(right);
    if (l.length + r.length + 1 > w) l = l.slice(0, Math.max(0, w - r.length - 2));
    return l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r + '\n';
  }
  function wrapText(text, width) {
    const w = width || 32;
    const words = String(text).split(' ');
    let line = '', out = '';
    words.forEach(function (word) {
      if ((line + ' ' + word).trim().length > w) { out += line.trim() + '\n'; line = word; }
      else line += ' ' + word;
    });
    if (line.trim()) out += line.trim() + '\n';
    return out;
  }
  function money(n) {
    const v = Math.round(Number(n) || 0);
    return 'Rp ' + v.toLocaleString('id-ID');
  }
  function ts(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(String(iso).replace(' ', 'T'));
      return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) { return iso; }
  }

  /* ---- Receipt builder ---- */
  function buildReceipt(trx, settings) {
    const s = settings || {};
    const width = Number(s.paper_width) === 80 ? 48 : 32;
    const bytes = [];
    const line = function (t) { push(bytes, encAscii(t)); };

    push(bytes, CMD.init);
    push(bytes, CMD.alignCenter);
    push(bytes, CMD.boldOn);
    push(bytes, CMD.sizeDoubleH);
    line(String(s.store_name || 'SUPER POS').toUpperCase() + '\n');
    push(bytes, CMD.sizeNormal);
    push(bytes, CMD.boldOff);
    if (s.store_address) line(wrapText(s.store_address, width));
    if (s.store_phone) line(String(s.store_phone) + '\n');
    line('-'.repeat(width) + '\n');

    push(bytes, CMD.alignLeft);
    line('No    : ' + (trx.invoice_no || trx.trx_id) + '\n');
    line('Tgl   : ' + ts(trx.timestamp || trx.date_ymd) + '\n');
    line('Kasir : ' + (trx.cashier || trx.cashier_name || '-') + '\n');
    line('Plggn : ' + (trx.customer_name || 'Umum') + '\n');
    line('-'.repeat(width) + '\n');

    const items = trx.items || [];
    items.forEach(function (it) {
      line(wrapText(it.product_name, width));
      const left = '  ' + it.qty + ' x ' + (Number(it.unit_price) || 0).toLocaleString('id-ID');
      const right = (Number(it.line_total) || 0).toLocaleString('id-ID');
      line(twoCol(left, right, width));
      if (Number(it.discount) > 0) {
        line(twoCol('  Diskon', '-' + (Number(it.discount) || 0).toLocaleString('id-ID'), width));
      }
    });

    line('-'.repeat(width) + '\n');
    line(twoCol('Subtotal', money(trx.subtotal), width));
    if (Number(trx.item_discount_total) > 0) line(twoCol('Diskon Item', '-' + money(trx.item_discount_total), width));
    if (Number(trx.order_discount) > 0) line(twoCol('Diskon', '-' + money(trx.order_discount), width));
    if (Number(trx.tax_amount) > 0) line(twoCol('Pajak', money(trx.tax_amount), width));
    if (Number(trx.service_charge) > 0) line(twoCol('Service', money(trx.service_charge), width));

    push(bytes, CMD.boldOn);
    push(bytes, CMD.sizeDoubleH);
    line(twoCol('TOTAL', money(trx.grand_total), Math.floor(width / 2)) + '\n');
    push(bytes, CMD.sizeNormal);
    push(bytes, CMD.boldOff);

    line(twoCol('Bayar (' + (trx.payment_method || 'Cash') + ')', money(trx.amount_paid), width));
    if (Number(trx.change_due) > 0) line(twoCol('Kembali', money(trx.change_due), width));
    if (trx.payment_status && trx.payment_status !== 'Paid') line(twoCol('Status', trx.payment_status, width));

    line('-'.repeat(width) + '\n');
    push(bytes, CMD.alignCenter);
    if (trx.points_earned) line('Poin didapat: +' + trx.points_earned + '\n');
    line(wrapText(s.receipt_footer || 'Terima kasih!', width));
    line('\n');
    push(bytes, CMD.feed3);
    push(bytes, CMD.cut);
    push(bytes, CMD.drawer);

    return new Uint8Array(bytes);
  }

  /* ---- Send chunked ---- */
  async function send(bytes) {
    if (!characteristic) throw new Error('Printer belum terhubung.');
    const CHUNK = 20;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(slice);
      } else {
        await characteristic.writeValue(slice);
      }
      await new Promise(function (r) { setTimeout(r, 20); });
    }
  }

  async function printReceipt(trx, settings) {
    const bytes = buildReceipt(trx, settings);
    await send(bytes);
    return true;
  }

  async function testPrint(settings) {
    const s = settings || {};
    const width = Number(s.paper_width) === 80 ? 48 : 32;
    const bytes = [];
    const line = function (t) { push(bytes, encAscii(t)); };
    push(bytes, CMD.init);
    push(bytes, CMD.alignCenter);
    push(bytes, CMD.boldOn);
    push(bytes, CMD.sizeDouble);
    line('TEST PRINT\n');
    push(bytes, CMD.sizeNormal);
    push(bytes, CMD.boldOff);
    line(String(s.store_name || 'Super POS') + '\n');
    line('Printer Bluetooth OK\n');
    line('-'.repeat(width) + '\n');
    line(new Date().toLocaleString('id-ID') + '\n');
    push(bytes, CMD.feed3);
    push(bytes, CMD.cut);
    await send(new Uint8Array(bytes));
    return true;
  }

  return {
    connect: connect,
    disconnect: disconnect,
    isConnected: isConnected,
    printReceipt: printReceipt,
    testPrint: testPrint,
    buildReceipt: buildReceipt,
    money: money
  };
})();