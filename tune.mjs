// AI開発工場: 「戦略を進化させる → 自己対戦で壊れた札を探す → 直す」を N 回繰り返す。
// 使い方: node reforge/tune.mjs [反復回数=100]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RULES, rng, describe, budget } from './engine.mjs';
import { initialCards } from './cards.mjs';
import { policyBot, ARCHETYPES, POLICY_KEYS } from './bots.mjs';
import { runMatches } from './sim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 100);
const PAIRS = Number(process.env.PAIRS || 1500);

let cards = initialCards();
let rules = { ...DEFAULT_RULES };
let champ = { ...ARCHETYPES.midrange };
const initialSnapshot = structuredClone(cards);
const R = rng(424242);
const history = [];

const label = (c) => `${c.name}(${c.cost}コスト ${describe(c)})`;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function evolveChampion(it) {
  const notes = [];
  for (let m = 0; m < 6; m++) {
    const cand = { ...champ };
    for (let k = 0; k < 2; k++) {
      const key = R.pick(POLICY_KEYS);
      cand[key] = clamp(cand[key] * (0.55 + R() * 0.9), 0.05, 4);
    }
    const r = runMatches({ cards, rules, botA: policyBot(cand), botB: policyBot(champ), pairs: 100, seed: it * 977 + m });
    if (r.aWinRate > 0.57) {
      const diffs = POLICY_KEYS.filter((k) => Math.abs(cand[k] / champ[k] - 1) > 0.15).map((k) => `${k}${cand[k] > champ[k] ? '↑' : '↓'}`);
      notes.push(`新戦術が旧王者に ${(r.aWinRate * 100).toFixed(0)}% 勝利（${diffs.join(' ') || '微調整'}）`);
      champ = cand;
    }
  }
  return notes;
}

function nerf(c) {
  const b = structuredClone(c);
  if (c.type === 'unit') {
    if (c.atk + c.hp > 3 && R() < 0.6) {
      if (c.atk >= c.hp && c.atk > 0) b.atk--;
      else if (c.hp > 1) b.hp--;
      else b.cost = Math.min(9, c.cost + 1);
    } else b.cost = Math.min(9, c.cost + 1);
  } else if (c.fx.n > 1 && (c.cost <= 1 || R() < 0.6)) {
    b.fx.n--;
  } else b.cost = Math.min(9, c.cost + 1);
  return b;
}
function buff(c) {
  const b = structuredClone(c);
  if (c.type === 'unit') {
    if (c.cost > 1 && R() < 0.4) b.cost--;
    else if (c.atk <= c.hp) b.atk++;
    else b.hp++;
  } else if (c.cost > 1 && R() < 0.4) b.cost--;
  else b.fx.n++;
  return b;
}

for (let it = 1; it <= N; it++) {
  const entry = { i: it, changes: [], ruleChanges: [], discoveries: [] };
  entry.discoveries.push(...evolveChampion(it));

  const m = runMatches({ cards, rules, botA: policyBot(champ), botB: policyBot(champ), pairs: PAIRS, seed: 100000 + it });
  const rows = cards.map((c) => {
    const s = m.stat.get(c.id);
    const wr = s.inW / s.inN;
    return { c, wr, dev: wr - 0.5, z: (wr - 0.5) / Math.sqrt(0.25 / s.inN), plWr: s.plN ? s.plW / s.plN : 0.5, n: s.inN };
  });
  rows.sort((a, b) => b.dev - a.dev);
  const thr = Math.max(0.022, 0.05 - it * 0.0003);
  const maxDev = Math.max(...rows.map((r) => Math.abs(r.dev)));
  const meanAbs = rows.reduce((a, r) => a + Math.abs(r.dev), 0) / rows.length;

  // ルール調整: 先手有利
  const F = m.firstWinRate;
  if (Math.abs(F - 0.5) > 0.025) {
    const step = clamp(Math.round((F - 0.5) / 0.02), -3, 3);
    const to = clamp(rules.p2Hp + step, -6, 10);
    if (to !== rules.p2Hp) {
      const sg = (v) => (v >= 0 ? '+' : '') + v;
      entry.ruleChanges.push(`後攻の体力ボーナス ${sg(rules.p2Hp)}→${sg(to)}（先手勝率 ${(F * 100).toFixed(1)}%）`);
      rules.p2Hp = to;
    }
  }

  // カード調整: 外れ値の上位3＋下位3(閾値超えのみ)
  const out = rows.filter((r) => Math.abs(r.dev) > thr && Math.abs(r.z) > 2.5);
  const picks = [...out.filter((r) => r.dev > 0).slice(0, 3), ...out.filter((r) => r.dev < 0).slice(-3)];
  for (const r of picks) {
    const before = label(r.c);
    const next = r.dev > 0 ? nerf(r.c) : buff(r.c);
    cards = cards.map((c) => (c.id === r.c.id ? next : c));
    entry.changes.push({ card: next, id: r.c.id, dir: r.dev > 0 ? 'nerf' : 'buff', wr: +r.wr.toFixed(3), before, after: label(next) });
  }
  if (rows[0].dev > 0.08)
    entry.discoveries.push(`想定外の最強札: ${label(rows[0].c)} が入ったデッキの勝率 ${(rows[0].wr * 100).toFixed(1)}%`);
  if (rows[rows.length - 1].dev < -0.08)
    entry.discoveries.push(`完全な地雷札: ${label(rows[rows.length - 1].c)} が入ったデッキの勝率 ${(rows[rows.length - 1].wr * 100).toFixed(1)}%`);
  const gap = m.curve.low - m.curve.high;
  if (Math.abs(gap) > 0.08)
    entry.discoveries.push(gap > 0 ? `低コスト偏重デッキが優勢（低${(m.curve.low * 100).toFixed(0)}% / 高${(m.curve.high * 100).toFixed(0)}%）` : `高コスト偏重デッキが優勢（低${(m.curve.low * 100).toFixed(0)}% / 高${(m.curve.high * 100).toFixed(0)}%）`);

  entry.metrics = {
    maxDev: +maxDev.toFixed(4),
    meanAbsDev: +meanAbs.toFixed(4),
    firstWin: +F.toFixed(4),
    avgTurns: +m.avgTurns.toFixed(2),
    curve: { low: +m.curve.low.toFixed(3), mid: +m.curve.mid.toFixed(3), high: +m.curve.high.toFixed(3) },
    thr: +thr.toFixed(3),
    outliers: out.length,
  };
  entry.champion = Object.fromEntries(POLICY_KEYS.map((k) => [k, +champ[k].toFixed(2)]));
  entry.rules = { ...rules };
  if (it % 10 === 0 || it === 1 || it === N) {
    const bots = { ...Object.fromEntries(Object.entries(ARCHETYPES).map(([k, w]) => [k, policyBot(w)])), champion: policyBot(champ) };
    const names = Object.keys(bots);
    entry.matrix = {};
    for (const a of names) {
      entry.matrix[a] = {};
      for (const b of names) {
        entry.matrix[a][b] = a === b ? 0.5 : +runMatches({ cards, rules, botA: bots[a], botB: bots[b], pairs: 150, seed: it * 31 + 5 }).aWinRate.toFixed(3);
      }
    }
  }
  history.push(entry);
  process.stdout.write(`#${String(it).padStart(3)} maxDev ${(maxDev * 100).toFixed(1)}% 先手 ${(F * 100).toFixed(1)}% 変更${entry.changes.length}${entry.ruleChanges.length ? '+rule' : ''} ${entry.discoveries[0] || ''}\n`);
}

// 最終カードの勝率(新しい種で再計測)
const fin = runMatches({ cards, rules, botA: policyBot(champ), botB: policyBot(champ), pairs: PAIRS * 2, seed: 777 });
const finalStats = Object.fromEntries(cards.map((c) => [c.id, +(fin.stat.get(c.id).inW / fin.stat.get(c.id).inN).toFixed(3)]));
const initM = runMatches({ cards: initialSnapshot, rules: DEFAULT_RULES, botA: policyBot(ARCHETYPES.midrange), botB: policyBot(ARCHETYPES.midrange), pairs: PAIRS * 2, seed: 777 });
const initStats = Object.fromEntries(initialSnapshot.map((c) => [c.id, +(initM.stat.get(c.id).inW / initM.stat.get(c.id).inN).toFixed(3)]));

const data = {
  generatedAt: new Date().toISOString(),
  iterations: N,
  initial: { cards: initialSnapshot, rules: DEFAULT_RULES, stats: initStats, firstWin: +initM.firstWinRate.toFixed(3) },
  final: { cards, rules, stats: finalStats, champion: champ, firstWin: +fin.firstWinRate.toFixed(3), avgTurns: +fin.avgTurns.toFixed(2), curve: fin.curve },
  history,
};
fs.mkdirSync(path.join(here, 'data'), { recursive: true });
fs.mkdirSync(path.join(here, 'web'), { recursive: true });
fs.writeFileSync(path.join(here, 'data', 'history.json'), JSON.stringify(data, null, 1));
fs.writeFileSync(path.join(here, 'web', 'data.js'), 'window.REFORGE=' + JSON.stringify(data) + ';\n');
const absDev = (st) => Math.max(...Object.values(st).map((w) => Math.abs(w - 0.5)));
console.log(`\n初期 最大偏差 ${(absDev(initStats) * 100).toFixed(1)}% → 最終 ${(absDev(finalStats) * 100).toFixed(1)}% / 先手勝率 ${(initM.firstWinRate * 100).toFixed(1)}% → ${(fin.firstWinRate * 100).toFixed(1)}%`);
