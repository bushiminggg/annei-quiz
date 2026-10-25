import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {getAuth, signInAnonymously, onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import * as db from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import {firebaseConfig} from "./config.js";

const app = initializeApp(firebaseConfig);
const rdb = db.getDatabase(app);
export {db};
export const ref = p => db.ref(rdb, p);
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

export const ready = new Promise(res => {
  const auth = getAuth(app);
  onAuthStateChanged(auth, u => u && res(u));
  signInAnonymously(auth).catch(e => alert("Firebaseの匿名認証に失敗しました。手順書の手順2を確認してください。\n" + e.message));
});

// サーバー時刻との差を補正し、全員が同じ時計で競えるようにする
let offset = 0;
db.onValue(ref(".info/serverTimeOffset"), s => offset = s.val() || 0);
export const now = () => Date.now() + offset;

// ランキングのHTML(medals=trueで1〜3位に金銀銅。同点は同順位)
export const board = (sc, me, k = 99, medals = false) => {
  const a = Object.entries(sc || {}).sort((x, y) => y[1].t - x[1].t), m = ["🥇", "🥈", "🥉"];
  return a.slice(0, k).map(([id, v]) => {
    const r = a.findIndex(z => z[1].t === v.t);
    return `<li class="${id === me ? "me" : ""}"><span>${medals && v.t > 0 && m[r] ? m[r] : r + 1}</span>${esc(v.n)}<em>${v.t}</em></li>`;
  }).join("");
};

// 最終結果:問題ごとの正解と、全員の回答
export function detail(qs, lg, sc, n, me) {
  const ids = Object.entries(sc || {}).sort((x, y) => y[1].t - x[1].t).map(e => e[0]);
  let h = '<h2 class="dh">問題ごとの結果</h2>';
  for (let i = 0; i < n; i++) {
    const q = qs[i], l = (lg || {})[i];
    if (!q || !l) continue;
    const L = k => k >= 0 && q.c[k] != null ? `${"ABCD"[k]} ${esc(q.c[k])}` : "未回答";
    h += `<section class="dq"><p class="meta">第${i + 1}問<span class="pt">${q.p}点</span></p><p class="dqt">${esc(q.q)}</p><p class="da">正解 ${L(l.a)}</p><ul>` +
      ids.map(id => {
        const k = l.p && l.p[id] != null ? l.p[id] : -1, ok = k === l.a;
        return `<li class="${ok ? "o" : "x"} ${id === me ? "me" : ""}"><span>${ok ? "○" : "×"}</span>${esc(sc[id].n)}<em>${L(k)}</em></li>`;
      }).join("") + "</ul></section>";
  }
  return h;
}

// 問題セットの読み取り(CSV または JSON)。CSVは「問題文,A,B,C,D,正解(A〜D),制限秒数」
function csvRow(l) {
  const r = []; let c = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { r.push(c); c = ""; }
    else c += ch;
  }
  r.push(c);
  return r.map(s => s.trim());
}
// 得点区分:大=30点、中=15点、小=10点(数字の30/15/10も可)。空欄は中
const pts = v => { const s = String(v ?? "").trim(); return s === "大" || s === "30" ? 30 : s === "小" || s === "10" ? 10 : 15; };
export function parseSet(t) {
  t = t.trim();
  const rows = t[0] === "["
    ? JSON.parse(t).map(o => [o.q, ...o.choices, o.answer, o.sec, o.points])
    : t.split(/\r?\n/).filter(l => l.trim()).map(csvRow);
  const out = [];
  for (const r of rows) {
    if (!/^[A-D]$/i.test(String(r[5] ?? ""))) continue; // 見出し行などは読み飛ばす
    out.push({q: r[0], c: r.slice(1, 5), a: "ABCD".indexOf(r[5].toUpperCase()), s: Math.max(5, +r[6] || 30), p: pts(r[7])});
  }
  if (!out.length) throw new Error("問題を読み取れませんでした。形式を確認してください");
  return out;
}

// サウンド(Web Audioで合成。音声ファイルは不要)
let ctx;
const AC = () => { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; };
function tone(f, t0, d, type = "sine", v = 0.15) {
  if (localStorage.qzMute === "1") return;
  const c = AC(), o = c.createOscillator(), g = c.createGain(), s = c.currentTime + t0;
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(v, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
  o.connect(g).connect(c.destination); o.start(s); o.stop(s + d + 0.05);
}
const seq = (a, type, v) => a.forEach(([f, t, d]) => tone(f, t, d, type, v));
export const sfx = {
  unlock: () => AC(),
  start: () => seq([[660, 0, 0.12], [880, 0.12, 0.2]]),
  tick: () => tone(1000, 0, 0.06, "square", 0.05),
  ok: () => seq([[784, 0, 0.12], [988, 0.12, 0.12], [1318, 0.24, 0.3]]),
  ng: () => seq([[220, 0, 0.25], [165, 0.2, 0.35]], "sawtooth", 0.08),
  end: () => seq([[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]]),
};
export function soundBtn() {
  const b = document.createElement("button"); b.className = "snd";
  const set = () => b.textContent = "音 " + (localStorage.qzMute === "1" ? "オフ" : "オン");
  b.onclick = () => { localStorage.qzMute = localStorage.qzMute === "1" ? "0" : "1"; set(); sfx.unlock(); sfx.tick(); };
  set(); document.body.appendChild(b);
}
