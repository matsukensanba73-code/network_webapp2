'use strict';
/* ===== NETWORK LAB ===== */
const $ = s => document.querySelector(s);
const get = id => S.dev.find(d => d.id === id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const key = (a, b) => [a, b].sort().join('|');

/* ---------- IPアドレス計算 ---------- */
const ipInt = s => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((s || '').trim());
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some(n => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
const maskOk = m => { const v = ipInt(m); if (v === null) return false; const inv = (~v) >>> 0; return (inv & (inv + 1)) === 0; };
const sameNet = (a, b, m) => ((ipInt(a) & ipInt(m)) >>> 0) === ((ipInt(b) & ipInt(m)) >>> 0);
const isPriv = ip => { const v = (ip || '').split('.').map(Number); return v[0] === 10 || (v[0] === 192 && v[1] === 168) || (v[0] === 172 && v[1] >= 16 && v[1] <= 31); };

/* ---------- データ構造 ---------- */
// S: mode(learn/trouble/free) idx(ミッション番号) ti(トラブル番号) dev(機器) links(接続) sel(選択中) from(接続元)
const S = { mode: 'learn', idx: 0, ti: 0, dev: [], links: [], sel: null, from: null, conn: false, hint: 0, last: null, busy: false, cleared: {}, cnt: 10 };
const M = '255.255.255.0';
const TN = { pc: 'PC', sw: 'スイッチ', rt: 'ルータ', sv: 'Webサーバ', net: 'インターネット' };
const P = (id, name, x, y, ip = '', mask = '', gw = '') => ({ id, type: 'pc', name, x, y, ip, mask, gw });
const SW = (id, name, x, y) => ({ id, type: 'sw', name, x, y });
const RT = (x, y, nat = true) => ({ id: 'rt', type: 'rt', name: 'ルータ', x, y, lan: '192.168.1.1', wan: '203.0.113.10', mask: M, nat });
const NT = (x, y) => ({ id: 'net', type: 'net', name: 'インターネット', x, y });
const SV = (x, y) => ({ id: 'sv', type: 'sv', name: 'Webサーバ', x, y, ip: '198.51.100.20' });
// PC→スイッチ→ルータ→インターネット→サーバ の標準構成（gw・nat・PCのIPを差し替え可能）
const inet = (gw, nat = true, ip = '192.168.1.10', mask = M) => ({
  dev: [P('a', 'PC-A', 10, 50, ip, mask, gw), SW('sw', 'スイッチ', 27, 50), RT(44, 50, nat), NT(67, 50), SV(88, 50)],
  links: [['a', 'sw'], ['sw', 'rt'], ['rt', 'net'], ['net', 'sv']], src: 'a', dst: 'sv'
});
const two = (ipB) => ({ dev: [P('a', 'PC-A', 12, 28, '192.168.1.10', M), P('b', 'PC-B', 12, 72, ipB, ipB ? M : ''), SW('sw', 'スイッチ', 38, 50)], links: [], src: 'a', dst: 'b' });
const G = ['IPアドレスを確認してみよう', 'デフォルトゲートウェイは同じネットワーク内にありますか？', 'ルータの設定を確認してみよう'];

/* ---------- ミッション（教師はここを編集） ---------- */
const MIS = [
  Object.assign(two(''), { t: '同じネットワークをつくろう', d: '接続モードでPC-A・PC-Bをスイッチにつなぎ、PC-BにPC-Aと同じネットワークのIPアドレスとサブネットマスクを設定して通信テスト。',
    ex: '同じネットワーク内の通信では、デフォルトゲートウェイを通らずに通信できます。', h: ['PC-A・PC-Bがスイッチと線でつながっているかな？', 'PC-BのIPアドレスとサブネットマスクは入力したかな？', 'サブネットマスクが255.255.255.0なら、192.168.1までが共通。最後の数字だけ変えよう'] }),
  Object.assign(two('192.168.2.20'), { t: 'サブネットを見極めよう', d: 'PC-Aと PC-Bは同じネットワーク？ 通信テストで確かめて、通信できるように設定を直そう。',
    ex: '192.168.1.0/24 と 192.168.2.0/24 は異なるネットワークです。', h: ['サブネットマスクを使って、どこまでがネットワークを表しているか確認してみよう。', '255.255.255.0 は最初の3つの数字がネットワーク部です。', 'PC-Bの3つ目の数字をPC-Aとそろえよう'] }),
  Object.assign(inet(''), { t: '別のネットワークへ通信しよう', d: 'PC-AからWebサーバへ通信できません。別のネットワークへ送るときに必要な設定を考えて追加しよう。',
    ex: '自分とは異なるネットワークへ通信するときは、デフォルトゲートウェイへデータを送ります。', h: ['宛先は自分と同じネットワークかな？', 'PC-Aで未設定の項目はどれ？', 'ルータのLAN側IPアドレスを確認してみよう'] }),
  Object.assign(inet('192.168.0.1'), { t: 'インターネットへ接続しよう', d: 'PC-AからWebサーバへ通信できる状態にしよう。まずPC側の設定を確認！',
    ex: 'PC・ルータ・インターネット・サーバがそれぞれ正しく設定され、つながっているので通信できます。', h: G }),
  Object.assign(inet('192.168.1.1'), { t: 'NATを確認しよう', d: 'PC-AからWebサーバへ通信テスト。ルータで送信元IPアドレスがどう変わるか観察しよう。',
    ex: 'LAN内部ではプライベートIPアドレスを使用し、インターネットへ通信するときはルータがNATによってグローバルIPアドレスへ変換します。', h: G })
];
const TRB = [
  Object.assign(inet('192.168.2.1', true, '192.168.1.20'), { t: '通信できないPC①' }),
  Object.assign(two('192.168.2.20'), { t: '通信できないPC②', links: [['a', 'sw'], ['b', 'sw']] }),
  Object.assign(inet('192.168.1.1', false), { t: '通信できないPC③' })
];
const FREE = { t: '自由構築', d: '機器を追加・接続・設定して、自由にネットワークをつくろう。', dev: [P('a', 'PC-A', 10, 28), P('b', 'PC-B', 10, 72), SW('sw', 'スイッチ', 27, 50), RT(44, 50), NT(67, 50), SV(88, 50)], links: [], src: 'a', dst: 'sv' };
const REASON = {
  ip: 'IPアドレスまたはサブネットマスクが未設定、または形式が正しくありません。', gw0: '別のネットワークへ送るのにデフォルトゲートウェイが未設定です。',
  gwnet: 'デフォルトゲートウェイが自分と同じネットワークにありません。', gwnone: 'そのアドレスをLAN側に持つルータがありません。',
  cable: '機器が線でつながっていない箇所があります。', cable2: 'ルータからインターネット・宛先までの線がつながっていません。',
  rtmask: 'ルータのLAN側設定がPCと同じネットワークになっていません。', wan: 'ルータのWAN側IPアドレスが未設定です。',
  nat: 'ルータのNATがOFFです。プライベートIPのままではインターネットへ出られません。', sel: '通信元と通信先を選んでください。'
};
const TERMS = [['IPアドレス', 'ネットワーク上の住所'], ['サブネットマスク', 'ネットワーク部を示し、同じネットワークか判断する'], ['デフォルトゲートウェイ', '別のネットワークへ出るときにデータを渡す相手'],
  ['プライベートIP', 'LAN内で使うアドレス（192.168.x.xなど）'], ['グローバルIP', 'インターネット上で使うアドレス'], ['NAT', 'ルータが送信元のプライベートIPをグローバルIPへ変換する仕組み']];

/* ---------- 通信判定ロジック ---------- */
// a→b へ、allowed の種類の機器だけを経由して到達できる経路を探す（幅優先探索）
function route(a, b, allowed) {
  const q = [[a]], seen = new Set([a]);
  while (q.length) {
    const p = q.shift(), cur = p[p.length - 1];
    if (cur === b) return p;
    S.links.forEach(([x, y]) => {
      const n = x === cur ? y : y === cur ? x : null;
      if (n && !seen.has(n) && (n === b || allowed.includes(get(n).type))) { seen.add(n); q.push(p.concat(n)); }
    });
  }
  return null;
}
function sim(a, b) {
  const s = get(a), d = get(b), r = { ok: false, path: [a], nat: null, code: '', why: '', s: s && s.ip, d: d && d.ip };
  if (!s || !d || a === b) { r.code = 'sel'; return r; }
  if (ipInt(s.ip) === null || !maskOk(s.mask) || ipInt(d.ip) === null) { r.code = 'ip'; return r; }
  if (sameNet(s.ip, d.ip, s.mask)) {                       // ① 同じネットワーク：ルータを通らない
    if (d.type === 'pc' && !(maskOk(d.mask) && sameNet(d.ip, s.ip, d.mask))) { r.code = 'ip'; return r; }
    const p = route(a, b, ['sw']);
    if (!p) { r.code = 'cable'; return r; }
    r.path = p; r.ok = true;
    r.why = `${s.name}と${d.name}はサブネットマスク${s.mask}で同じネットワークに属しているため、デフォルトゲートウェイを通らずに直接通信できました。`;
    return r;
  }
  const g = (s.gw || '').trim();                            // ② 別のネットワーク：ゲートウェイ経由
  if (ipInt(g) === null) { r.code = 'gw0'; return r; }
  if (!sameNet(s.ip, g, s.mask)) { r.code = 'gwnet'; return r; }
  const rt = S.dev.find(x => x.type === 'rt' && (x.lan || '').trim() === g);
  if (!rt) { r.code = 'gwnone'; return r; }
  const p1 = route(a, rt.id, ['sw']);
  if (!p1) { r.code = 'cable'; return r; }
  r.path = p1;
  if (!maskOk(rt.mask) || !sameNet(s.ip, rt.lan, rt.mask)) { r.code = 'rtmask'; return r; }
  if (ipInt(rt.wan) === null) { r.code = 'wan'; return r; }
  const p2 = route(rt.id, b, ['net', 'rt']);
  if (!p2) { r.code = 'cable2'; return r; }
  if (isPriv(s.ip) && !isPriv(d.ip)) {                      // ③ インターネット：NATが必要
    if (!rt.nat) { r.code = 'nat'; return r; }
    r.nat = { rt: rt.id, from: s.ip, to: rt.wan };
  }
  r.path = p1.concat(p2.slice(1)); r.ok = true;
  r.why = `宛先${d.ip}は別のネットワークなので、デフォルトゲートウェイ${g}（ルータ）へ送り、ルータが宛先へ転送しました。` +
    (r.nat ? `さらにルータがNATで送信元をプライベートIP ${r.nat.from} からグローバルIP ${r.nat.to} に変換したため、インターネットへ通信できました。` : '');
  return r;
}

/* ---------- 描画 ---------- */
const svg = p => `<svg viewBox="0 0 48 48">${p}</svg>`;
const ICON = {
  pc: svg('<rect x="7" y="9" width="34" height="22" rx="3"/><path d="M17 40h14M24 31v9"/>'),
  sw: svg('<rect x="5" y="16" width="38" height="16" rx="3"/><path d="M12 24h.01M19 24h.01M26 24h.01M33 24h.01"/>'),
  rt: svg('<rect x="6" y="25" width="36" height="12" rx="3"/><path d="M14 25 10 11M34 25l4-14M14 31h.01M21 31h.01"/>'),
  sv: svg('<rect x="9" y="7" width="30" height="14" rx="3"/><rect x="9" y="27" width="30" height="14" rx="3"/><path d="M15 14h.01M15 34h.01"/>'),
  net: svg('<path d="M14 36a8 8 0 0 1-1-16A11 11 0 0 1 34 17a9.500 9.500 0 0 1 1 19z"/>')
};
const badge = (t, v) => `<code class="${v ? '' : 'un'}">${t}${esc(v || '未設定')}</code>`;
const lab = d => d.type === 'pc' || d.type === 'sv' ? badge('', d.ip) : d.type === 'rt' ? badge('LAN ', d.lan) + '<br>' + badge('WAN ', d.wan) : '';
const cur = () => S.mode === 'learn' ? MIS[S.idx] : S.mode === 'trouble' ? TRB[S.ti] : FREE;

function drawCanvas() {
  $('#cv').innerHTML = '<i class="zone l">LOCAL NETWORK</i><i class="zone r">INTERNET</i><svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">' +
    S.links.map(([a, b]) => { const A = get(a), B = get(b); return `<line data-k="${key(a, b)}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`; }).join('') + '</svg>' +
    S.dev.map(d => `<div class="dev${d.id === S.sel ? ' sel' : ''}${d.id === S.from ? ' from' : ''}" data-id="${d.id}" style="left:${d.x}%;top:${d.y}%"><div class="ic">${ICON[d.type]}</div><b>${esc(d.name)}</b>${lab(d)}</div>`).join('');
}
function drawPanel() {
  const d = get(S.sel), p = $('#panel');
  if (!d) { p.innerHTML = '<h3>設定パネル</h3><p class="mute">中央の機器をクリックすると、ここで設定を変更できます。</p>'; return; }
  const F = (k, l) => `<label>${l}<input data-k="${k}" value="${esc(d[k])}" placeholder="未設定"></label>`;
  let f = F('name', d.type === 'sv' ? 'サーバ名' : 'デバイス名');
  if (d.type === 'pc') f += F('ip', 'IPv4アドレス') + F('mask', 'サブネットマスク') + F('gw', 'デフォルトゲートウェイ');
  if (d.type === 'rt') f += F('lan', 'LAN側IPアドレス') + F('wan', 'WAN側IPアドレス') + F('mask', 'サブネットマスク') + `<label class="chk"><input type="checkbox" data-k="nat" ${d.nat ? 'checked' : ''}>NATを有効にする</label>`;
  if (d.type === 'sv') f += F('ip', 'IPアドレス');
  p.innerHTML = `<h3>${TN[d.type]}の設定</h3>${f}<button class="pri" id="apply">適用</button><button id="del">機器を削除</button>`;
}
function drawSel() {
  const o = S.dev.filter(d => d.type === 'pc' || d.type === 'sv').map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  ['src', 'dst'].forEach(k => { const e = $('#' + k), v = e.value; e.innerHTML = o; if (v && get(v)) e.value = v; });
}
function drawMission() {
  const m = $('#mission'), sc = cur();
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
  if (S.mode === 'learn') {
    const n = Object.keys(S.cleared).length;
    m.innerHTML = `<div class="mh"><span class="tag">MISSION ${S.idx + 1} / ${MIS.length}</span><div class="prog"><i style="width:${n / MIS.length * 100}%"></i></div><span class="mute">${S.cleared[S.idx] ? '✓ クリア' : ''}</span></div><h2>${sc.t}</h2><p>${sc.d}</p>
    <div class="mb"><button data-a="prev">前のMISSIONへ</button><button data-a="next" class="pri">${S.idx === MIS.length - 1 ? 'まとめへ' : '次のMISSIONへ'}</button><button data-a="reset">ミッションをリセット</button><button data-a="all">最初からやり直す</button></div>`;
  } else if (S.mode === 'trouble') {
    m.innerHTML = `<div class="mh"><span class="tag">TROUBLESHOOTING</span></div><h2>${sc.t}</h2><p>通信テストをして、原因を探して直そう。</p><div class="mb">${TRB.map((x, i) => `<button data-a="t${i}" class="${i === S.ti ? 'on' : ''}">問題${i + 1}</button>`).join('')}<button data-a="reset">やり直す</button></div>`;
  } else {
    m.innerHTML = `<div class="mh"><span class="tag">FREE BUILD</span></div><h2>${sc.t}</h2><p>${sc.d}</p><div class="mb"><button data-a="reset">最初の配置に戻す</button></div>`;
  }
}
function drawAll() { drawMission(); drawCanvas(); drawPanel(); drawSel(); }

function load() {
  const sc = cur();
  S.dev = JSON.parse(JSON.stringify(sc.dev)); S.links = sc.links.map(l => l.slice());
  S.sel = null; S.from = null; S.hint = 0; S.last = null; S.conn = false;
  $('#conn').textContent = '接続モード：OFF'; $('#res').innerHTML = ''; $('#hb').innerHTML = '';
  drawAll();
  if (get(sc.src)) $('#src').value = sc.src; if (get(sc.dst)) $('#dst').value = sc.dst;
}

/* ---------- 操作 ---------- */
function pick(id) {
  if (S.conn) {
    if (!S.from) S.from = id;
    else if (S.from !== id) {
      const k = key(S.from, id), i = S.links.findIndex(l => key(l[0], l[1]) === k);
      if (i >= 0) S.links.splice(i, 1); else S.links.push([S.from, id]);
      S.from = null;
    } else S.from = null;
    drawCanvas(); return;
  }
  S.sel = id; drawCanvas(); drawPanel();
}
$('#cv').addEventListener('pointerdown', e => {
  const el = e.target.closest('.dev'); if (!el || S.busy) return;
  const d = get(el.dataset.id), r = $('#cv').getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY; let moved = false;
  const mv = ev => {
    if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 6 && !moved) return;
    moved = true; d.x = Math.min(94, Math.max(6, (ev.clientX - r.left) / r.width * 100)); d.y = Math.min(86, Math.max(14, (ev.clientY - r.top) / r.height * 100)); drawCanvas();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved) pick(d.id); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
$('#panel').addEventListener('click', e => {
  const d = get(S.sel);
  if (e.target.id === 'apply' && d) {
    document.querySelectorAll('#panel [data-k]').forEach(i => { d[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
    drawAll(); toast('設定を適用しました');
  }
  if (e.target.id === 'del' && d) { S.dev = S.dev.filter(x => x !== d); S.links = S.links.filter(l => !l.includes(d.id)); S.sel = null; drawAll(); }
});
function toast(t) { $('#res').innerHTML = `<span class="pill ok">✓ ${t}</span>`; }
$('#pal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'conn') { S.conn = !S.conn; S.from = null; b.textContent = '接続モード：' + (S.conn ? 'ON' : 'OFF'); b.classList.toggle('on', S.conn); drawCanvas(); return; }
  const t = b.dataset.t, n = S.dev.filter(d => d.type === t).length;
  if (t === 'net' && n) { toast('インターネットは1つだけです'); return; }
  const id = 'd' + (++S.cnt), x = t === 'net' || t === 'sv' ? 60 + Math.random() * 30 : t === 'rt' ? 40 + Math.random() * 10 : 8 + Math.random() * 30, y = 20 + Math.random() * 60;
  const d = { id, type: t, name: t === 'pc' ? 'PC-' + String.fromCharCode(65 + n) : TN[t] + (n ? n + 1 : ''), x, y };
  if (t === 'pc') Object.assign(d, { ip: '', mask: '', gw: '' });
  if (t === 'sv') d.ip = '';
  if (t === 'rt') Object.assign(d, { lan: '', wan: '', mask: M, nat: true });
  S.dev.push(d); S.sel = id; drawAll();
});
$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !S.busy) { S.mode = b.dataset.m; load(); } });
$('#mission').addEventListener('click', e => {
  const a = e.target.dataset.a; if (!a || S.busy) return;
  if (a === 'prev' && S.idx > 0) S.idx--;
  if (a === 'next') { if (S.idx < MIS.length - 1) S.idx++; else { fin(); return; } }
  if (a === 'all') { S.idx = 0; S.cleared = {}; }
  if (a[0] === 't') S.ti = +a.slice(1);
  load();
});

/* ---------- 通信テストとアニメーション ---------- */
const ph = (s, d) => `<small>SRC</small><code>${esc(s)}</code><small>DST</small><code>${esc(d)}</code>`;
async function play(r) {
  const cv = $('#cv'), pk = document.createElement('div'), pos = d => { pk.style.left = d.x + '%'; pk.style.top = d.y + '%'; };
  S.busy = true; pk.className = 'pkt'; pk.innerHTML = ph(r.s, r.d); pk.style.transition = 'none'; pos(get(r.path[0])); cv.appendChild(pk);
  await sleep(900); pk.style.transition = '';
  for (let i = 1; i < r.path.length; i++) {
    const a = get(r.path[i - 1]), b = get(r.path[i]), ln = cv.querySelector(`line[data-k="${key(a.id, b.id)}"]`);
    if (ln) ln.classList.add('act');
    pos(b); await sleep(850);
    if (r.nat && b.id === r.nat.rt) await natShow(r, pk);      // ルータ到着で一時停止してNATを表示
  }
  if (!r.ok) pk.classList.add('bad');
  await sleep(1000); pk.remove(); cv.querySelectorAll('.act').forEach(l => l.classList.remove('act')); S.busy = false;
}
async function natShow(r, pk) {
  const o = document.createElement('div'); o.className = 'natbox';
  o.innerHTML = `<h4>NAT：送信元IPアドレスの変換</h4><div class="nrow"><div><small>Before</small><small>SRC</small><code>${r.nat.from}</code></div><span>→ NAT →</span><div class="af"><small>After</small><small>SRC</small><code class="chg">${r.nat.to}</code></div></div><p>DST（宛先）は同じ。SRC（送信元）だけが書き換わります。</p>`;
  $('#cv').appendChild(o); await sleep(3000);
  pk.innerHTML = ph(r.nat.to, r.d); pk.classList.add('flash'); o.remove(); await sleep(700);
}
function showRes(r) {
  const el = $('#res'), sc = cur();
  if (r.ok) {
    if (S.mode === 'learn') { S.cleared[S.idx] = 1; drawMission(); }
    el.innerHTML = `<span class="pill ok">✓ 通信成功！</span><p>${r.why}${S.mode === 'learn' ? '<br><b>まとめ：</b>' + sc.ex : ''}</p>`;
    if (S.mode === 'learn' && Object.keys(S.cleared).length === MIS.length) setTimeout(fin, 2500);
  } else if (r.code === 'sel') el.innerHTML = `<span class="pill ng">確認</span><p>${REASON.sel}</p>`;
  else el.innerHTML = `<span class="pill ng">✕ 通信失敗</span><p>${S.mode === 'trouble' ? '設定ミスがあります。' : '通信できませんでした。設定を確認してみましょう。'}どこに問題がありそうか考えてみよう。</p>`;
}
async function test(replay) {
  if (S.busy) return;
  const r = replay && S.last ? S.last : sim($('#src').value, $('#dst').value);
  S.last = r;
  if (r.code === 'sel') { showRes(r); return; }
  if (!replay) $('#res').innerHTML = '';
  await play(r);
  if (!replay) showRes(r);
}
$('#go').onclick = () => test(false);
$('#again').onclick = () => test(true);
$('#hint').onclick = () => {                                   // ヒントは段階的に表示。最後に原因の手がかり
  const hs = cur().h || G, n = S.hint++;
  const t = n < hs.length ? hs[n] : (S.last && REASON[S.last.code]) || 'もう一度通信テストをして、どこで止まるか見てみよう。';
  $('#hb').insertAdjacentHTML('beforeend', `<div><b>ヒント${n + 1}：</b>${t}</div>`);
};

/* ---------- 最終まとめ ---------- */
function fin() {
  const f = $('#fin'); f.hidden = false;
  f.innerHTML = `<div class="card"><h2>NETWORK COMPLETE</h2><ul>${TERMS.map(([a, b]) => `<li><code>${a}</code>${b}</li>`).join('')}</ul><p class="q">自分のPCからWebサーバまで、どのように通信したか説明してみよう。</p><button class="pri" id="fc">閉じる</button></div>`;
  $('#fc').onclick = () => { f.hidden = true; };
}

load();
