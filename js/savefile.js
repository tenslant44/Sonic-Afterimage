// Portable, encrypted save files (AES-256-GCM, PBKDF2-derived key).
// Any edit to the file breaks the GCM auth tag, so tampered files are rejected.
const HEADER = 'SONIC-AFTERIMAGE-SAVE v1';
const PEPPER = [0x53, 0x41, 0x2d, 0x74, 0x31, 0x6d, 0x33, 0x2d, 0x62, 0x30, 0x72, 0x72, 0x30, 0x77, 0x33, 0x64, 0x2d, 0x43, 0x44, 0x39, 0x33];
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriveKey(salt) {
  const secret = String.fromCharCode(...PEPPER) + ':chrono-core';
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function encryptSave(data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);
  const body = enc.encode(JSON.stringify({ app: 'sonic-afterimage', savedAt: Date.now(), data }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(HEADER) }, key, body));
  const out = new Uint8Array(1 + 16 + 12 + ct.length);
  out[0] = 1; out.set(salt, 1); out.set(iv, 17); out.set(ct, 29);
  const s = b64(out);
  return HEADER + '\n' + s.replace(/(.{76})/g, '$1\n') + '\n';
}

export async function decryptSave(text) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines[0].trim() !== HEADER) throw new Error('NOT A SONIC AFTERIMAGE SAVE');
  let raw;
  try { raw = unb64(lines.slice(1).join('').replace(/\s+/g, '')); } catch (e) { throw new Error('SAVE FILE IS DAMAGED'); }
  if (raw.length < 30 || raw[0] !== 1) throw new Error('SAVE FILE IS DAMAGED');
  const key = await deriveKey(raw.subarray(1, 17));
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(17, 29), additionalData: enc.encode(HEADER) }, key, raw.subarray(29)); }
  catch (e) { throw new Error('SAVE FILE WAS MODIFIED'); }
  const obj = JSON.parse(dec.decode(pt));
  if (!obj || obj.app !== 'sonic-afterimage' || !obj.data) throw new Error('SAVE FILE IS DAMAGED');
  return obj.data;
}

export function downloadText(text, name) {
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

export function pickFileText() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.sav,.save,.txt,application/octet-stream,text/plain';
    inp.style.display = 'none';
    let done = false;
    inp.onchange = () => {
      done = true;
      const f = inp.files && inp.files[0]; inp.remove();
      if (!f) return reject(new Error('NO FILE CHOSEN'));
      if (f.size > 200000) return reject(new Error('NOT A SONIC AFTERIMAGE SAVE'));
      f.text().then(resolve, () => reject(new Error('COULD NOT READ FILE')));
    };
    inp.addEventListener('cancel', () => { if (!done) { inp.remove(); reject(new Error('CANCELLED')); } });
    document.body.appendChild(inp);
    inp.click();
  });
}
