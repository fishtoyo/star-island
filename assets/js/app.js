import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createPalette } from "./palette.js";
import { createEnvironment } from "./environment.js";
import { buildIsland, buildLink, TOP, HEX_R } from "./world.js";

// 色系清單：id 對應 theme.css 的 [data-theme="id"]
const THEMES = [
  { id: "fish", name: "Fish 藍" },
  { id: "grnet", name: "鉅潞紅" },
  { id: "coral", name: "珊瑚" },
  { id: "ocean", name: "海洋" },
  { id: "night", name: "夜空" },
];

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const params = new URLSearchParams(location.search);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => innerWidth <= 800;
const quality = params.get("quality") || (narrow() || /Mobi|Android/i.test(navigator.userAgent) ? "medium" : "high");

const state = { selected: null, hovered: null, tags: new Set(), query: "", showLinks: false, mode: "map" };

// 可調參數：網址加 ?debug 會出現調整面板，可即時修改並複製數值
const tune = {
  selectDist: 23, // 選取島嶼時的鏡頭距離（桌機）
  selectDistMobile: 30, // 同上（手機）
  hoverLift: 0.22, // 滑鼠移過時島浮起的高度
  bob: 0.04, // 島嶼漂浮幅度
  introDuration: 1.2, // 開場每座島升起的秒數
  tourHold: 4.5, // 導覽時每座島停留的秒數
};

// ?data=grnet 會改讀 assets/data/grnet.json
const dataName = /^[a-z0-9-]+$/.test(params.get("data") || "") ? params.get("data") : "data";

let data;
try {
  data = await fetch(`./assets/data/${dataName}.json`).then((r) => {
    if (!r.ok) throw Error(`${dataName}.json: ${r.status}`);
    return r.json();
  });
} catch (err) {
  console.error(err);
  $("#loading-text").textContent = "資料載入失敗，請用本機伺服器開啟（不能直接雙擊 index.html）。";
  throw err;
}

const tags = new Map(data.tags.map((t) => [t.id, t]));
const islandDefs = new Map(data.islands.map((i) => [i.id, i]));
// 把 links 的一對多展開成一條條邊
const edges = data.links.flatMap((l) => l.to.filter((to) => islandDefs.has(to) && islandDefs.has(l.from)).map((to) => ({ id: `${l.id}-${to}`, from: l.from, to, text: l.text })));

const related = (id) => edges.filter((e) => e.from === id || e.to === id).map((e) => ({ ...e, other: e.from === id ? e.to : e.from }));

function matches(def) {
  if (state.tags.size && !def.tags.some((t) => state.tags.has(t))) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [def.name, def.summary, ...def.items.flatMap((i) => [i.name, i.desc])].join(" ").toLowerCase().includes(q);
}

// 標籤顏色對應的 CSS 變數名稱（tags 的 color 欄位，預設 tag-<id>）
const tagKey = (id) => tags.get(id)?.color || `tag-${id}`;
const dots = (ids) => `<span class="dots">${ids.map((t) => `<i class="dot" style="--dot:var(--${esc(tagKey(t))})"></i>`).join("")}</span>`;
const chip = (t) => `<span class="chip" style="--dot:var(--${esc(tagKey(t))})"><span class="tag-letter">${esc(tags.get(t)?.letter)}</span>${esc(tags.get(t)?.name)}</span>`;

// ---------- 靜態文字 ----------
$("#kicker").textContent = data.meta.kicker;
$("#headline").textContent = data.meta.headline;
$("#lead").textContent = data.meta.lead;
$("#note").textContent = data.meta.note || "";
document.title = data.meta.title;
// 使用者沒選過色系時，套用資料指定的預設色系
if (!store.get("star-island-theme") && data.meta.theme) document.documentElement.dataset.theme = data.meta.theme;

// ---------- 標籤篩選 ----------
$("#tags").innerHTML = data.tags
  .map(
    (t) =>
      `<button type="button" class="tag" data-tag="${esc(t.id)}" aria-pressed="false" style="--dot:var(--${esc(tagKey(t.id))})" title="${esc(t.name)} ${esc(t.en)}"><span class="tag-letter">${esc(t.letter)}</span><span class="tag-name">${esc(t.name)}</span></button>`,
  )
  .join("");
$("#tags").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tag]");
  if (!b) return;
  const id = b.dataset.tag;
  state.tags.has(id) ? state.tags.delete(id) : state.tags.add(id);
  refreshView();
});

$("#search").addEventListener("input", (e) => {
  state.query = e.target.value;
  refreshView();
});
$("#search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const hit = data.islands.find(matches);
  if (hit) select(hit.id);
});

// ---------- 清單 ----------
$("#list-grid").innerHTML = data.islands
  .map(
    (d) => `<button type="button" class="card" data-island="${esc(d.id)}">
      <span class="card-head"><span class="card-no">${pad(d.number)}</span>${dots(d.tags)}</span>
      <strong>${esc(d.name)}</strong>
      <p>${esc(d.summary)}</p>
      <p>${d.items.length} 個項目・${related(d.id).length} 條協作線</p>
    </button>`,
  )
  .join("");
$("#list-grid").insertAdjacentHTML("beforeend", `<p class="empty" id="list-empty" hidden>沒有符合的主題。</p>`);
$("#list-grid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-island]");
  if (!b) return;
  setMode("map");
  select(b.dataset.island);
});

document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

function setMode(mode) {
  state.mode = mode;
  $("#list").hidden = mode !== "list";
  document.querySelectorAll("[data-mode]").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on);
  });
}

// ---------- 詳情面板 ----------
function renderPanel(def) {
  const rel = related(def.id);
  $("#panel-body").innerHTML = `
    <p class="panel-kicker">ISLAND ${pad(def.number)}</p>
    <h2>${esc(def.name)}</h2>
    <div class="chips">${def.tags.map(chip).join("")}</div>
    <p class="panel-summary">${esc(def.summary)}</p>
    <h3>島上有什麼 <span>${def.items.length}</span></h3>
    <ol class="items">${def.items
      .map(
        (i) =>
          `<li><button type="button" data-item="${esc(i.id)}">${i.role ? `<span class="item-role">${esc(i.role)}</span>` : ""}<strong>${esc(i.name)}${i.tag ? dots([i.tag]) : ""}</strong><span>${esc(i.desc)}</span></button>${
            i.url ? `<a class="item-link" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.linkText || "查看作品 ↗")}</a>` : ""
          }</li>`,
      )
      .join("")}</ol>
    <h3>協作關係 <span>${rel.length}</span></h3>
    ${
      rel.length
        ? `<ul class="relations">${rel
            .map((r) => `<li><button type="button" data-goto="${esc(r.other)}"><strong>${esc(islandDefs.get(r.other).name)}</strong><span>${esc(r.text)}</span></button></li>`)
            .join("")}</ul>`
        : `<p class="empty">目前沒有協作關係。</p>`
    }`;
  $("#panel").hidden = false;
  $("#panel").scrollTop = 0;
}

$("#panel-body").addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) return select(go.dataset.goto);
  const item = e.target.closest("[data-item]");
  if (item && islands) {
    const it = islands.get(state.selected)?.items.get(item.dataset.item);
    if (it) it.bounce = 1;
  }
});
$("#panel-close").addEventListener("click", () => deselect());

// ---------- 工具 ----------
$("#btn-links").addEventListener("click", (e) => {
  state.showLinks = !state.showLinks;
  e.currentTarget.setAttribute("aria-pressed", state.showLinks);
});

function themeIndex() {
  return Math.max(0, THEMES.findIndex((t) => t.id === (document.documentElement.dataset.theme || THEMES[0].id)));
}
function setThemeLabel() {
  $("#btn-theme").textContent = `色系：${THEMES[themeIndex()].name}`;
}
setThemeLabel();
$("#btn-theme").addEventListener("click", () => {
  const next = THEMES[(themeIndex() + 1) % THEMES.length];
  document.documentElement.dataset.theme = next.id;
  store.set("star-island-theme", next.id);
  setThemeLabel();
  palette?.refresh();
});

$("#btn-reset").addEventListener("click", () => {
  deselect();
});

// 鍵盤：Esc 關閉，左右方向鍵切換島嶼
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea")) return;
  if (e.key === "Escape") {
    stopTour();
    if (state.mode === "list") setMode("map");
    else if (state.selected) deselect();
  } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && islands && state.mode === "map") {
    const list = data.islands.filter(matches);
    if (!list.length) return;
    e.preventDefault();
    stopTour();
    const i = list.findIndex((d) => d.id === state.selected);
    const step = e.key === "ArrowRight" ? 1 : -1;
    select(list[i < 0 ? (step > 0 ? 0 : list.length - 1) : (i + step + list.length) % list.length].id);
  }
});

// ---------- 自動導覽 ----------
let tour = null;
function startTour() {
  const list = data.islands.filter(matches);
  if (!islands || !list.length) return;
  setMode("map");
  deselect();
  $("#btn-tour").setAttribute("aria-pressed", "true");
  let i = -1;
  const step = () => {
    if (++i >= list.length) return stopTour(true);
    select(list[i].id);
    $("#btn-tour").textContent = `停止導覽 ${i + 1}/${list.length}`;
    tour = setTimeout(step, tune.tourHold * 1000);
  };
  $("#btn-tour").textContent = "停止導覽";
  tour = setTimeout(step, 1200);
}
function stopTour(backToOverview = false) {
  if (tour === null) return;
  clearTimeout(tour);
  tour = null;
  $("#btn-tour").textContent = "導覽";
  $("#btn-tour").setAttribute("aria-pressed", "false");
  if (backToOverview) deselect();
}
$("#btn-tour").addEventListener("click", () => (tour === null ? startTour() : stopTour()));
// 使用者自己操作時就停止導覽
addEventListener("pointerdown", (e) => !e.target.closest("#btn-tour") && stopTour(), true);

// ---------- 3D 場景 ----------
let palette, islands, camera, controls, flyTarget, overview;
const links = [];

function refreshView() {
  let shown = 0;
  const rel = new Set(state.selected ? related(state.selected).map((r) => r.other) : []);
  for (const def of data.islands) {
    const on = matches(def);
    if (on) shown++;
    const isl = islands?.get(def.id);
    if (isl) {
      const el = isl.label.element;
      el.classList.toggle("is-out", !on);
      el.classList.toggle("is-selected", state.selected === def.id);
      el.classList.toggle("is-dim", on && !!state.selected && state.selected !== def.id && !rel.has(def.id));
    }
    const card = document.querySelector(`.card[data-island="${CSS.escape(def.id)}"]`);
    if (card) card.hidden = !on;
  }
  $("#list-empty").hidden = shown > 0;
  document.querySelectorAll("[data-tag]").forEach((b) => b.setAttribute("aria-pressed", state.tags.has(b.dataset.tag)));
  $("#count").textContent = `顯示 ${shown} / ${data.islands.length} 座島・${edges.length} 條協作線`;
}

function select(id) {
  const def = islandDefs.get(id);
  if (!def) return;
  state.selected = id;
  renderPanel(def);
  refreshView();
  history.replaceState(null, "", `#${id}`);
  if (islands) focusIsland(islands.get(id));
}

function deselect() {
  state.selected = null;
  $("#panel").hidden = true;
  refreshView();
  history.replaceState(null, "", location.pathname + location.search);
  if (overview) flyTo(overview.target, overview.pos);
}

function flyTo(target, pos) {
  flyTarget = { target: target.clone(), pos: pos.clone() };
  if (reduced) {
    controls.target.copy(target);
    camera.position.copy(pos);
    flyTarget = null;
  }
}

function overviewPose() {
  const center = new THREE.Vector3();
  islands.forEach((i) => center.add(i.group.position));
  center.divideScalar(islands.size).setY(TOP);
  // 依島群半徑與畫面寬高，算出能放下全部島嶼的鏡頭距離
  let radius = 0;
  islands.forEach((i) => (radius = Math.max(radius, i.group.position.clone().setY(TOP).distanceTo(center))));
  radius += HEX_R;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = Math.max((radius * 0.92) / Math.sin(hfov / 2), (radius * 0.85) / Math.sin(vfov / 2));
  controls.maxDistance = Math.max(75, dist * 1.3);
  return { target: center, pos: center.clone().add(new THREE.Vector3(0, 21, 27).setLength(dist)) };
}

function focusIsland(isl) {
  const target = isl.group.position.clone().setY(TOP);
  const dir = camera.position.clone().sub(controls.target).normalize();
  dir.y = Math.max(dir.y, 0.6);
  dir.normalize();
  const dist = narrow() ? tune.selectDistMobile : tune.selectDist;
  const look = target.clone();
  // 讓出面板的位置：桌機往右推（島偏左），手機往鏡頭方向推（島偏上）
  const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  if (narrow()) look.addScaledVector(flat, 3.2);
  else look.addScaledVector(new THREE.Vector3(-flat.z, 0, flat.x), -3.4);
  flyTo(look, look.clone().addScaledVector(dir, dist));
}

try {
  const stage = $("#stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 1.75 : 1.3));
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  stage.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "3D 島嶼地圖，可拖曳旋轉；完整鍵盤操作請使用「清單」模式");

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.id = "labels";
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 75;
  controls.maxPolarAngle = 1.25;
  controls.screenSpacePanning = false;
  controls.addEventListener("start", () => (flyTarget = null));

  palette = createPalette();
  const env = createEnvironment(scene, palette, { quality, reduced });

  islands = new Map();
  for (const def of data.islands) {
    const isl = buildIsland(def, palette, tagKey);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "label";
    el.innerHTML = `<span class="label-no">${pad(def.number)}</span><span>${esc(def.name)}</span>${dots(def.tags)}`;
    el.addEventListener("click", () => (state.selected === def.id ? deselect() : select(def.id)));
    el.addEventListener("pointerenter", () => (state.hovered = def.id));
    el.addEventListener("pointerleave", () => (state.hovered = null));
    // 開場：由中心往外依序升起
    isl.delay = 0.2 + isl.group.position.length() * 0.06;
    isl.rise = reduced ? 1 : 0;
    if (!reduced) el.classList.add("is-rising");
    isl.label = new CSS2DObject(el);
    isl.label.position.set(0, TOP + 2.1, 0);
    isl.body.add(isl.label);
    scene.add(isl.group);
    islands.set(def.id, isl);
  }

  for (const e of edges) {
    const l = buildLink(islands.get(e.from).group.position, islands.get(e.to).group.position, palette);
    Object.assign(l, e, { offset: Math.random() });
    scene.add(l.tube, l.pulse);
    links.push(l);
  }

  // 滑鼠：移過浮起，點擊選取（拖曳不算點擊）
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [...islands.values()].flatMap((i) => i.pick);
  let down = null;
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    const id = hit?.object.userData.islandId;
    return id && matches(islandDefs.get(id)) ? id : null;
  };
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    state.hovered = pick(e);
    renderer.domElement.style.cursor = state.hovered ? "pointer" : "";
  });
  renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("wheel", () => stopTour(), { passive: true });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const id = pick(e);
    if (id) select(id);
    else if (state.selected) deselect();
  });

  function resize() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    overview = overviewPose();
  }
  resize();
  addEventListener("resize", resize);
  controls.target.copy(overview.target);
  camera.position.copy(overview.pos);
  // 開場由遠拉近
  if (!reduced) camera.position.add(new THREE.Vector3(10, 18, 14));
  flyTo(overview.target, overview.pos);

  const clock = new THREE.Clock();
  const relSet = () => new Set(state.selected ? related(state.selected).map((r) => r.other) : []);

  // 省電：清單模式蓋住畫面時不重繪；15 秒沒操作時降為半速
  let lastInput = performance.now();
  let skip = false;
  for (const ev of ["pointerdown", "pointermove", "wheel", "keydown"]) addEventListener(ev, () => (lastInput = performance.now()), { passive: true });

  renderer.setAnimationLoop(() => {
    if (state.mode === "list") return;
    const idle = performance.now() - lastInput > 15000 && !flyTarget && tour === null;
    if (idle && (skip = !skip)) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 8);
    const rel = relSet();

    for (const isl of islands.values()) {
      const id = isl.def.id;
      const on = matches(isl.def);
      const lift = !on ? -0.3 : id === state.selected ? 0.35 : id === state.hovered ? tune.hoverLift : 0;
      isl.lift += (lift - isl.lift) * k;
      if (isl.rise < 1) {
        isl.rise = THREE.MathUtils.clamp((t - isl.delay) / tune.introDuration, 0, 1);
        if (isl.rise > 0.85) isl.label.element.classList.remove("is-rising");
      }
      const rise = 1 - Math.pow(1 - isl.rise, 3);
      isl.body.position.y = isl.lift + (reduced ? 0 : Math.sin(t * 0.8 + isl.phase) * tune.bob) + (rise - 1) * 3;

      const dim = !on ? 1 : state.selected && id !== state.selected && !rel.has(id) ? 0.55 : 0;
      if (Math.abs(dim - isl.owner.dim) > 0.003) {
        isl.owner.dim += (dim - isl.owner.dim) * k;
        palette.applyOwner(isl.owner);
      }
      if (!reduced) isl.rotors.forEach((r) => (r.rotation.z += dt * 2.2));
      for (const it of isl.items.values()) {
        if (it.bounce <= 0) continue;
        it.bounce = Math.max(0, it.bounce - dt * 1.2);
        const s = 1 + Math.sin((1 - it.bounce) * Math.PI * 4) * 0.25 * it.bounce;
        it.group.scale.setScalar(s);
      }
    }

    for (const l of links) {
      const ends = matches(islandDefs.get(l.from)) && matches(islandDefs.get(l.to));
      const want = ends && (state.showLinks || l.from === state.selected || l.to === state.selected) ? 1 : 0;
      l.opacity += (want - l.opacity) * k;
      l.tube.visible = l.pulse.visible = l.opacity > 0.01;
      if (!l.tube.visible) continue;
      l.tube.material.opacity = l.opacity * 0.85;
      l.pulse.material.opacity = l.opacity;
      // 光點從被選取的島出發
      let u = (t * 0.3 + l.offset) % 1;
      if (state.selected && l.to === state.selected) u = 1 - u;
      l.pulse.position.copy(l.curve.getPoint(u));
    }

    if (flyTarget) {
      const f = Math.min(1, k * 0.7);
      controls.target.lerp(flyTarget.target, f);
      camera.position.lerp(flyTarget.pos, f);
      if (camera.position.distanceTo(flyTarget.pos) < 0.03) flyTarget = null;
    }

    env.update(t);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  if (params.has("debug")) openDebugPanel({ renderer, env });
} catch (err) {
  console.error(err);
  islands = null;
  document.querySelector('[data-mode="map"]').disabled = true;
  setMode("list");
  $("#note").textContent = "你的瀏覽器無法顯示 3D 畫面，已切換為清單模式。";
}

refreshView();
const initial = decodeURIComponent(location.hash.slice(1));
if (islandDefs.has(initial)) select(initial);
requestAnimationFrame(() => setTimeout(() => $("#loading").classList.add("is-done"), 300));

// ---------- 調整面板（?debug） ----------
async function openDebugPanel({ renderer, env }) {
  const { default: GUI } = await import("../vendor/lil-gui/lil-gui.esm.min.js");
  const gui = new GUI({ title: "調整面板" });
  // 放左側，避開右上工具列與右側詳情面板
  Object.assign(gui.domElement.style, { top: "128px", left: "20px", right: "auto" });

  const cam = gui.addFolder("鏡頭");
  cam.add(camera, "fov", 20, 60, 1).name("視角 fov").onChange(() => {
    camera.updateProjectionMatrix();
    overview = overviewPose();
  });
  cam.add(tune, "selectDist", 10, 50, 0.5).name("選取距離・桌機");
  cam.add(tune, "selectDistMobile", 10, 60, 0.5).name("選取距離・手機");
  cam.add(controls, "autoRotate").name("自動旋轉");
  cam.add(controls, "autoRotateSpeed", 0.1, 3, 0.1).name("旋轉速度");

  const isle = gui.addFolder("島嶼與導覽");
  isle.add(tune, "hoverLift", 0, 1, 0.01).name("滑過浮起高度");
  isle.add(tune, "bob", 0, 0.3, 0.01).name("漂浮幅度");
  isle.add(tune, "introDuration", 0.3, 4, 0.1).name("升起秒數");
  isle.add(tune, "tourHold", 1, 10, 0.5).name("導覽停留秒數");

  const light = gui.addFolder("光線與水面");
  const lv = { sky: env.hemi.intensity, sun: env.sun.intensity };
  light.add(lv, "sky", 0, 4, 0.05).name("環境光").onChange((v) => ((env.override.sky = v), env.applyLevels()));
  light.add(lv, "sun", 0, 6, 0.05).name("日光").onChange((v) => ((env.override.sun = v), env.applyLevels()));
  light.add(renderer, "toneMappingExposure", 0.3, 2, 0.05).name("曝光");
  light.add(env.fog, "near", 0, 150, 1).name("霧起點");
  light.add(env.fog, "far", 20, 300, 1).name("霧終點");
  light.add(env.uniforms.uWave, "value", 0, 0.4, 0.01).name("浪高");
  light.add(env.uniforms.uSpeed, "value", 0, 4, 0.1).name("浪速");

  const round = (v) => Math.round(v * 100) / 100;
  const vec = (v) => v.toArray().map(round);
  const actions = {
    copy() {
      const values = {
        tune,
        camera: { fov: camera.fov, position: vec(camera.position), target: vec(controls.target) },
        light: { sky: lv.sky, sun: lv.sun, exposure: renderer.toneMappingExposure, fogNear: env.fog.near, fogFar: env.fog.far },
        water: { wave: env.uniforms.uWave.value, speed: env.uniforms.uSpeed.value },
      };
      const text = JSON.stringify(values, null, 2);
      console.log(text);
      navigator.clipboard?.writeText(text).then(
        () => (copyBtn.name("已複製 ✓"), setTimeout(() => copyBtn.name("複製數值"), 1500)),
        () => copyBtn.name("請看主控台"),
      );
    },
  };
  const copyBtn = gui.add(actions, "copy").name("複製數值");
}
