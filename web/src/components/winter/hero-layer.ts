/**
 * v8: "me" on the map as a 3D person (a MapLibre custom layer drawn with three.js into the map's own WebGL context).
 * The person walks when the position moves, turns to face the way it is going, and stands breathing otherwise.
 * It is drawn at a constant on-screen height, on top of the buildings so it is never lost behind one.
 */
import type { CustomLayerInterface, Map as MlMap } from "maplibre-gl";
import { buildHero, lights, shadowDisc, THREE, type Hero } from "@/lib/season/heroes3d";
import type { HeroId } from "@/lib/season/winter";

type MapLib = typeof import("maplibre-gl");
export interface HeroLayer extends CustomLayerInterface {
  set: (p: { lat: number; lng: number } | null) => void;
  setHero: (id: HeroId) => void;
}

const PX_HEIGHT = 84;
const MODEL_HEIGHT = 1.85;

export function makeHeroLayer(ml: MapLib, id: HeroId): HeroLayer {
  let map: MlMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  lights(scene);
  const holder = new THREE.Group();
  scene.add(holder);
  holder.add(shadowDisc());
  let hero: Hero = buildHero(id);
  holder.add(hero.root);

  let target: { lat: number; lng: number } | null = null;
  let cur: { x: number; y: number } | null = null;
  let heading = 0;
  let headingGoal = 0;
  let movedAt = -10;
  let last = performance.now() / 1000;
  let idleTimer = 0;
  const t0 = performance.now() / 1000;

  const layer: HeroLayer = {
    id: "hero3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },
    onRemove() {
      window.clearTimeout(idleTimer);
      renderer?.dispose();
      renderer = null;
      map = null;
    },
    render(_gl, args) {
      if (!map || !renderer || !target) return;
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      const goal = ml.MercatorCoordinate.fromLngLat([target.lng, target.lat], 0);
      if (!cur) cur = { x: goal.x, y: goal.y };
      const dx = goal.x - cur.x, dy = goal.y - cur.y;
      const metres = Math.hypot(dx, dy) / goal.meterInMercatorCoordinateUnits();
      if (metres > 60) { cur = { x: goal.x, y: goal.y }; } // a jump (first fix, a new GPS lock): no long walk
      else {
        const k = 1 - Math.exp(-dt * 3.2);
        if (metres > 0.25) { headingGoal = Math.atan2(dx, dy); movedAt = now; }
        cur.x += dx * k; cur.y += dy * k;
      }
      // turn the short way round
      let dh = headingGoal - heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      heading += dh * (1 - Math.exp(-dt * 8));
      const moving = now - movedAt < 1.2;
      hero.update(now - t0, moving);

      const worldSize = 512 * Math.pow(2, map.getZoom());
      const s = PX_HEIGHT / worldSize / MODEL_HEIGHT;
      const model = new THREE.Matrix4()
        .makeTranslation(cur.x, cur.y, 0)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(heading));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
      renderer.resetState();
      renderer.clearDepth();
      renderer.render(scene, camera);
      // smooth while walking; a calmer 20 fps while standing still
      if (moving || metres > 0.25) map.triggerRepaint();
      else { window.clearTimeout(idleTimer); idleTimer = window.setTimeout(() => map?.triggerRepaint(), 50); }
    },
    set(p) {
      target = p;
      map?.triggerRepaint();
    },
    setHero(next) {
      holder.remove(hero.root);
      hero.dispose();
      hero = buildHero(next);
      holder.add(hero.root);
      map?.triggerRepaint();
    },
  };
  return layer;
}
