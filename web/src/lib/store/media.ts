"use client";
import type { Evidence, GpsFix } from "../domain/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MIN_IMAGE_EDGE } from "../domain/validation";
import { FIREBASE, sha256Hex } from "./db";
import { readExif } from "./exif";

/** 64-bit difference hash of an image, hex encoded. Survives re-compression and resizing. */
function dHash(bmp: ImageBitmap) {
  const c = document.createElement("canvas");
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const g = (x: number, y: number) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g(x, y) > g(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export class MediaError extends Error {
  constructor(key: string, public values: Record<string, string | number> = {}) {
    super(key);
  }
}

/**
 * Validates and prepares an evidence photo: type, size, minimum resolution, EXIF capture time and GPS,
 * SHA-256 of the original bytes and a perceptual hash; then downsizes to a JPEG data URL.
 */
export async function prepareImage(file: File, source: "camera" | "library", stage: Evidence["stage"] = "proof"): Promise<Evidence> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new MediaError("e.photoType", { name: file.name });
  if (file.size > MAX_IMAGE_BYTES) throw new MediaError("e.photoBig", { name: file.name });
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);
  const exif = file.type === "image/jpeg" ? readExif(buf) : { takenAt: null, gps: null };
  const bmp = await createImageBitmap(new Blob([buf], { type: file.type })).catch(() => { throw new MediaError("e.photoRead", { name: file.name }); });
  if (Math.min(bmp.width, bmp.height) < MIN_IMAGE_EDGE) { bmp.close(); throw new MediaError("e.photoSmall", { name: file.name, px: MIN_IMAGE_EDGE }); }
  const phash = dHash(bmp);
  const edge = FIREBASE ? 760 : 1200;
  const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const dataUrl = canvas.toDataURL("image/jpeg", FIREBASE ? 0.6 : 0.78);
  // A photo taken with the in-app camera is captured now; a library photo is only trusted through its EXIF time.
  const capturedAt = exif.takenAt ?? (source === "camera" ? new Date().toISOString() : null);
  return { kind: "image", dataUrl, sha256, name: file.name.slice(0, 80), size: file.size, phash, capturedAt, exifGps: exif.gps, source, stage };
}

export function getPosition(timeout = 12_000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject(new MediaError("e.gpsUnavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => reject(new MediaError(err.code === 1 ? "e.gpsDenied" : "e.gpsFailed")),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}

/** Live position; returns a stop function. */
export function watchPosition(onFix: (f: GpsFix) => void, onError: (key: string) => void) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) { onError("e.gpsUnavailable"); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
    (err) => onError(err.code === 1 ? "e.gpsDenied" : "e.gpsFailed"),
    { enableHighAccuracy: true, maximumAge: 10_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export async function avatarFromFile(file: File): Promise<string> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new MediaError("e.photoType", { name: file.name });
  if (file.size > MAX_IMAGE_BYTES) throw new MediaError("e.photoBig", { name: file.name });
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.82);
}

/** Small JPEGs for the vision check (keeps the request well under serverless body limits). */
export async function thumbForAi(dataUrl: string, edge = 512): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, edge / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}
