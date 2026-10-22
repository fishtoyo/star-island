// 六角島嶼、島上建築與協作線。
// 造型為裝飾用途，只依 data.json 的 shape / tag 決定外觀。
import * as THREE from "three";
import { WATER_Y } from "./environment.js";

export const HEX_R = 2; // 六角外接圓半徑（尖頂朝 ±z）
export const GAP = 0.9; // 相鄰兩島之間的水道寬度
export const TOP = 0.6; // 地面高度
const SQ3 = Math.sqrt(3);
const SIZE = HEX_R + GAP / SQ3;

// axial 座標 → 世界座標（pointy-top）
export function axialToWorld(q, r) {
  return new THREE.Vector3(SIZE * SQ3 * (q + r / 2), 0, SIZE * 1.5 * r);
}

// 固定亂數，讓每次載入的樹木位置一致
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUND_KEY = { land: "c-land", sand: "c-sand", plaza: "c-plaza" };

function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function tree(mat, rng) {
  const g = new THREE.Group();
  const s = 0.75 + rng() * 0.5;
  const trunk = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 6), mat("c-trunk"));
  trunk.position.y = 0.11;
  const crown =
    rng() > 0.5
      ? mesh(new THREE.ConeGeometry(0.22, 0.55, 7), mat("c-tree", { flatShading: true }))
      : mesh(new THREE.IcosahedronGeometry(0.24, 0), mat("c-tree", { flatShading: true }));
  crown.position.y = crown.geometry.type === "ConeGeometry" ? 0.48 : 0.4;
  g.add(trunk, crown);
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI;
  return g;
}

// 建築造型：每種都約 0.9 × 0.9 的佔地
const SHAPES = {
  tower(mat, color) {
    const g = new THREE.Group();
    const h = 1.35;
    const body = mesh(new THREE.BoxGeometry(0.56, h, 0.56), mat(color));
    body.position.y = h / 2;
    g.add(body);
    for (const y of [0.45, 0.9]) {
      const band = mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), mat("c-wall"));
      band.position.y = y;
      g.add(band);
    }
    const cap = mesh(new THREE.BoxGeometry(0.66, 0.1, 0.66), mat("c-wall"));
    cap.position.y = h + 0.05;
    g.add(cap);
    return g;
  },
  house(mat, color) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.7, 0.45, 0.56), mat("c-wall"));
    body.position.y = 0.225;
    const roof = mesh(new THREE.ConeGeometry(0.56, 0.42, 4), mat(color, { flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.05, 1, 0.85);
    roof.position.y = 0.45 + 0.21;
    const door = mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02), mat("c-roof"));
    door.position.set(0, 0.12, 0.29);
    g.add(body, roof, door);
    return g;
  },
  dome(mat, color) {
    const g = new THREE.Group();
    const base = mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.34, 18), mat(color));
    base.position.y = 0.17;
    const dome = mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat("c-wall"));
    dome.position.y = 0.34;
    const spire = mesh(new THREE.ConeGeometry(0.05, 0.3, 8), mat(color));
    spire.position.y = 0.34 + 0.42 + 0.12;
    g.add(base, dome, spire);
    return g;
  },
  hall(mat, color) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.95, 0.42, 0.66), mat(color));
    body.position.y = 0.21;
    const roof = mesh(new THREE.BoxGeometry(1.03, 0.08, 0.74), mat("c-wall"));
    roof.position.y = 0.46;
    const box = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.3), mat("c-wall"));
    box.position.set(-0.22, 0.6, 0);
    g.add(body, roof, box);
    for (const x of [-0.3, 0, 0.3]) {
      const win = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), mat("c-wall"));
      win.position.set(x, 0.24, 0.335);
      g.add(win);
    }
    return g;
  },
  turbine(mat, color, rotors) {
    const g = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.7, 8), mat("c-wall"));
    pole.position.y = 0.85;
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.72, 0.08);
    const hub = mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(color));
    rotor.add(hub);
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.BoxGeometry(0.07, 0.62, 0.02), mat("c-wall"));
      blade.geometry.translate(0, 0.31, 0);
      blade.rotation.z = (i * Math.PI * 2) / 3;
      rotor.add(blade);
    }
    rotors.push(rotor);
    const base = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), mat(color));
    base.position.y = 0.05;
    g.add(pole, rotor, base);
    return g;
  },
  person(mat, color, rotors, rng) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 12), mat(color));
    body.position.y = 0.19;
    const head = mesh(new THREE.SphereGeometry(0.11, 14, 10), mat("c-wall"));
    head.position.y = 0.5;
    const hair = mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("c-trunk"));
    hair.position.y = 0.515;
    hair.rotation.x = -0.25;
    g.add(body, head, hair);
    g.scale.setScalar(1.25 + rng() * 0.15);
    return g;
  },
  flag(mat, color) {
    const g = new THREE.Group();
    const stone = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8), mat("c-cliff", { flatShading: true }));
    stone.position.y = 0.05;
    const pole = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6), mat("c-wall"));
    pole.position.y = 0.5;
    const cloth = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.02), mat(color));
    cloth.position.set(0.18, 0.82, 0);
    g.add(stone, pole, cloth);
    return g;
  },
  grove(mat, color, rotors, rng) {
    const g = new THREE.Group();
    const pad = mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.05, 20), mat(color));
    pad.position.y = 0.025;
    g.add(pad);
    [
      [-0.18, -0.1],
      [0.2, -0.14],
      [0.02, 0.2],
    ].forEach(([x, z]) => {
      const t = tree(mat, rng);
      t.position.set(x, 0.05, z);
      g.add(t);
    });
    return g;
  },
};

// 建築擺放位置：少於 5 個圍成一圈；5 個以上中央放一個
function slots(n) {
  if (n === 1) return [[0, 0]];
  const ring = n <= 4 ? n : n - 1;
  const r = n <= 4 ? 0.95 : 1.1;
  const out = n <= 4 ? [] : [[0, 0]];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + Math.PI / 6;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

export function buildIsland(def, palette) {
  const owner = palette.owner();
  const mat = (key, opts) => palette.mat(key, opts, owner);
  const rng = mulberry(def.number * 9973);

  const group = new THREE.Group();
  group.position.copy(axialToWorld(...def.axial));
  const body = new THREE.Group();
  group.add(body);

  const cliff = mesh(new THREE.CylinderGeometry(HEX_R * 0.97, HEX_R * 0.78, 1.5, 6), mat("c-cliff", { flatShading: true }));
  cliff.position.y = TOP - 0.2 - 0.75;
  const land = mesh(new THREE.CylinderGeometry(HEX_R, HEX_R * 0.97, 0.22, 6), mat(GROUND_KEY[def.ground] || "c-land"));
  land.position.y = TOP - 0.11;
  body.add(cliff, land);

  // 主題色鑲邊
  const rim = mesh(new THREE.CylinderGeometry(HEX_R * 1.005, HEX_R * 1.005, 0.06, 6, 1, true), mat(`tag-${def.tags[0] || "s"}`, { side: THREE.DoubleSide }), { cast: false });
  rim.position.y = TOP - 0.03;
  body.add(rim);

  const rotors = [];
  const items = new Map();
  const spots = slots(def.items.length);
  def.items.forEach((item, i) => {
    const color = `tag-${item.tag || def.tags[0] || "s"}`;
    const build = SHAPES[item.shape] || SHAPES.house;
    const g = build(mat, color, rotors, rng);
    const [x, z] = spots[i];
    g.position.set(x, TOP, z);
    g.rotation.y = Math.atan2(x, z) + (rng() - 0.5) * 0.3;
    body.add(g);
    items.set(item.id, { group: g, bounce: 0 });
  });

  // 角落點綴樹木（避開建築）
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const p = [Math.sin(a) * 1.55, Math.cos(a) * 1.55];
    if (rng() < 0.35 || spots.some(([x, z]) => Math.hypot(x - p[0], z - p[1]) < 0.75)) continue;
    const t = tree(mat, rng);
    t.position.set(p[0], TOP, p[1]);
    body.add(t);
  }

  body.traverse((o) => (o.userData.islandId = def.id));

  // 島邊浪花（不隨島起伏）
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(HEX_R * 0.9, HEX_R * 1.12, 6, 1, Math.PI / 2),
    palette.basic("c-foam", { transparent: true, opacity: 0.55, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = WATER_Y + 0.13;
  group.add(foam);

  return {
    def,
    group,
    body,
    owner,
    items,
    rotors,
    pick: [cliff, land],
    lift: 0,
    phase: rng() * Math.PI * 2,
  };
}

// 兩島之間的弧形協作線，加上一顆沿線移動的光點
export function buildLink(a, b, palette) {
  const p0 = a.clone().setY(TOP + 0.35);
  const p1 = b.clone().setY(TOP + 0.35);
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  mid.y += 1.2 + p0.distanceTo(p1) * 0.22;
  const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.05, 6),
    palette.basic("c-link", { transparent: true, opacity: 0, depthWrite: false }),
  );
  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 8),
    palette.basic("c-yellow", { transparent: true, opacity: 0, depthWrite: false }),
  );
  tube.visible = pulse.visible = false;
  return { tube, pulse, curve, opacity: 0 };
}
