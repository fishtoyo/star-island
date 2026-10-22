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

  // 低多邊形水面：起伏在 vertex shader 裡計算（GPU），不佔 CPU
  const uniforms = { uTime: { value: 0 }, uWave: { value: reduced ? 0 : 0.07 }, uSpeed: { value: 1 } };
  const seg = quality === "high" ? 96 : 56;
  const geo = new THREE.PlaneGeometry(220, 220, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const material = palette.mat("c-water", { flatShading: true, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.94 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWave;\nuniform float uSpeed;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float wt = uTime * uSpeed;
        transformed.y += (sin(position.x * 0.32 + wt * 0.9) + cos(position.z * 0.27 + wt * 0.7)) * uWave;`,
      );
  };
  const water = new THREE.Mesh(geo, material);
  water.position.y = WATER_Y;
  water.receiveShadow = quality !== "low";
  scene.add(water);

  // 亮度預設讀 theme.css；debug 面板可用 override 暫時覆蓋
  const override = { sky: null, sun: null };
  const applyLevels = () => {
    scene.fog.color.set(palette.read("c-fog"));
    hemi.intensity = override.sky ?? palette.number("sky-intensity", 1.6);
    sun.intensity = override.sun ?? palette.number("sun-intensity", 2.4);
  };
  applyLevels();
  palette.onRefresh(applyLevels);

  return {
    uniforms,
    fog: scene.fog,
    hemi,
    sun,
    override,
    applyLevels,
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}
