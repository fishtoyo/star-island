// 3D 材質色票：所有顏色都從 theme.css 的 CSS 變數讀取。
// 換色系時呼叫 refresh()，場景內所有材質會同步更新。
import * as THREE from "three";

const root = document.documentElement;

export function createPalette() {
  const entries = [];
  const listeners = [];
  const fog = new THREE.Color();
  let cache = new Map();

  const read = (key) => {
    if (!cache.has(key)) cache.set(key, getComputedStyle(root).getPropertyValue(`--${key}`).trim());
    return cache.get(key);
  };
  fog.set(read("c-fog") || "#ffffff");

  // owner：可選，帶 dim（0~1）的物件；dim 越大，顏色越接近霧色
  function apply(e) {
    const target = e.material[e.prop];
    target.copy(e.base);
    if (e.owner?.dim) target.lerp(fog, e.owner.dim * 0.7);
  }

  function track(material, key, prop = "color", owner = null) {
    const e = { material, key, prop, owner, base: new THREE.Color(read(key) || "#ff00ff") };
    entries.push(e);
    owner?.entries.push(e);
    apply(e);
    return material;
  }

  return {
    read,
    number: (key, fallback) => parseFloat(read(key)) || fallback,
    color: (key) => new THREE.Color(read(key) || "#ff00ff"),
    track,
    mat: (key, opts = {}, owner = null) =>
      track(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts }), key, "color", owner),
    basic: (key, opts = {}, owner = null) => track(new THREE.MeshBasicMaterial(opts), key, "color", owner),
    owner: () => ({ dim: 0, entries: [] }),
    applyOwner(owner) {
      owner.entries.forEach(apply);
    },
    onRefresh(fn) {
      listeners.push(fn);
    },
    refresh() {
      cache = new Map();
      fog.set(read("c-fog"));
      for (const e of entries) {
        e.base.set(read(e.key) || "#ff00ff");
        apply(e);
      }
      listeners.forEach((fn) => fn());
    },
  };
}
