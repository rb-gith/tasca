'use strict';

/* =========================================================
   Barcodes drawn by the app itself, as SVG. No outside code.
   Formats: EAN-13, EAN-8, UPC-A, Code 128, Code 39, ITF, QR code.
   Format names match the phone's barcode reader (BarcodeDetector).
   ========================================================= */
const Barcode = (() => {
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39', 'itf', 'qr_code'];
  const LABELS = { ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', code_128: 'Code 128', code_39: 'Code 39', itf: 'ITF', qr_code: 'QR code' };

  /* ---------- EAN / UPC ---------- */
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map(p => p.replace(/./g, b => (b === '0' ? '1' : '0')));
  const G = R.map(p => p.split('').reverse().join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  /* Check digit: weights 3,1,3,1… counted from the rightmost data digit */
  function eanCheck(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return String((10 - (sum % 10)) % 10);
  }
  function ean13Bits(code) {
    const first = Number(code[0]);
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (PARITY[first][i - 1] === 'L' ? L : G)[Number(code[i])];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
    return bits + '101';
  }
  function ean8Bits(code) {
    let bits = '101';
    for (let i = 0; i < 4; i++) bits += L[Number(code[i])];
    bits += '01010';
    for (let i = 4; i < 8; i++) bits += R[Number(code[i])];
    return bits + '101';
  }

  /* ---------- Code 128 ---------- */
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
    + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
    + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
    + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
    + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
    + '114131 311141 411131 211412 211214 211232 2331112').split(' ');
  function widthsToBits(widths) {
    let bits = '';
    widths.split('').forEach((w, i) => { bits += (i % 2 === 0 ? '1' : '0').repeat(Number(w)); });
    return bits;
  }
  /* Digits use set C (two per symbol), anything else set B */
  function code128Values(text) {
    const values = [];
    const digits = /^\d+$/.test(text);
    if (digits && text.length >= 4) {
      values.push(105);
      const even = text.length - (text.length % 2);
      for (let i = 0; i < even; i += 2) values.push(Number(text.substr(i, 2)));
      if (text.length % 2) { values.push(100); values.push(text.charCodeAt(text.length - 1) - 32); }
    } else {
      values.push(104);
      for (const ch of text) values.push(ch.charCodeAt(0) - 32);
    }
    let sum = values[0];
    for (let i = 1; i < values.length; i++) sum += values[i] * i;
    values.push(sum % 103);
    values.push(106);
    return values;
  }
  const code128Bits = text => code128Values(text).map(v => widthsToBits(C128[v])).join('');

  /* ---------- Code 39 (1 = wide element; bars and spaces alternate) ---------- */
  const C39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100', 'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
  };
  function code39Bits(text) {
    return ('*' + text + '*').split('').map(ch => C39[ch].split('')
      .map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(w === '1' ? 3 : 1)).join('')).join('0');
  }

  /* ---------- ITF (interleaved 2 of 5) ---------- */
  const ITF = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];
  function itfBits(code) {
    let bits = '1010';
    for (let i = 0; i < code.length; i += 2) {
      const a = ITF[Number(code[i])], b = ITF[Number(code[i + 1])];
      for (let k = 0; k < 5; k++) bits += '1'.repeat(a[k] === '1' ? 3 : 1) + '0'.repeat(b[k] === '1' ? 3 : 1);
    }
    return bits + '111' + '0' + '1';
  }

  /* ---------- QR code: byte mode, error correction level M, versions 1–10 ---------- */
  /* [ecc codewords per block, [blocks, data codewords]...] */
  const QR_M = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const QR_MASK = 0;
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
    }
    return result;
  }
  const dataCapacity = v => QR_M[v].slice(1).reduce((s, [n, d]) => s + n * d, 0);
  function qrMatrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let version = 0;
    for (let v = 1; v <= 10; v++) {
      if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
    }
    if (!version) return null;
    const size = version * 4 + 17;
    const cap = dataCapacity(version);

    /* Data bits: mode, length, bytes, terminator, padding */
    let bits = '0100' + bytes.length.toString(2).padStart(version < 10 ? 8 : 16, '0');
    bytes.forEach(b => { bits += b.toString(2).padStart(8, '0'); });
    bits += '0'.repeat(Math.min(4, cap * 8 - bits.length));
    bits += '0'.repeat((8 - (bits.length % 8)) % 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.substr(i, 8), 2));
    for (let pad = 0xEC; data.length < cap; pad ^= 0xEC ^ 0x11) data.push(pad);

    /* Split into blocks, add error correction, interleave */
    const [eccLen, ...groups] = QR_M[version];
    const divisor = rsDivisor(eccLen);
    const blocks = [];
    let k = 0;
    groups.forEach(([n, d]) => { for (let i = 0; i < n; i++) { const blk = data.slice(k, k + d); k += d; blocks.push({ data: blk, ecc: rsRemainder(blk, divisor) }); } });
    const codewords = [];
    const maxData = Math.max(...blocks.map(b => b.data.length));
    for (let i = 0; i < maxData; i++) blocks.forEach(b => { if (i < b.data.length) codewords.push(b.data[i]); });
    for (let i = 0; i < eccLen; i++) blocks.forEach(b => codewords.push(b.ecc[i]));

    /* Function patterns */
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
    });
    const al = QR_ALIGN[version];
    al.forEach((ax, i) => al.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    function drawFormat(mask) {
      const fdata = (0 << 3) | mask; /* level M = 0 */
      let rem = fdata;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const fbits = ((fdata << 10) | rem) ^ 0x5412;
      const bit = i => ((fbits >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    }
    drawFormat(0);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const vbits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((vbits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, dark); set(b, a, dark);
      }
    }

    /* Data, in the zigzag order */
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFn[y][x] && i < codewords.length * 8) {
            modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
    /* Mask (any of the 8 is valid for readers; mask 0 keeps the code simple) */
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!isFn[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
    }
    drawFormat(QR_MASK);
    return modules;
  }

  /* ---------- Checking what the user typed ---------- */
  function check(format, raw) {
    let v = String(raw || '').trim();
    if (format !== 'qr_code' && format !== 'code_128') v = v.replace(/\s+/g, '');
    if (!v) return { ok: false, error: 'numberEmpty' };
    const digits = /^\d+$/.test(v);
    switch (format) {
      case 'ean_13':
        if (!digits || (v.length !== 12 && v.length !== 13)) return { ok: false, error: 'needDigits', n: '12–13' };
        if (v.length === 12) v += eanCheck(v);
        else if (eanCheck(v.slice(0, 12)) !== v[12]) return { ok: false, error: 'checkDigit' };
        return { ok: true, value: v };
      case 'ean_8':
        if (!digits || (v.length !== 7 && v.length !== 8)) return { ok: false, error: 'needDigits', n: '7–8' };
        if (v.length === 7) v += eanCheck(v);
        else if (eanCheck(v.slice(0, 7)) !== v[7]) return { ok: false, error: 'checkDigit' };
        return { ok: true, value: v };
      case 'upc_a':
        if (!digits || (v.length !== 11 && v.length !== 12)) return { ok: false, error: 'needDigits', n: '11–12' };
        if (v.length === 11) v += eanCheck(v);
        else if (eanCheck(v.slice(0, 11)) !== v[11]) return { ok: false, error: 'checkDigit' };
        return { ok: true, value: v };
      case 'code_128':
        if (!/^[\x20-\x7E]+$/.test(v) || v.length > 60) return { ok: false, error: 'badChars' };
        return { ok: true, value: v };
      case 'code_39':
        v = v.toUpperCase();
        if (!/^[0-9A-Z\-. $/+%]+$/.test(v) || v.length > 40) return { ok: false, error: 'badChars' };
        return { ok: true, value: v };
      case 'itf':
        if (!digits || v.length % 2 || v.length > 40) return { ok: false, error: 'itfEven' };
        return { ok: true, value: v };
      case 'qr_code':
        if (!qrMatrix(v)) return { ok: false, error: 'tooLong' };
        return { ok: true, value: v };
      default:
        return { ok: true, value: v, undrawable: true };
    }
  }

  /* ---------- SVG ---------- */
  function linearSvg(bits, quiet) {
    let rects = '', x = quiet;
    for (let i = 0; i < bits.length;) {
      if (bits[i] === '0') { i++; x++; continue; }
      let w = 0;
      while (bits[i + w] === '1') w++;
      rects += `<rect x="${x}" y="0" width="${w}" height="60"/>`;
      x += w; i += w;
    }
    const width = bits.length + quiet * 2;
    return `<svg class="bc-linear" viewBox="0 0 ${width} 60" preserveAspectRatio="none" role="img" aria-hidden="true" shape-rendering="crispEdges"><rect width="${width}" height="60" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }
  function qrSvg(m) {
    const n = m.length, q = 4;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) path += `M${x + q} ${y + q}h1v1h-1z`;
    return `<svg class="bc-qr" viewBox="0 0 ${n + q * 2} ${n + q * 2}" role="img" aria-hidden="true" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }
  /* Returns an SVG string, or null when the format can't be drawn */
  function svg(format, value) {
    const c = check(format, value);
    if (!c.ok || c.undrawable) return null;
    switch (format) {
      case 'ean_13': return linearSvg(ean13Bits(c.value), 11);
      case 'ean_8': return linearSvg(ean8Bits(c.value), 7);
      case 'upc_a': return linearSvg(ean13Bits('0' + c.value), 11);
      case 'code_128': return linearSvg(code128Bits(c.value), 10);
      case 'code_39': return linearSvg(code39Bits(c.value), 10);
      case 'itf': return linearSvg(itfBits(c.value), 10);
      case 'qr_code': { const m = qrMatrix(c.value); return m && qrSvg(m); }
    }
    return null;
  }

  return { FORMATS, LABELS, check, svg, _test: { eanCheck, ean13Bits, code128Values, C128, C39, ITF, rsDivisor, rsRemainder, qrMatrix } };
})();
if (typeof module !== 'undefined') module.exports = Barcode;
