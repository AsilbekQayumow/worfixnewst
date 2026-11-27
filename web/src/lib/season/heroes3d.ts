/**
 * v8: the 3D people you walk the map as — built from simple shapes (no model files to download), toon-shaded,
 * with a walk cycle. Units are metres, feet at the origin, facing +Z, about 1.8 m tall.
 */
import * as THREE from "three";
import type { HeroId } from "./winter";

export interface Hero {
  root: THREE.Group;
  /** t = seconds; moving = walking (legs swing) or standing (breathing) */
  update: (t: number, moving: boolean) => void;
  dispose: () => void;
}

let gradient: THREE.DataTexture | null = null;
function grad() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

class Kit {
  geos: THREE.BufferGeometry[] = [];
  mats = new Map<string, THREE.Material>();
  tex: THREE.Texture[] = [];
  mat(color: string | THREE.Texture, basic = false) {
    const key = typeof color === "string" ? `${color}${basic}` : color.uuid;
    let m = this.mats.get(key);
    if (!m) {
      m = typeof color === "string"
        ? (basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshToonMaterial({ color, gradientMap: grad() }))
        : new THREE.MeshToonMaterial({ map: color, gradientMap: grad() });
      this.mats.set(key, m);
    }
    return m;
  }
  g<T extends THREE.BufferGeometry>(geo: T) { this.geos.push(geo); return geo; }
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: string | THREE.Texture, x = 0, y = 0, z = 0, opts: { s?: [number, number, number]; r?: [number, number, number]; basic?: boolean } = {}) {
    const m = new THREE.Mesh(this.g(geo), this.mat(color, opts.basic));
    m.position.set(x, y, z);
    if (opts.s) m.scale.set(...opts.s);
    if (opts.r) m.rotation.set(...opts.r);
    parent.add(m);
    return m;
  }
  stripes(colors: string[], vertical = true) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const n = colors.length * 2;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      if (vertical) g.fillRect((i * 64) / n, 0, 64 / n + 1, 64); else g.fillRect(0, (i * 64) / n, 64, 64 / n + 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(vertical ? 3 : 1, vertical ? 1 : 3);
    t.colorSpace = THREE.SRGBColorSpace;
    this.tex.push(t);
    return t;
  }
  dispose() { this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); this.tex.forEach((t) => t.dispose()); }
}

const sphere = (r: number) => new THREE.SphereGeometry(r, 20, 14);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);
const cyl = (top: number, bottom: number, h: number, seg = 20) => new THREE.CylinderGeometry(top, bottom, h, seg);
const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 20);
const torus = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 10, 24);

interface Look {
  skin: string; coat: string | THREE.Texture; trim?: string; pants: string | THREE.Texture; boots: string; gloves?: string; sleeve?: string | THREE.Texture;
  long?: boolean; belt?: string; buckle?: string; beard?: boolean; hair?: string; braid?: string; ears?: boolean;
  hat?: "santa" | "kokoshnik" | "elf" | "doppi" | "cap"; hatColor?: string; vest?: string; backpack?: string; collar?: string;
}

function face(k: Kit, head: THREE.Object3D, skin: string, cheeks = "#ff8a8a") {
  k.add(head, sphere(0.19), skin);
  k.add(head, sphere(0.026), "#1d1712", -0.065, 0.025, 0.168, { basic: true });
  k.add(head, sphere(0.026), "#1d1712", 0.065, 0.025, 0.168, { basic: true });
  k.add(head, sphere(0.009), "#ffffff", -0.058, 0.035, 0.19, { basic: true });
  k.add(head, sphere(0.009), "#ffffff", 0.072, 0.035, 0.19, { basic: true });
  k.add(head, sphere(0.03), skin, 0, -0.01, 0.19, { s: [1, 0.9, 0.8] });
  k.add(head, sphere(0.03), cheeks, -0.11, -0.04, 0.14, { s: [1, 0.6, 0.4], basic: true });
  k.add(head, sphere(0.03), cheeks, 0.11, -0.04, 0.14, { s: [1, 0.6, 0.4], basic: true });
  const smile = new THREE.Mesh(k.g(new THREE.TorusGeometry(0.045, 0.008, 6, 16, Math.PI)), k.mat("#7a3a2a", true));
  smile.position.set(0, -0.06, 0.172);
  smile.rotation.set(0.2, 0, Math.PI);
  head.add(smile);
}

function person(k: Kit, l: Look): Hero {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // legs (pivot at the hip)
  const legs = [-0.1, 0.1].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.86, 0);
    k.add(leg, capsule(0.075, 0.6), l.pants, 0, -0.38, 0);
    k.add(leg, sphere(0.1), l.boots, 0, -0.8, 0.04, { s: [0.9, 0.6, 1.35] });
    body.add(leg);
    return leg;
  });
  // the coat
  if (l.long) {
    k.add(body, cyl(0.2, 0.36, 1.05), l.coat, 0, 0.92, 0);
    if (l.trim) k.add(body, torus(0.36, 0.035), l.trim, 0, 0.41, 0, { r: [Math.PI / 2, 0, 0] });
    if (l.trim) k.add(body, new THREE.BoxGeometry(0.07, 0.95, 0.02), l.trim, 0, 0.92, 0.27, { r: [-0.13, 0, 0] });
  } else {
    k.add(body, cyl(0.2, 0.25, 0.58), l.coat, 0, 1.14, 0);
    if (l.trim) k.add(body, torus(0.25, 0.035), l.trim, 0, 0.86, 0, { r: [Math.PI / 2, 0, 0] });
    if (l.vest) k.add(body, cyl(0.215, 0.262, 0.46), l.vest, 0, 1.12, 0);
  }
  if (l.belt) {
    k.add(body, cyl(l.long ? 0.235 : 0.245, l.long ? 0.24 : 0.25, 0.07), l.belt, 0, 0.94, 0);
    if (l.buckle) k.add(body, new THREE.BoxGeometry(0.09, 0.07, 0.03), l.buckle, 0, 0.94, l.long ? 0.24 : 0.25);
  }
  if (l.collar) k.add(body, cone(0.26, 0.14), l.collar, 0, 1.4, 0);
  if (l.backpack) {
    k.add(body, new THREE.BoxGeometry(0.34, 0.4, 0.16), l.backpack, 0, 1.14, -0.26);
    k.add(body, new THREE.BoxGeometry(0.26, 0.14, 0.06), l.backpack, 0, 1.04, -0.36);
  }
  // arms (pivot at the shoulder)
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 1.36, 0);
    arm.rotation.z = side * 0.14;
    k.add(arm, capsule(0.062, 0.4), l.sleeve ?? l.coat, 0, -0.23, 0);
    if (l.trim && !l.vest) k.add(arm, torus(0.066, 0.024), l.trim, 0, -0.45, 0, { r: [Math.PI / 2, 0, 0] });
    k.add(arm, sphere(0.07), l.gloves ?? l.skin, 0, -0.52, 0);
    body.add(arm);
    return arm;
  });
  // head
  const head = new THREE.Group();
  head.position.set(0, 1.64, 0);
  body.add(head);
  k.add(body, cyl(0.07, 0.08, 0.1), l.skin, 0, 1.47, 0);
  face(k, head, l.skin);
  // hair: a cap over the top and the back, leaving the face open
  if (l.hair) k.add(head, new THREE.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, 0, 1.35), l.hair, 0, 0.01, -0.02, { r: [-0.5, 0, 0] });
  if (l.braid) for (let i = 0; i < 6; i++) k.add(head, sphere(0.055 - i * 0.004), l.braid, 0, -0.12 - i * 0.09, -0.19 - i * 0.012);
  if (l.ears) {
    k.add(head, cone(0.045, 0.16), l.skin, -0.2, 0.02, 0, { r: [0, 0, Math.PI / 2 + 0.5] });
    k.add(head, cone(0.045, 0.16), l.skin, 0.2, 0.02, 0, { r: [0, 0, -Math.PI / 2 - 0.5] });
  } else {
    k.add(head, sphere(0.04), l.skin, -0.19, 0, 0, { s: [0.6, 1, 0.8] });
    k.add(head, sphere(0.04), l.skin, 0.19, 0, 0, { s: [0.6, 1, 0.8] });
  }
  if (l.beard) {
    k.add(head, sphere(0.18), "#ffffff", 0, -0.12, 0.07, { s: [1, 1.2, 0.75] });
    k.add(head, sphere(0.05), "#f4f4f4", -0.05, -0.04, 0.18, { s: [1.4, 0.7, 0.7] });
    k.add(head, sphere(0.05), "#f4f4f4", 0.05, -0.04, 0.18, { s: [1.4, 0.7, 0.7] });
  }
  // hats
  const hc = l.hatColor ?? "#d6262f";
  if (l.hat === "santa") {
    k.add(head, torus(0.18, 0.05), "#ffffff", 0, 0.12, 0, { r: [Math.PI / 2 + 0.15, 0, 0] });
    const tip = new THREE.Group();
    tip.position.set(0, 0.15, -0.02);
    tip.rotation.x = -0.55;
    k.add(tip, cone(0.18, 0.42), hc, 0, 0.2, 0);
    k.add(tip, sphere(0.065), "#ffffff", 0, 0.42, 0);
    head.add(tip);
  } else if (l.hat === "elf") {
    k.add(head, torus(0.18, 0.04), "#d6262f", 0, 0.12, 0, { r: [Math.PI / 2 + 0.1, 0, 0] });
    const tip = new THREE.Group();
    tip.position.set(0, 0.15, -0.02);
    tip.rotation.x = -0.75;
    k.add(tip, cone(0.17, 0.55), hc, 0, 0.26, 0);
    k.add(tip, sphere(0.05), "#ffd23f", 0, 0.55, 0);
    head.add(tip);
  } else if (l.hat === "kokoshnik") {
    const half = new THREE.CircleGeometry(0.3, 28, 0, Math.PI);
    k.add(head, half, hc, 0, 0.1, 0.02, { r: [-0.15, 0, 0] });
    k.add(head, new THREE.TorusGeometry(0.3, 0.025, 8, 28, Math.PI), "#ffffff", 0, 0.1, 0.03, { r: [-0.15, 0, 0] });
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) k.add(head, new THREE.BoxGeometry(0.02, 0.16, 0.012), "#ffffff", 0, 0.26, 0.045, { r: [-0.15, 0, a] });
    k.add(head, new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, 1.3), hc, 0, 0.02, -0.02, { r: [-0.45, 0, 0] });
  } else if (l.hat === "doppi") {
    const d = k.add(head, new THREE.CylinderGeometry(0.17, 0.195, 0.13, 4), k.stripes(["#151515", "#151515", "#f2f2f2"], false), 0, 0.17, 0);
    d.rotation.y = Math.PI / 4;
  } else if (l.hat === "cap") {
    k.add(head, new THREE.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, 0, 1.25), hc, 0, 0.03, 0, { r: [-0.15, 0, 0] });
    k.add(head, cyl(0.15, 0.15, 0.02), hc, 0, 0.08, 0.17, { s: [1, 1, 0.8] });
  }
  return {
    root,
    update(t, moving) {
      const w = moving ? Math.sin(t * 9) : 0;
      legs[0].rotation.x = w * 0.6;
      legs[1].rotation.x = -w * 0.6;
      arms[0].rotation.x = -w * 0.55 + (moving ? 0 : Math.sin(t * 1.6) * 0.05);
      arms[1].rotation.x = w * 0.55 - (moving ? 0 : Math.sin(t * 1.6) * 0.05);
      body.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 2) * 0.008;
      head.rotation.z = moving ? Math.sin(t * 4.5) * 0.04 : Math.sin(t * 0.8) * 0.06;
    },
    dispose: () => k.dispose(),
  };
}

function snowman(k: Kit): Hero {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  k.add(body, sphere(0.42), "#ffffff", 0, 0.38, 0);
  k.add(body, sphere(0.31), "#ffffff", 0, 0.98, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.45, 0);
  body.add(head);
  k.add(head, sphere(0.22), "#ffffff");
  k.add(head, sphere(0.03), "#1d1712", -0.075, 0.04, 0.19, { basic: true });
  k.add(head, sphere(0.03), "#1d1712", 0.075, 0.04, 0.19, { basic: true });
  k.add(head, cone(0.04, 0.22), "#f08a24", 0, -0.01, 0.29, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 5; i++) { const a = -0.5 + i * 0.25; k.add(head, sphere(0.016), "#2a2420", Math.sin(a) * 0.13, -0.1 - Math.cos(a * 2) * 0.012, 0.185, { basic: true }); }
  k.add(head, sphere(0.035), "#ff8a8a", -0.12, -0.04, 0.16, { s: [1, 0.6, 0.4], basic: true });
  k.add(head, sphere(0.035), "#ff8a8a", 0.12, -0.04, 0.16, { s: [1, 0.6, 0.4], basic: true });
  k.add(head, cyl(0.3, 0.3, 0.03), "#1f1f24", 0, 0.17, 0);
  k.add(head, cyl(0.17, 0.18, 0.32), "#1f1f24", 0, 0.34, 0);
  k.add(head, cyl(0.182, 0.185, 0.07), "#e2333b", 0, 0.22, 0);
  k.add(body, torus(0.24, 0.07), "#e2333b", 0, 1.24, 0, { r: [Math.PI / 2, 0, 0] });
  k.add(body, new THREE.BoxGeometry(0.12, 0.34, 0.05), "#e2333b", 0.12, 1.08, 0.24, { r: [0.2, 0, 0.15] });
  for (const y of [0.88, 1.0, 1.12]) k.add(body, sphere(0.035), "#2a2420", 0, y, 0.3 - (y - 1) * 0.1, { basic: true });
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.28, 1.05, 0);
    arm.rotation.z = side * -0.9;
    k.add(arm, cyl(0.018, 0.024, 0.55, 6), "#6b4423", 0, 0.27, 0);
    k.add(arm, cyl(0.012, 0.014, 0.15, 6), "#6b4423", side * 0.05, 0.45, 0, { r: [0, 0, side * -0.7] });
    body.add(arm);
    return arm;
  });
  return {
    root,
    update(t, moving) {
      const hop = moving ? Math.abs(Math.sin(t * 7)) : 0;
      body.position.y = hop * 0.12;
      body.rotation.z = moving ? Math.sin(t * 7) * 0.08 : Math.sin(t * 1.2) * 0.03;
      arms[0].rotation.z = 0.9 + (moving ? Math.sin(t * 7) * 0.3 : Math.sin(t * 2) * 0.1);
      arms[1].rotation.z = -0.9 - (moving ? Math.sin(t * 7) * 0.3 : Math.sin(t * 2) * 0.1);
      head.rotation.y = Math.sin(t * 0.9) * 0.15;
    },
    dispose: () => k.dispose(),
  };
}

export function buildHero(id: HeroId): Hero {
  const k = new Kit();
  switch (id) {
    case "santa": return person(k, { skin: "#f5cfae", coat: "#d6262f", trim: "#ffffff", pants: "#b71f28", boots: "#1f1f24", gloves: "#1f1f24", belt: "#1f1f24", buckle: "#ffc93c", beard: true, hat: "santa" });
    case "snowmaiden": return person(k, { skin: "#f7dcc4", coat: "#2f7fd6", trim: "#ffffff", pants: "#2f7fd6", boots: "#ffffff", gloves: "#ffffff", long: true, braid: "#e8b04c", hair: "#e8b04c", hat: "kokoshnik", hatColor: "#2f7fd6" });
    case "snowman": return snowman(k);
    case "elf": return person(k, { skin: "#f5cfae", coat: "#1d9a4a", pants: k.stripes(["#d6262f", "#ffffff"], false), boots: "#6b4423", belt: "#1f1f24", buckle: "#ffc93c", collar: "#d6262f", ears: true, hat: "elf", hatColor: "#1d9a4a", hair: "#9c4a22" });
    case "chopon": {
      const robe = k.stripes(["#1f4fa8", "#2f9e7a", "#7a1f3d", "#e8b04c"]);
      return person(k, { skin: "#e0b089", coat: robe, sleeve: robe, long: true, pants: "#2b2b33", boots: "#3a2414", belt: "#d6262f", hair: "#22170f", hat: "doppi" });
    }
    default: return person(k, { skin: "#e8b48f", coat: "#ffffff", vest: "#1fa84a", sleeve: "#ffffff", pants: "#2f4f7a", boots: "#2a2a2a", hat: "cap", hatColor: "#1fa84a", backpack: "#f2a01f", hair: "#3d2717" });
  }
}

/** The soft round shadow under the feet. */
export function shadowDisc() {
  const geo = new THREE.CircleGeometry(0.45, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  return m;
}

export function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(2, 4, 3);
  scene.add(sun);
}
export { THREE };
