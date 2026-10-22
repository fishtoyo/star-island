// 水面、霧、燈光。顏色與亮度皆來自 theme.css。
import * as THREE from "three";

export const WATER_Y = 0;

export function createEnvironment(scene, palette, { quality, reduced }) {
  scene.fog = new THREE.Fog(palette.color("c-fog"), 45, 120);

  const hemi = new THREE.HemisphereLight();
  palette.track(hemi, "light-sky", "color");
  palette.track(hemi, "light-ground", "groundColor");
  scene.add(hemi);

  const sun = new THREE.DirectionalLight();
  palette.track(sun, "light-sun", "color");
  sun.position.set(-14, 26, 12);
  if (quality !== "low") {
    sun.castShadow = true;
    const size = quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun);

  // 低多邊形水面，頂點上下起伏
  const seg = quality === "high" ? 96 : 56;
  const geo = new THREE.PlaneGeometry(220, 220, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const water = new THREE.Mesh(
    geo,
    palette.mat("c-water", { flatShading: true, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.94 }),
  );
  water.position.y = WATER_Y;
  water.receiveShadow = quality !== "low";
  scene.add(water);

  const applyLevels = () => {
    scene.fog.color.set(palette.read("c-fog"));
    hemi.intensity = palette.number("sky-intensity", 1.6);
    sun.intensity = palette.number("sun-intensity", 2.4);
  };
  applyLevels();
  palette.onRefresh(applyLevels);

  return {
    update(t) {
      if (reduced) return;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          z = pos.getZ(i);
        pos.setY(i, Math.sin(x * 0.32 + t * 0.9) * 0.07 + Math.cos(z * 0.27 + t * 0.7) * 0.07);
      }
      pos.needsUpdate = true;
    },
  };
}
