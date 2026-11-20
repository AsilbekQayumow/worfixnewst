/**
 * Minimal EXIF reader for JPEG evidence photos: capture time and GPS position.
 * Reads only the tags it needs; never throws (returns nulls on anything unexpected).
 */
export interface ExifInfo {
  takenAt: string | null;
  gps: { lat: number; lng: number } | null;
}

export function readExif(buf: ArrayBuffer): ExifInfo {
  const none: ExifInfo = { takenAt: null, gps: null };
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return none;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10) ?? none; // "Exif"
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      off += 2 + size;
    }
  } catch {
    /* corrupt or unusual file */
  }
  return none;
}

function parseTiff(v: DataView, start: number): ExifInfo | null {
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, little);
  const u32 = (o: number) => v.getUint32(start + o, little);
  if (u16(2) !== 42) return null;

  const entries = (ifd: number) => {
    const n = u16(ifd);
    const out = new Map<number, { type: number; count: number; valueOff: number }>();
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const bytes = count * ([0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] ?? 1);
      out.set(u16(e), { type, count, valueOff: bytes > 4 ? u32(e + 8) : e + 8 });
    }
    return out;
  };
  const ascii = (e: { count: number; valueOff: number }) => {
    let s = "";
    for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(start + e.valueOff + i));
    return s;
  };
  const rational = (o: number) => { const d = u32(o + 4); return d ? u32(o) / d : 0; };

  const ifd0 = entries(u32(4));
  let takenAt: string | null = null;
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = entries(u32(exifPtr.valueOff));
    const dt = exif.get(0x9003) ?? exif.get(0x9004);
    if (dt) {
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(dt));
      if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        if (!Number.isNaN(d.getTime())) takenAt = d.toISOString();
      }
    }
  }
  let gps: ExifInfo["gps"] = null;
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const g = entries(u32(gpsPtr.valueOff));
    const lat = g.get(2);
    const lng = g.get(4);
    if (lat && lng && lat.count === 3 && lng.count === 3) {
      const dms = (e: { valueOff: number }) => rational(e.valueOff) + rational(e.valueOff + 8) / 60 + rational(e.valueOff + 16) / 3600;
      const ref = (tag: number) => { const e = g.get(tag); return e ? String.fromCharCode(v.getUint8(start + e.valueOff)) : ""; };
      const la = dms(lat) * (ref(1) === "S" ? -1 : 1);
      const lo = dms(lng) * (ref(3) === "W" ? -1 : 1);
      if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) gps = { lat: la, lng: lo };
    }
  }
  return { takenAt, gps };
}
