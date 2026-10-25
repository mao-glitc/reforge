// 公開用ビルド: dist/ に静的ファイルを集め、README 用の推移グラフ docs/progress.svg を作る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(fs.readFileSync(path.join(here, 'data/history.json'), 'utf8'));

// dist
const dist = path.join(here, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of ['engine.mjs', 'bots.mjs', 'sim.mjs']) fs.copyFileSync(path.join(here, f), path.join(dist, f));
fs.copyFileSync(path.join(here, 'web/data.js'), path.join(dist, 'data.js'));
fs.writeFileSync(path.join(dist, 'index.html'), fs.readFileSync(path.join(here, 'web/index.html'), 'utf8').replaceAll("'../", "'./"));

// グラフ
const H = d.history;
const W = 860, Ht = 280, L = 48, R = 20, T = 36, B = 34;
const maxY = 0.1;
const x = (i) => L + (i / (H.length - 1)) * (W - L - R);
const y = (v) => Ht - B - (Math.min(v, maxY) / maxY) * (Ht - T - B);
const line = (f, col) => `<polyline fill="none" stroke="${col}" stroke-width="2" points="${H.map((h, i) => `${x(i).toFixed(1)},${y(f(h)).toFixed(1)}`).join(' ')}"/>`;
const grid = [0, 0.025, 0.05, 0.075, 0.1].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#d0d5e0"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${(v * 100).toFixed(1)}%</text>`).join('');
const xt = [1, 25, 50, 75, 100].map((i) => `<text x="${x(i - 1)}" y="${Ht - 12}" text-anchor="middle">${i}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" font-family="system-ui,sans-serif" font-size="12">
<rect width="${W}" height="${Ht}" fill="#fff"/><style>text{fill:#555}</style>
<text x="${L}" y="20" style="font-size:14px;font-weight:700;fill:#111">100周の作り直しでバランスの偏りはどう減ったか</text>
${grid}${xt}
${line((h) => h.metrics.maxDev, '#e08a00')}${line((h) => h.metrics.meanAbsDev, '#2a7de1')}${line((h) => Math.abs(h.metrics.firstWin - 0.5), '#1f9d62')}
<g transform="translate(${W - 330},20)"><rect width="10" height="10" y="-9" fill="#e08a00"/><text x="14">最大偏差</text><rect x="80" width="10" height="10" y="-9" fill="#2a7de1"/><text x="94">平均偏差</text><rect x="160" width="10" height="10" y="-9" fill="#1f9d62"/><text x="174">先手有利度（|先手勝率−50%|）</text></g>
</svg>
`;
fs.mkdirSync(path.join(here, 'docs'), { recursive: true });
fs.writeFileSync(path.join(here, 'docs/progress.svg'), svg);
console.log('built dist/ and docs/progress.svg');
