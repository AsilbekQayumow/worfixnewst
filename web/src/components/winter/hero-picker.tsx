"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import { Icon } from "../icons";
import { useMe } from "../providers";
import { useI18n } from "@/lib/i18n";
import { HEROES, isHero, savedHero, saveHero, type HeroId } from "@/lib/season/winter";
import { api } from "@/lib/store/api";

/** A turntable: the hero in 3D, turning slowly; it walks while the pointer is over it. */
function Turntable({ id }: { id: HeroId }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    void import("@/lib/season/heroes3d").then(({ buildHero, lights, shadowDisc, THREE }) => {
      const el = box.current;
      if (cancelled || !el) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      lights(scene);
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      cam.position.set(0, 1.35, 5.2);
      cam.lookAt(0, 0.9, 0);
      const hero = buildHero(id);
      const turn = new THREE.Group();
      turn.add(hero.root, shadowDisc());
      scene.add(turn);
      const snow = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.12, 40), new THREE.MeshToonMaterial({ color: 0xffffff }));
      snow.position.y = -0.06;
      scene.add(snow);
      let walking = false, raf = 0, angle = -0.5;
      const t0 = performance.now();
      const size = () => { const r = el.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); };
      const tick = (now: number) => {
        angle += walking ? 0.004 : 0.008;
        turn.rotation.y = angle;
        hero.update((now - t0) / 1000, walking);
        renderer.render(scene, cam);
        raf = requestAnimationFrame(tick);
      };
      const enter = () => { walking = true; };
      const leave = () => { walking = false; };
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      size();
      const ro = new ResizeObserver(size);
      ro.observe(el);
      raf = requestAnimationFrame(tick);
      stop = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        el.removeEventListener("pointerenter", enter); el.removeEventListener("pointerleave", leave);
        hero.dispose(); snow.geometry.dispose(); (snow.material as { dispose(): void }).dispose();
        renderer.dispose(); renderer.domElement.remove();
      };
    }).catch(() => setFailed(true));
    return () => { cancelled = true; stop(); };
  }, [id]);
  return <div ref={box} className="hero-stage" data-failed={failed ? "" : undefined}>{failed && <Icon name="user" size={48} />}</div>;
}

/** v8: pick the person you walk the map as. */
export function HeroPicker({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const { me, reload } = useMe();
  const [id, setId] = useState<HeroId>("santa");
  const [saved, setSaved] = useState<HeroId>("santa");
  useEffect(() => {
    const local = savedHero();
    // the account's choice wins on a new device
    const start = me?.hero && isHero(me.hero) && !localStorage.getItem("worfix.hero") ? me.hero : local;
    setId(start); setSaved(start);
  }, [me?.hero]);
  const i = HEROES.indexOf(id);
  const step = (d: number) => setId(HEROES[(i + d + HEROES.length) % HEROES.length]);
  const pick = () => {
    saveHero(id);
    setSaved(id);
    void api.setHero(id).then(reload).catch(() => undefined);
    onDone?.();
  };
  return (
    <div className="hero-pick">
      <div className="hero-pick-stage">
        <button type="button" className="btn btn-secondary btn-icon hero-arrow" onClick={() => step(-1)} aria-label={t("a.prev")}><Icon name="chevronLeft" /></button>
        <Turntable id={id} />
        <button type="button" className="btn btn-secondary btn-icon hero-arrow" onClick={() => step(1)} aria-label={t("a.next")}><Icon name="chevronRight" /></button>
      </div>
      <div className="stack g4" style={{ textAlign: "center" }}>
        <strong className="t-h3">{t(`hero.${id}`)}</strong>
        <span className="t-small secondary">{t(`hero.${id}.b`)}</span>
      </div>
      <div className="hero-chips" role="radiogroup" aria-label={t("hero.title")}>
        {HEROES.map((h) => (
          <button key={h} type="button" role="radio" aria-checked={h === id} className="chip" data-on={h === id ? "" : undefined} onClick={() => setId(h)}>
            {t(`hero.${h}`)}{h === saved && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
      <Button variant="primary" block icon="check" onClick={pick} disabled={id === saved && !onDone}>{id === saved ? t("hero.chosen") : t("hero.pick")}</Button>
    </div>
  );
}
