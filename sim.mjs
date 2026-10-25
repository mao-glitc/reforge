// 自己対戦シミュレータ。デッキ構築・1試合・多数試合の集計。
import { newGame, apply, rng } from './engine.mjs';

// bias<0 → 低コスト寄り(アグロ)、bias>0 → 高コスト寄り(コントロール)
export function buildDeck(cards, rules, R, bias = 0) {
  const w = cards.map((c) => Math.exp(-bias * (c.cost - 4) * 0.5));
  const count = new Map();
  const deck = [];
  let guard = 0;
  while (deck.length < rules.deckSize && guard++ < 5000) {
    let r = R() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < w.length - 1 && (r -= w[i]) > 0) i++;
    const id = cards[i].id;
    if ((count.get(id) || 0) >= rules.copies) continue;
    count.set(id, (count.get(id) || 0) + 1);
    deck.push(id);
  }
  return deck;
}

export function playGame(cards, rules, bots, decks, seed) {
  const g = newGame(cards, decks, rules, seed);
  const R = rng(seed ^ 0x9e3779b9);
  const played = [new Set(), new Set()];
  let guard = 0;
  while (g.winner < 0 && guard++ < 4000) {
    const act = bots[g.active](g, R);
    if (act.a === 'play') played[g.active].add(g.players[g.active].hand[act.h]);
    apply(g, act);
    if (g.turn > 80) {
      g.winner = g.players[0].hp >= g.players[1].hp ? 0 : 1;
    }
  }
  return { winner: g.winner < 0 ? 0 : g.winner, turns: g.turn, played, hp: [g.players[0].hp, g.players[1].hp] };
}

// 同じデッキ組を席を入れ替えて2戦。
// botA/botB: bot 関数, mkA/mkB: デッキ bias を返す関数
export function runMatches({ cards, rules, botA, botB, pairs, seed, biasA = null, biasB = null }) {
  const R = rng(seed);
  const stat = new Map(cards.map((c) => [c.id, { inW: 0, inN: 0, plW: 0, plN: 0 }]));
  let aWins = 0;
  let games = 0;
  let firstWins = 0;
  let turns = 0;
  const bucket = { low: [0, 0], mid: [0, 0], high: [0, 0] };
  for (let k = 0; k < pairs; k++) {
    const bA = biasA ?? R() * 2 - 1;
    const bB = biasB ?? R() * 2 - 1;
    const dA = buildDeck(cards, rules, R, bA);
    const dB = buildDeck(cards, rules, R, bB);
    for (const swap of [false, true]) {
      const s = (R() * 4294967296) >>> 0;
      const bots = swap ? [botB, botA] : [botA, botB];
      const decks = swap ? [dB, dA] : [dA, dB];
      const res = playGame(cards, rules, bots, decks, s);
      const aSeat = swap ? 1 : 0;
      const aWon = res.winner === aSeat;
      games++;
      aWins += aWon;
      firstWins += res.winner === 0;
      turns += res.turns;
      for (const [seat, deck, bias] of [[aSeat, dA, bA], [1 - aSeat, dB, bB]]) {
        const won = res.winner === seat;
        const b = bias < -0.33 ? bucket.low : bias > 0.33 ? bucket.high : bucket.mid;
        b[0] += won;
        b[1]++;
        for (const id of new Set(deck)) {
          const st = stat.get(id);
          st.inN++;
          st.inW += won;
          if (res.played[seat].has(id)) {
            st.plN++;
            st.plW += won;
          }
        }
      }
    }
  }
  return {
    games,
    aWinRate: aWins / games,
    firstWinRate: firstWins / games,
    avgTurns: turns / games / 2, // 1人あたりのターン数
    stat,
    curve: { low: bucket.low[0] / (bucket.low[1] || 1), mid: bucket.mid[0] / (bucket.mid[1] || 1), high: bucket.high[0] / (bucket.high[1] || 1) },
  };
}
