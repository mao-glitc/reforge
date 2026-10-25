// AIプレイヤー。重み付きヒューリスティック(Policy)と、ランダム。ブラウザの対戦相手もこれ。
import { legalActions } from './engine.mjs';

// 重みの意味: face=顔面への殴り, trade=相手を倒す価値, keep=自分が死ぬ痛み, develop=場に出す価値,
// burn=顔面火力, removal=除去の価値, heal=回復, draw=ドロー
export const POLICY_KEYS = ['face', 'trade', 'keep', 'develop', 'burn', 'removal', 'heal', 'draw'];

export const ARCHETYPES = {
  aggro: { face: 2.4, trade: 0.5, keep: 0.2, develop: 1.2, burn: 1.8, removal: 0.4, heal: 0.2, draw: 0.5 },
  control: { face: 0.5, trade: 1.6, keep: 1.0, develop: 0.8, burn: 0.3, removal: 1.6, heal: 0.9, draw: 1.2 },
  midrange: { face: 1.2, trade: 1.0, keep: 0.6, develop: 1.0, burn: 0.9, removal: 1.0, heal: 0.5, draw: 0.9 },
};

const val = (g, u) => u.atk + u.hp + (u.kw.length ? 1.2 : 0);

export function scoreAction(g, act, w) {
  const me = g.players[g.active];
  const foe = g.players[1 - g.active];
  if (act.a === 'end') return 0;
  if (act.a === 'play') {
    const id = me.hand[act.h];
    const c = g.cards.get(id);
    if (c.type === 'unit') return 0.5 + w.develop * (c.atk + c.hp + c.kw.length * 1.2) * 0.4 + c.cost * 0.3;
    const n = c.fx.n;
    switch (c.fx.t) {
      case 'dmg':
        if (act.t === 'face') return n >= foe.hp ? 1e4 : w.burn * n * 0.6 - c.cost * 0.15;
        {
          const e = foe.board[act.t];
          return n >= e.hp ? w.removal * val(g, e) * 0.7 - c.cost * 0.1 : -1;
        }
      case 'aoe': {
        let s = 0;
        for (const e of foe.board) if (n >= e.hp) s += val(g, e);
        return s ? w.removal * s * 0.7 - c.cost * 0.1 : -1;
      }
      case 'heal': {
        const miss = me.maxHp - me.hp;
        return miss >= n * 0.6 ? w.heal * Math.min(n, miss) * 0.5 * (1 + (miss > 10 ? 1 : 0)) : -1;
      }
      case 'draw':
        return me.hand.length < 6 ? w.draw * n * 1.2 : -1;
      case 'buff':
        return me.board.length ? w.develop * n * 1.5 + (me.board[act.t.own].ready ? 0.8 : 0) : -1;
    }
    return 0;
  }
  // 攻撃
  const u = me.board[act.u];
  if (act.t === 'face') return u.atk >= foe.hp ? 1e4 : w.face * u.atk * 0.8 + 0.2;
  const e = foe.board[act.t];
  const kills = u.atk >= e.hp;
  const dies = e.atk >= u.hp;
  let s = 0;
  if (kills) s += w.trade * val(g, e);
  if (dies) s -= w.keep * val(g, u);
  if (e.kw.includes('guard')) s += 0.8;
  if (!kills && !dies) s -= 0.5;
  return s;
}

export function policyBot(w) {
  return (g, R) => {
    const acts = legalActions(g);
    let best = null;
    let bs = 0.01;
    for (const a of acts) {
      const s = scoreAction(g, a, w) + R() * 0.001;
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    return best || { a: 'end' };
  };
}

export const randomBot = (g, R) => {
  const acts = legalActions(g);
  return R() < 0.15 ? { a: 'end' } : acts[R.int(acts.length)];
};
