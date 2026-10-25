// 初版カードプール(60枚)の生成。わざと「素朴な式＋ノイズ」で作るので、最初は壊れている。
import { rng } from './engine.mjs';

const UNIT_NAMES = [
  '灯火の見習い', '霧の斥候', '鉄の番人', '琥珀の狼', '星屑の工兵', '硝子の騎士', '苔むす巨人', '月影の射手',
  '砂時計の僧', '雷鳴の獅子', '錆びた砲手', '紅蓮の舞姫', '深海の語り部', '白銀の槍兵', '嵐を呼ぶ鴉', '古城の亡霊',
  '蒼穹の飛竜', '歯車の司祭', '黄昏の剣闘士', '氷原の旅人', '双尾の狐', '黒曜の守衛', '花咲く機関', '終末の鐘守',
  '雲渡りの商人', '地底の採掘者', '祈りの砲台', '漂流する灯台', '燃える図書館', '時計塔の番犬', '虹色の蜘蛛', '潮騒の剣士',
  '眠れる火山', '遺跡の機兵', '風読みの猟師', '凍てつく女王', '甲冑の蟻群', '夜明けの伝令', '無貌の影', '大樹の古老',
];
const SPELL_NAMES = [
  '火花', '雷撃', '星落とし', '炎の波', '癒しの雨', '薬草茶', '知恵の泉', '古書の囁き', '鍛錬の光', '祝福の鐘',
  '氷の楔', '烈風', '大地の怒り', '月光の包帯', '賢者の閃き', '鋼の誓い', '焦土の号令', '閃光弾', '黄金の算盤', '終焉の彗星',
];

const PICK_KW = ['guard', 'haste', 'lifelink'];

export function initialCards(seed = 2026) {
  const R = rng(seed);
  const cards = [];
  let n = 0;
  UNIT_NAMES.forEach((name, i) => {
    const cost = 1 + (i % 8); // 1..8 を均等に
    const kw = [];
    if (R() < 0.35) kw.push(R.pick(PICK_KW));
    // 素朴な式: 予算 = 2*cost + 1 ＋ ノイズ。キーワードの価値は無視して作る(→強すぎ/弱すぎが生まれる)
    const total = Math.max(2, 2 * cost + 1 + R.int(5) - 2);
    const atk = Math.max(0, Math.min(total - 1, Math.round(total * (0.35 + R() * 0.3))));
    cards.push({ id: `u${++n}`, name, type: 'unit', cost, atk, hp: total - atk, kw });
  });
  const FX = [
    ['dmg', 2, 1], ['dmg', 3, 2], ['dmg', 5, 4], ['aoe', 2, 4], ['heal', 4, 1], ['heal', 6, 2],
    ['draw', 2, 2], ['draw', 1, 1], ['buff', 2, 3], ['buff', 1, 1], ['dmg', 4, 3], ['aoe', 1, 2],
    ['draw', 3, 5], ['buff', 3, 5], ['dmg', 6, 5], ['aoe', 3, 6], ['heal', 8, 4], ['dmg', 1, 1], ['draw', 2, 3], ['dmg', 8, 7],
  ];
  SPELL_NAMES.forEach((name, i) => {
    const [t, v, cost] = FX[i];
    cards.push({ id: `s${i + 1}`, name, type: 'spell', cost, fx: { t, n: v }, kw: [] });
  });
  return cards;
}
