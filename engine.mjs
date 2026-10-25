// ReForge ゲームエンジン。ブラウザと Node の両方で動く純粋関数だけで書く。
// 2人対戦のカードバトル。場(board)に最大 MAX_BOARD 体、クリーチャーが殴り合う。

export const MAX_BOARD = 5;
export const MAX_HAND = 8;

export const DEFAULT_RULES = {
  heroHp: 20,
  deckSize: 30,
  copies: 2,
  startHand: 3,
  p2StartHand: 5, // 後攻の追加ドロー（先手有利の補正に使う）
  p2Energy: 0, // 後攻の初期エネルギー上乗せ(コイン相当)
  p2Hp: 0, // 後攻の体力ボーナス(負なら先手が有利側に倒れた時の逆補正)
  maxEnergy: 10,
  fatigueStart: 1,
};

// ---- 乱数 (mulberry32) ----
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return f;
}

// カード: {id,name,type:'unit'|'spell',cost,atk,hp,kw:[guard|haste|lifelink], fx:{t:'dmg'|'aoe'|'heal'|'draw'|'buff',n}}
export function newGame(cards, decks, rules = DEFAULT_RULES, seed = 1) {
  const R = rng(seed);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const players = [0, 1].map((i) => {
    const deck = R.shuffle(decks[i].slice());
    const hp = rules.heroHp + (i === 1 ? rules.p2Hp || 0 : 0);
    return { hp, maxHp: hp, deck, hand: [], board: [], energy: 0, maxEnergy: 0, fatigue: 0 };
  });
  const g = { cards: byId, rules, players, turn: 0, active: 0, winner: -1, rand: R, log: [], uid: 1 };
  players[1].maxEnergy = rules.p2Energy || 0;
  for (let i = 0; i < 2; i++) for (let k = 0; k < (i === 0 ? rules.startHand : rules.p2StartHand); k++) draw(g, i);
  startTurn(g);
  return g;
}

function draw(g, pi) {
  const p = g.players[pi];
  if (!p.deck.length) {
    p.fatigue++;
    damageHero(g, pi, p.fatigue);
    return;
  }
  const id = p.deck.pop();
  if (p.hand.length < MAX_HAND) p.hand.push(id);
}

function startTurn(g) {
  const p = g.players[g.active];
  g.turn++;
  p.maxEnergy = Math.min(g.rules.maxEnergy, p.maxEnergy + 1);
  p.energy = p.maxEnergy;
  for (const u of p.board) u.ready = true;
  draw(g, g.active);
}

function damageHero(g, pi, n) {
  const p = g.players[pi];
  p.hp -= n;
  if (p.hp <= 0 && g.winner < 0) g.winner = 1 - pi;
}

function sweep(g) {
  for (const p of g.players) p.board = p.board.filter((u) => u.hp > 0);
}

export function hasGuard(p) {
  return p.board.some((u) => u.kw.includes('guard'));
}

// 合法手の列挙。action: {a:'play',h,t?} {a:'atk',u,t} {a:'end'}
// t: 'face' | 数値(相手の場のインデックス) | {own:数値}(味方バフ)
export function legalActions(g) {
  const out = [];
  if (g.winner >= 0) return out;
  const me = g.players[g.active];
  const foe = g.players[1 - g.active];
  const guard = hasGuard(foe);
  me.hand.forEach((id, h) => {
    const c = g.cards.get(id);
    if (c.cost > me.energy) return;
    if (c.type === 'unit') {
      if (me.board.length < MAX_BOARD) out.push({ a: 'play', h });
    } else if (c.fx.t === 'dmg') {
      out.push({ a: 'play', h, t: 'face' });
      foe.board.forEach((_, j) => out.push({ a: 'play', h, t: j }));
    } else if (c.fx.t === 'buff') {
      me.board.forEach((_, j) => out.push({ a: 'play', h, t: { own: j } }));
    } else {
      out.push({ a: 'play', h });
    }
  });
  me.board.forEach((u, i) => {
    if (!u.ready) return;
    if (!guard) out.push({ a: 'atk', u: i, t: 'face' });
    foe.board.forEach((e, j) => {
      if (!guard || e.kw.includes('guard')) out.push({ a: 'atk', u: i, t: j });
    });
  });
  out.push({ a: 'end' });
  return out;
}

export function apply(g, act) {
  if (g.winner >= 0) return g;
  const ai = g.active;
  const me = g.players[ai];
  const foe = g.players[1 - ai];
  if (act.a === 'end') {
    g.active = 1 - ai;
    startTurn(g);
    return g;
  }
  if (act.a === 'play') {
    const id = me.hand[act.h];
    const c = g.cards.get(id);
    me.hand.splice(act.h, 1);
    me.energy -= c.cost;
    if (c.type === 'unit') {
      me.board.push({ uid: g.uid++, id, atk: c.atk, hp: c.hp, maxHp: c.hp, kw: c.kw, ready: c.kw.includes('haste') });
    } else {
      const fx = c.fx;
      if (fx.t === 'dmg') {
        if (act.t === 'face') damageHero(g, 1 - ai, fx.n);
        else foe.board[act.t].hp -= fx.n;
      } else if (fx.t === 'aoe') {
        for (const u of foe.board) u.hp -= fx.n;
      } else if (fx.t === 'heal') {
        me.hp = Math.min(me.maxHp, me.hp + fx.n);
      } else if (fx.t === 'draw') {
        for (let k = 0; k < fx.n; k++) draw(g, ai);
      } else if (fx.t === 'buff') {
        const u = me.board[act.t.own];
        u.atk += fx.n;
        u.hp += fx.n;
        u.maxHp += fx.n;
      }
    }
    sweep(g);
    return g;
  }
  if (act.a === 'atk') {
    const u = me.board[act.u];
    u.ready = false;
    if (act.t === 'face') {
      damageHero(g, 1 - ai, u.atk);
      if (u.kw.includes('lifelink')) me.hp = Math.min(me.maxHp, me.hp + u.atk);
    } else {
      const e = foe.board[act.t];
      const dealt = Math.min(u.atk, e.hp);
      const taken = Math.min(e.atk, u.hp);
      e.hp -= u.atk;
      u.hp -= e.atk;
      if (u.kw.includes('lifelink')) me.hp = Math.min(me.maxHp, me.hp + dealt);
      if (e.kw.includes('lifelink')) foe.hp = Math.min(foe.maxHp, foe.hp + taken);
    }
    sweep(g);
    return g;
  }
  return g;
}

// 軽量クローン(MCTS 用)。乱数と cards/rules は共有。
export function clone(g) {
  const cp = (p) => ({
    hp: p.hp,
    maxHp: p.maxHp,
    deck: p.deck.slice(),
    hand: p.hand.slice(),
    board: p.board.map((u) => ({ ...u })),
    energy: p.energy,
    maxEnergy: p.maxEnergy,
    fatigue: p.fatigue,
  });
  return { ...g, players: [cp(g.players[0]), cp(g.players[1])], log: [] };
}

export function describe(c) {
  if (c.type === 'unit') return `${c.atk}/${c.hp}${c.kw.length ? ' ' + c.kw.map((k) => KW_JA[k]).join('・') : ''}`;
  const n = c.fx.n;
  return { dmg: `${n}ダメージ(1体/顔)`, aoe: `敵全体に${n}ダメージ`, heal: `${n}回復`, draw: `${n}枚ドロー`, buff: `味方1体に+${n}/+${n}` }[c.fx.t];
}
export const KW_JA = { guard: '守護', haste: '速攻', lifelink: '吸血' };

// 1カードの「力」の目安(初期生成と報告に使う)
export function budget(c) {
  if (c.type === 'unit') return c.atk + c.hp + c.kw.length * 1.2;
  return { dmg: c.fx.n * 1.6, aoe: c.fx.n * 2.4, heal: c.fx.n * 0.8, draw: c.fx.n * 1.8, buff: c.fx.n * 2.2 }[c.fx.t];
}
