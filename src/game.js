// ============================================================================
// Match des Saisons - moteur du jeu.
// Deux couches : un noyau logique pur (grille/objectifs/gravité), utilisable en
// mode "headless" pour simuler et équilibrer les niveaux (window.GAME.__debug.balance),
// et une couche rendu DOM (tuiles absolues, gelée, cageots, FX, sons).
// ============================================================================
(function () {
  "use strict";

  var AVATARS = window.AVATARS || {};
  var LEVELS = window.LEVELS || null;
  var ROWS = 8, COLS = 8, GUTTER = 3;
  var META_KEY = "saga";

  var BOOSTERS = [
    { key: "hammer", label: "Marteau", ico: "\uD83D\uDD28", hint: "Casse une pièce (et la gelée dessous)" },
    { key: "shuffle", label: "Mélanger", ico: "\uD83D\uDD00", hint: "Rebat toutes les pièces" },
    { key: "moves", label: "5 coups", ico: "\u23F1", hint: "Gagne 5 coups pour ce niveau" }
  ];
  var CHEERS = ["Miam !", "Délicieux !", "Savoureux !", "Succulent !", "Gourmand !", "Régal !", "Divin !"];
  var CHEERS_BIG = ["Formidable !", "Cueillette parfaite !", "Incroyable !"];
  var CONF_COLORS = ["#ffd93d", "#ff8c42", "#ff5e7e", "#8cc96b", "#4dc3ff", "#b06bff", "#ffffff"];

  var $id = function (id) { return document.getElementById(id); };
  function boardEl() { return $id("board"); }
  function layerEl(id) { return $id(id); }
  function wait(ms) { if (G && G.headless) return Promise.resolve(); return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ------------------------------------------------------------------ etat
  var G = null;          // niveau en cours
  var els = {};          // tile.id -> élément DOM
  var cellEls = {};      // "r,c" -> { jelly, block }
  var floorEls = {};     // "r,c" -> element de fond
  var META = null;       // progression persistée
  var view = "map";      // "map" | "play"
  var armed = null;      // booster armé
  var targetEls = [];
  var hintEls = [], hintTimer = null;
  var drag = null;
  var pendingReload = false;

  function isBlocked(r, c) { var k = G.cells[r][c]; return k.v === 1 || k.b > 0; }
  function randType() { return G.types[Math.floor(Math.random() * G.types.length)]; }
  function sameType(a, b) { return !!(a && b && a.type === b.type); }
  function key(r, c) { return r + "," + c; }
  function coords(k) { var p = k.split(","); return { r: +p[0], c: +p[1] }; }

  // =====================================================================
  // 1. Progression (kv-plugin, repli localStorage)
  // =====================================================================
  function freshMeta() {
    return { stars: {}, boosters: { hammer: 3, shuffle: 3, moves: 3 }, best: 0, plays: 0 };
  }
  function normMeta(m) {
    if (!m || typeof m !== "object") m = freshMeta();
    if (!m.stars || typeof m.stars !== "object") m.stars = {};
    m.boosters = m.boosters || {};
    m.boosters.hammer = m.boosters.hammer == null ? 3 : m.boosters.hammer;
    m.boosters.shuffle = m.boosters.shuffle == null ? 3 : m.boosters.shuffle;
    m.boosters.moves = m.boosters.moves == null ? 3 : m.boosters.moves;
    if (m.best == null) m.best = 0;
    if (m.plays == null) m.plays = 0;
    return m;
  }
  function readLocal() {
    try { return JSON.parse(localStorage.getItem("saga_meta") || "null"); } catch (e) { return null; }
  }
  function writeLocal(m) {
    try { localStorage.setItem("saga_meta", JSON.stringify(m)); } catch (e) { /* ignore */ }
  }
  function loadMeta() {
    if (META) return Promise.resolve(META);
    META = normMeta(readLocal());
    var done = false;
    return Promise.resolve().then(function () {
      if (!(window.root && window.root.kv)) return null;
      return window.root.kv.saga.get(META_KEY);
    }).then(function (stored) {
      done = true;
      if (stored && stored.stars) META = normMeta(stored);
      return META;
    }).catch(function () { return META; });
  }
  var saveTimer = null;
  function saveMeta() {
    if (!META) return;
    writeLocal(META);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { if (window.root && window.root.kv) window.root.kv.saga.set(META_KEY, META); } catch (e) { /* ignore */ }
    }, 150);
  }
  function totalStars() {
    var s = 0;
    for (var n = 1; n <= LEVELS.total; n++) s += (META.stars[n] || 0);
    return s;
  }
  function completedCount() {
    var s = 0;
    for (var n = 1; n <= LEVELS.total; n++) if ((META.stars[n] || 0) > 0) s++;
    return s;
  }
  function isUnlocked(n) { return n === 1 || (META.stars[n - 1] || 0) > 0; }
  function currentLevel() {
    for (var n = 1; n <= LEVELS.total; n++) if (isUnlocked(n) && !(META.stars[n] > 0)) return n;
    return LEVELS.total;
  }
  function starsFor(score, def) {
    if (score >= def.stars[2]) return 3;
    if (score >= def.stars[1]) return 2;
    if (score >= def.stars[0]) return 1;
    return 0;
  }

  // =====================================================================
  // 2. Noyau logique (aucun DOM)
  // =====================================================================
  function findMatches(grid) {
    var runs = [];
    var r, c, e;
    for (r = 0; r < ROWS; r++) {
      c = 0;
      while (c < COLS) {
        e = c + 1;
        while (e < COLS && sameType(grid[r][c], grid[r][e])) e++;
        if (e - c >= 3) runs.push({ dir: "h", r: r, c: c, len: e - c, type: grid[r][c].type });
        c = e;
      }
    }
    for (c = 0; c < COLS; c++) {
      r = 0;
      while (r < ROWS) {
        e = r + 1;
        while (e < ROWS && sameType(grid[r][c], grid[e][c])) e++;
        if (e - r >= 3) runs.push({ dir: "v", r: r, c: c, len: e - r, type: grid[r][c].type });
        r = e;
      }
    }
    return runs;
  }

  function runCells(run) {
    var s = new Set(), i;
    for (i = 0; i < run.len; i++) {
      if (run.dir === "h") s.add(run.r + "," + (run.c + i));
      else s.add((run.r + i) + "," + run.c);
    }
    return s;
  }

  function processRuns(runs, grid) {
    var clear = new Set();
    var specials = new Map();
    var cellSets = runs.map(runCells);
    var rainbowAt = new Set();
    var i, j, k;
    for (i = 0; i < runs.length; i++) {
      for (j = i + 1; j < runs.length; j++) {
        if (runs[i].dir === runs[j].dir) continue;
        var shared = null;
        for (k of cellSets[i]) if (cellSets[j].has(k)) { shared = k; break; }
        if (!shared) continue;
        var union = new Set(cellSets[i]);
        for (k of cellSets[j]) union.add(k);
        if (union.size >= 5) rainbowAt.add(shared);
      }
    }
    for (i = 0; i < runs.length; i++) {
      var run = runs[i];
      var sp = null, sr = null, sc = null;
      for (k of cellSets[i]) {
        if (rainbowAt.has(k)) { sp = "rainbow"; var q = coords(k); sr = q.r; sc = q.c; break; }
      }
      if (!sp) {
        if (run.len >= 5) sp = "wrapped";
        else if (run.len === 4) sp = run.dir === "h" ? "h" : "v";
      }
      for (k of cellSets[i]) {
        var p = coords(k);
        var t = grid[p.r][p.c];
        if (t && t.special === "rainbow") continue;
        clear.add(k);
      }
      if (sp) {
        if (sr === null) {
          var mid = Math.floor(run.len / 2);
          if (run.dir === "h") { sr = run.r; sc = run.c + mid; }
          else { sr = run.r + mid; sc = run.c; }
        }
        var base = grid[sr][sc];
        specials.set(sr + "," + sc, { r: sr, c: sc, special: sp, type: base ? base.type : randType() });
      }
    }
    return { clear: clear, specials: Array.from(specials.values()) };
  }

  function mostCommonType() {
    var counts = {}, best = null, bestN = 0;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var t = G.grid[r][c];
      if (!t) continue;
      counts[t.type] = (counts[t.type] || 0) + 1;
      if (counts[t.type] > bestN) { bestN = counts[t.type]; best = t.type; }
    }
    return best;
  }

  // Les pièces spéciales prises dans un alignement s'activent en chaîne.
  function expandClear(clear) {
    for (var iter = 0; iter < 30; iter++) {
      var added = false;
      var snapshot = Array.from(clear);
      for (var i = 0; i < snapshot.length; i++) {
        var p = coords(snapshot[i]);
        var t = G.grid[p.r][p.c];
        if (!t || !t.special) continue;
        var j, k;
        if (t.special === "h") {
          for (j = 0; j < COLS; j++) { k = p.r + "," + j; if (!clear.has(k)) { clear.add(k); added = true; } }
        } else if (t.special === "v") {
          for (j = 0; j < ROWS; j++) { k = j + "," + p.c; if (!clear.has(k)) { clear.add(k); added = true; } }
        } else if (t.special === "wrapped") {
          for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var rr = p.r + dr, cc = p.c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) { k = rr + "," + cc; if (!clear.has(k)) { clear.add(k); added = true; } }
          }
        } else if (t.special === "rainbow") {
          var ty = mostCommonType();
          if (ty) {
            for (var r2 = 0; r2 < ROWS; r2++) for (var c2 = 0; c2 < COLS; c2++) {
              var t2 = G.grid[r2][c2];
              if (t2 && t2.type === ty) { k = r2 + "," + c2; if (!clear.has(k)) { clear.add(k); added = true; } }
            }
          }
        }
      }
      if (!added) break;
    }
  }

  function objTick(kind, amount, type) {
    for (var i = 0; i < G.obj.length; i++) {
      var o = G.obj[i];
      if (o.kind !== kind) continue;
      if (type && o.type !== type) continue;
      o.done = Math.min(o.need, o.done + amount);
    }
  }
  function objectivesDone() {
    for (var i = 0; i < G.obj.length; i++) {
      var o = G.obj[i];
      if (o.kind === "score") { if (G.score < o.need) return false; continue; }
      if (o.done < o.need) return false;
    }
    return true;
  }

  function markBlockersAround(set, r, c) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var rr = r + dirs[i][0], cc = c + dirs[i][1];
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      if (G.cells[rr][cc].b > 0) set.add(rr + "," + cc);
    }
  }
  function damageBlockers(set) {
    set.forEach(function (k) {
      var p = coords(k);
      var cell = G.cells[p.r][p.c];
      if (cell.b <= 0) return;
      cell.b--;
      objTick("blocker", 1);
      if (G.headless) return;
      var slot = cellEls[k];
      if (slot && slot.block) {
        slot.block.classList.remove("shake");
        void slot.block.offsetWidth;
        slot.block.classList.add("shake");
      }
      FX.particles(p.c, p.r, 6, ["#d9a05b", "#a06a2e", "#8a5a2b", "#f0d3a0"]);
      Sound.crate();
    });
  }
  // Retire les pièces d'un ensemble de cases : compte les récoltes, la gelée, les cageots.
  function applyClearLogic(keys) {
    var damaged = new Set();
    for (var i = 0; i < keys.length; i++) {
      var p = coords(keys[i]);
      var t = G.grid[p.r][p.c];
      if (!t) continue;
      var cell = G.cells[p.r][p.c];
      if (cell.j > 0) { cell.j--; objTick("jelly", 1); jellyHit(p.r, p.c); }
      markBlockersAround(damaged, p.r, p.c);
      objTick("collect", 1, t.type);
      G.grid[p.r][p.c] = null;
    }
    damageBlockers(damaged);
  }

  function applyGravity() {
    for (var c = 0; c < COLS; c++) {
      var r = 0;
      while (r < ROWS) {
        if (isBlocked(r, c)) { r++; continue; }
        var end = r;
        while (end < ROWS && !isBlocked(end, c)) end++;
        var write = end - 1;
        for (var i = end - 1; i >= r; i--) {
          var t = G.grid[i][c];
          if (t) { if (write !== i) { G.grid[write][c] = t; G.grid[i][c] = null; } write--; }
        }
        for (var f = write; f >= r; f--) {
          var nt = { type: randType(), special: null, id: 0 };
          nt.spawn = (r === 0) ? "top" : "pop";
          nt.depth = r === 0 ? (write - f) : 0;
          G.grid[f][c] = nt;
        }
        r = end;
      }
    }
  }

  function maxId() {
    var m = 0;
    G.grid.forEach(function (row) { row.forEach(function (t) { if (t && t.id > m) m = t.id; }); });
    return m;
  }
  function assignIds() {
    var idc = maxId() + 1;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var t = G.grid[r][c];
      if (t && !t.id) t.id = idc++;
    }
  }

  function copyTypes(grid) {
    var g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var t = grid[r][c];
        row.push(t ? { type: t.type, special: t.special } : null);
      }
      g.push(row);
    }
    return g;
  }
  function findMoves(limit) {
    var out = [];
    var grid = G.grid;
    function testPair(r1, c1, r2, c2) {
      var a = grid[r1][c1], b = grid[r2][c2];
      if (!a || !b) return;
      var g = copyTypes(grid);
      g[r1][c1] = b; g[r2][c2] = a;
      var runs = findMatches(g);
      if (!runs.length) return;
      var gain = 0, cells = [], seen = {};
      for (var i = 0; i < runs.length; i++) {
        gain += runs[i].len;
        runCells(runs[i]).forEach(function (k) { if (!seen[k]) { seen[k] = 1; cells.push(k); } });
      }
      out.push({ r1: r1, c1: c1, r2: r2, c2: c2, gain: gain, val: moveValue(cells, runs, gain) });
    }
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (c + 1 < COLS) testPair(r, c, r, c + 1);
      if (r + 1 < ROWS) testPair(r, c, r + 1, c);
    }
    out.sort(function (x, y) { var d = y.val - x.val; return d ? d : y.gain - x.gain; });
    return limit ? out.slice(0, limit) : out;
  }

  // Heuristique d'un coup : combien il fait avancer chaque objectif (+ un peu de score).
  // Sert au joueur automatique (equilibrage) et au meilleur indice affiche.
  function moveValue(cells, runs, gain) {
    var v = gain * 3;
    var i, j;
    for (i = 0; i < runs.length; i++) {
      if (runs[i].len >= 5) v += 22;
      else if (runs[i].len === 4) v += 8;
    }
    if (!G || !G.obj) return v;
    for (i = 0; i < G.obj.length; i++) {
      var o = G.obj[i];
      if (o.kind === "score") continue;
      var need = o.need - o.done;
      if (need <= 0) continue;
      var got = 0;
      if (o.kind === "collect") {
        for (j = 0; j < runs.length; j++) if (runs[j].type === o.type) got += runs[j].len;
      } else if (o.kind === "jelly") {
        for (j = 0; j < cells.length; j++) { var p = coords(cells[j]); if (G.cells[p.r][p.c].j > 0) got++; }
      } else if (o.kind === "blocker") {
        var seen = {};
        for (j = 0; j < cells.length; j++) {
          var q = coords(cells[j]);
          for (var d = 0; d < 4; d++) {
            var rr = q.r + (d === 0 ? 1 : d === 1 ? -1 : 0), cc = q.c + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            if (G.cells[rr][cc].b > 0) { var kk = rr + "," + cc; if (!seen[kk]) { seen[kk] = 1; got++; } }
          }
        }
      }
      if (got > 0) v += got * 40 + Math.min(1, got / need) * 500;
    }
    return v;
  }

  function buildState(n) {
    var def = LEVELS.get(n);
    var grid = [], cells = [];
    var r, c;
    for (r = 0; r < ROWS; r++) {
      var row = [], crow = [];
      for (c = 0; c < COLS; c++) {
        row.push(null);
        crow.push({
          v: def.voids[r][c] ? 1 : 0,
          j: def.jelly[r][c], jmax: def.jelly[r][c],
          b: def.blockers[r][c], bmax: def.blockers[r][c]
        });
      }
      grid.push(row); cells.push(crow);
    }
    G = {
      n: n, def: def, types: def.tiles.slice(),
      grid: grid, cells: cells,
      score: 0, moves: def.moves, combo: 0,
      cell: 40, headless: false, over: false, won: false, busy: false,
      selected: null, hintsUsed: 0
    };
    G.obj = def.objectives.map(function (o) {
      return { kind: o.kind, need: o.need, type: o.type, done: 0 };
    });
    fillBoard();
    return G;
  }

  function fillBoard() {
    var guard = 0, r, c;
    do {
      for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
        if (isBlocked(r, c)) { G.grid[r][c] = null; continue; }
        var banned = {};
        if (c >= 2 && sameType(G.grid[r][c - 1], G.grid[r][c - 2])) banned[G.grid[r][c - 1].type] = 1;
        if (r >= 2 && sameType(G.grid[r - 1][c], G.grid[r - 2][c])) banned[G.grid[r - 1][c].type] = 1;
        var pool = G.types.filter(function (t) { return !banned[t]; });
        if (!pool.length) pool = G.types;
        G.grid[r][c] = { type: pool[Math.floor(Math.random() * pool.length)], special: null, id: 0 };
      }
      guard++;
    } while ((findMatches(G.grid).length > 0 || findMoves(1).length === 0) && guard < 300);
    assignIds();
  }

  // =====================================================================
  // 3. Rendu du plateau
  // =====================================================================
  function tx(c, r, size) { var s = size || G.cell; return "translate(" + (c * s + GUTTER) + "px," + (r * s + GUTTER) + "px)"; }

  function measure() {
    if (!G) return;
    var wrap = document.querySelector("#gamePlay .board-wrap");
    if (!wrap) return;
    var avail = wrap.clientWidth - 30;
    var h = wrap.clientHeight - 10;
    if (h > 80) avail = Math.min(avail, h);
    var vh = window.innerHeight - 300;
    if (vh > 180) avail = Math.min(avail, vh);
    avail = Math.min(avail, 520);
    G.cell = Math.max(22, Math.floor(avail / COLS));
    var b = boardEl();
    if (!b) return;
    b.style.width = (G.cell * COLS) + "px";
    b.style.height = (G.cell * ROWS) + "px";
  }

  function place(el, r, c) {
    var s = G.cell;
    el.style.transform = "translate(" + (c * s) + "px," + (r * s) + "px)";
    el.style.width = s + "px";
    el.style.height = s + "px";
  }

  function buildFloor() {
    var fl = layerEl("floorLayer");
    if (!fl) return;
    fl.innerHTML = "";
    var s = G.cell, m = 2;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var k = G.cells[r][c];
      var d = document.createElement("div");
      d.className = k.v ? "cellvoid" : ("cellfloor" + ((r + c) % 2 ? " alt" : ""));
      d.style.transform = "translate(" + (c * s + m) + "px," + (r * s + m) + "px)";
      d.style.width = (s - m * 2) + "px";
      d.style.height = (s - m * 2) + "px";
      fl.appendChild(d);
    }
  }

  function syncCells() {
    if (!G || G.headless) return;
    var jl = layerEl("jellyLayer"), bl = layerEl("blockLayer");
    if (!jl || !bl) return;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var k = G.cells[r][c], kk = key(r, c);
      var slot = cellEls[kk] || (cellEls[kk] = {});
      if (k.j > 0) {
        if (!slot.jelly) {
          var je = document.createElement("div");
          je.className = "celljelly appear";
          place(je, r, c);
          jl.appendChild(je);
          slot.jelly = je;
        }
        slot.jelly.classList.toggle("j2", k.j > 1);
      } else if (slot.jelly) {
        var oldJ = slot.jelly;
        slot.jelly = null;
        oldJ.classList.remove("j2", "hit");
        oldJ.classList.add("gone");
        (function (e) { setTimeout(function () { e.remove(); }, 380); })(oldJ);
      }
      if (k.b > 0) {
        if (!slot.block) {
          var be = document.createElement("div");
          be.className = "cellblock appear";
          place(be, r, c);
          bl.appendChild(be);
          slot.block = be;
        }
        slot.block.classList.toggle("cracked", k.b < k.bmax);
      } else if (slot.block) {
        var oldB = slot.block;
        slot.block = null;
        oldB.classList.remove("cracked", "shake");
        oldB.classList.add("gone");
        (function (e) { setTimeout(function () { e.remove(); }, 340); })(oldB);
      }
    }
  }

  function tileClass(t) {
    var cls = "tile";
    if (t.special) cls += " spec-" + t.special;
    if (t.fresh) cls += " fresh";
    return cls;
  }

  function syncTiles() {
    if (!G || G.headless) return;
    var layer = layerEl("tileLayer");
    if (!layer) return;
    var alive = new Set();
    G.grid.forEach(function (row) { row.forEach(function (t) { if (t) alive.add(t.id); }); });
    for (var id in els) {
      if (!alive.has(+id)) { els[id].remove(); delete els[id]; }
    }
    var size = G.cell - GUTTER * 2;
    G.grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (!t) return;
        var e = els[t.id];
        if (!e) {
          e = document.createElement("div");
          e.dataset.id = t.id;
          e.innerHTML = '<img alt="" draggable="false">';
          els[t.id] = e;
          layer.appendChild(e);
          if (t.spawn === "top") {
            e.style.transform = tx(c, -1.15 - (t.depth || 0));
            (function (el, cc, rr) {
              requestAnimationFrame(function () {
                el.style.transition = "transform .3s cubic-bezier(.3,1.25,.5,1)";
                el.style.transform = tx(cc, rr);
              });
            })(e, c, r);
            delete t.spawn;
          } else {
            t.fresh = true;
            e.style.transform = tx(c, r);
            delete t.spawn;
          }
        } else {
          e.style.transform = tx(c, r);
        }
        e.style.width = size + "px";
        e.style.height = size + "px";
        e.className = tileClass(t);
        var img = e.firstChild;
        var src = AVATARS[t.type] || "";
        if (img && img.getAttribute("src") !== src) img.setAttribute("src", src);
      });
    });
  }

  function jellyHit(r, c) {
    if (G.headless) return;
    var slot = cellEls[key(r, c)];
    if (slot && slot.jelly) {
      slot.jelly.classList.remove("hit");
      void slot.jelly.offsetWidth;
      slot.jelly.classList.add("hit");
    }
  }

  function spawnFloat(x, y, text, cls) {
    if (!G || G.headless) return;
    var layer = layerEl("fxLayer");
    if (!layer) return;
    var el = document.createElement("div");
    el.className = cls || "float-score";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }

  // =====================================================================
  // 4. HUD
  // =====================================================================
  function renderStarsInto(container, score, thresholds, pop) {
    if (!container) return;
    var n = 0;
    for (var i = 0; i < 3; i++) if (score >= thresholds[i]) n = i + 1;
    container.innerHTML = "";
    for (var j = 0; j < 3; j++) {
      var s = document.createElement("i");
      s.className = "star" + (j < n ? " lit" : "");
      if (pop && j < n) s.classList.add("pop");
      container.appendChild(s);
    }
  }

  function objIconHtml(o) {
    if (o.kind === "collect") {
      var src = AVATARS[o.type] || "";
      return '<span class="ico collect" style="background-image:url(\'' + src + '\')"></span>';
    }
    if (o.kind === "jelly") return '<span class="ico jelly"></span>';
    if (o.kind === "blocker") return '<span class="ico block"></span>';
    return '<span class="ico score"></span>';
  }

  function fmtNum(n) { return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F"); }

  function renderObjectives() {
    var box = $id("gObjList");
    if (!box || !G) return;
    var h = "";
    for (var i = 0; i < G.obj.length; i++) {
      var o = G.obj[i];
      var cur = o.kind === "score" ? G.score : o.done;
      var done = cur >= o.need;
      h += '<div class="obj' + (done ? " done" : "") + '" title="' + esc(o.kind === "collect" ? o.type : o.kind) + '">' +
        objIconHtml(o) +
        '<span class="obj-txt"><b>' + fmtNum(Math.min(cur, o.need)) + "/" + fmtNum(o.need) + '</b>' + (done ? " ✓" : "") + '</span></div>';
    }
    box.innerHTML = h;
  }

  function updateHud() {
    if (!G || G.headless) return;
    var def = G.def;
    var lbl = $id("gLevelLabel");
    if (lbl) {
      lbl.textContent = "Niveau " + G.n + (def.hard > 1 ? " 🌶" : "");
      lbl.title = def.name + " — " + def.tierName;
    }
    var mode = $id("gModeLabel");
    if (mode) mode.textContent = def.name + " · " + def.mode;
    var mv = $id("gMoves");
    if (mv) {
      mv.textContent = G.moves;
      mv.classList.toggle("warn", G.moves <= 5 && G.moves > 0);
    }
    var sc = $id("gScore");
    if (sc) {
      if (sc.textContent !== String(G.score)) {
        sc.textContent = G.score;
        sc.classList.remove("bump");
        void sc.offsetWidth;
        sc.classList.add("bump");
      }
    }
    var bar = $id("gStarBar");
    if (bar) bar.style.width = clamp((G.score / def.stars[2]) * 100, 0, 100) + "%";
    var starsBox = $id("gStars");
    renderStarsInto(starsBox, G.score, def.stars, false);
    if (starsBox) {
      for (var si = 0; si < 3; si++) {
        var sc2 = starsBox.children[si];
        if (sc2) sc2.style.left = clamp((def.stars[si] / def.stars[2]) * 100, 7, 100) + "%";
      }
    }
    renderObjectives();
  }

  function renderBoosters() {
    var bar = $id("gBoosters");
    if (!bar || !META) return;
    var h = "";
    for (var i = 0; i < BOOSTERS.length; i++) {
      var b = BOOSTERS[i];
      var c = META.boosters[b.key] || 0;
      h += '<button class="booster' + (armed === b.key ? " selected" : "") + (c <= 0 ? " empty" : "") +
        '" data-b="' + b.key + '" title="' + esc(b.hint) + '" aria-label="' + esc(b.label) + '">' +
        '<span class="bico">' + b.ico + '</span><span class="count">' + c + '</span></button>';
    }
    bar.innerHTML = h;
  }

  // =====================================================================
  // 5. Boucle de jeu
  // =====================================================================
  function showTargets() {
    clearTargets();
    var layer = layerEl("fxLayer");
    if (!layer || !G) return;
    var s = G.cell;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (!G.grid[r][c]) continue;
      var d = document.createElement("div");
      d.className = "celltarget";
      d.style.transform = "translate(" + (c * s + 3) + "px," + (r * s + 3) + "px)";
      d.style.width = (s - 6) + "px";
      d.style.height = (s - 6) + "px";
      layer.appendChild(d);
      targetEls.push(d);
    }
  }
  function clearTargets() {
    targetEls.forEach(function (e) { e.remove(); });
    targetEls = [];
  }

  function consumeBooster(k) {
    if (!META) return;
    META.boosters[k] = Math.max(0, (META.boosters[k] || 0) - 1);
    saveMeta();
    renderBoosters();
  }

  function doSelectOrSwap(r1, c1, r2, c2) {
    if (!G || G.busy || G.over) return;
    var t1 = G.grid[r1] && G.grid[r1][c1];
    if (!t1) return;
    var e1 = els[t1.id];
    Sound.init();
    if (r1 === r2 && c1 === c2) {
      if (G.selected && G.selected.id === t1.id) {
        if (e1) e1.classList.remove("sel");
        G.selected = null;
      } else {
        if (G.selected && G.selected.el) G.selected.el.classList.remove("sel");
        G.selected = { id: t1.id, r: r1, c: c1, el: e1 };
        if (e1) e1.classList.add("sel");
        FX.ring(c1, r1, "#ff8c42", G.cell * 0.9);
        Sound.select();
      }
      return;
    }
    var dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
    if (dr + dc !== 1) return;
    if (G.selected && G.selected.el) G.selected.el.classList.remove("sel");
    G.selected = null;
    swap(r1, c1, r2, c2);
  }

  function swap(r1, c1, r2, c2) {
    if (!G || G.busy || G.over) return Promise.resolve();
    G.busy = true;
    clearHint();
    G.selected = null;
    var t1 = G.grid[r1][c1], t2 = G.grid[r2][c2];
    if (!t1 || !t2) { G.busy = false; return Promise.resolve(); }
    var a = els[t1.id], b = els[t2.id];
    var aRain = t1.special === "rainbow", bRain = t2.special === "rainbow";
    if (!G.headless) {
      Sound.swap();
      FX.particles(c1, r1, 3, ["#cfe0c4", "#a8d0a0"]);
      FX.particles(c2, r2, 3, ["#cfe0c4", "#a8d0a0"]);
      if (a) a.style.transform = tx(c2, r2);
      if (b) b.style.transform = tx(c1, r1);
    }
    return wait(190).then(function () {
      G.grid[r1][c1] = t2;
      G.grid[r2][c2] = t1;
      G.moves--;
      updateHud();
      if (aRain || bRain) {
        var keys = [];
        var ty = aRain ? t2.type : t1.type;
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          var t = G.grid[r][c];
          if (!t) continue;
          if (aRain && bRain) keys.push(key(r, c));
          else if (t.type === ty || t.special === "rainbow") keys.push(key(r, c));
        }
        Sound.rainbow();
        return doClearAndRefill(keys).then(function () { return resolveMatches(); }).then(afterMove);
      }
      if (!findMatches(G.grid).length) {
        G.grid[r1][c1] = t1;
        G.grid[r2][c2] = t2;
        G.moves++;
        updateHud();
        if (!G.headless) {
          Sound.bad();
          FX.shake(false);
          if (a) nudge(a);
          if (b) nudge(b);
          if (a) a.style.transform = tx(c1, r1);
          if (b) b.style.transform = tx(c2, r2);
        }
        return wait(190).then(function () {
          G.busy = false;
          armHint();
        });
      }
      return resolveMatches().then(afterMove);
    });
  }

  function nudge(el) {
    el.classList.remove("nudge");
    void el.offsetWidth;
    el.classList.add("nudge");
    setTimeout(function () { el.classList.remove("nudge"); }, 360);
  }

  function refreshCells() {
    assignIds();
    syncTiles();
    syncCells();
  }

  // Efface un ensemble de cases (bombe arc-en-ciel, marteau, récolte sucrée).
  function doClearAndRefill(keys) {
    if (!keys.length) return Promise.resolve();
    var i;
    var pts = keys.length * 15;
    G.score += pts;
    updateHud();
    var sx = 0, sy = 0, n = 0;
    for (i = 0; i < keys.length; i++) {
      var p = coords(keys[i]);
      var t = G.grid[p.r][p.c];
      if (t && els[t.id]) els[t.id].classList.add("matched");
      sx += p.c; sy += p.r; n++;
    }
    if (!G.headless) {
      FX.flash();
      FX.shake(n > 12);
      if (n) spawnFloat((sx / n) * G.cell + G.cell / 2, (sy / n) * G.cell + G.cell / 2, "+" + pts);
    }
    return wait(150).then(function () {
      for (var i2 = 0; i2 < keys.length; i2++) {
        var q = coords(keys[i2]);
        var t2 = G.grid[q.r][q.c];
        if (t2 && els[t2.id]) {
          els[t2.id].classList.remove("matched");
          els[t2.id].classList.add("pop");
        }
        if (!G.headless) FX.particles(q.c, q.r, keys.length > 24 ? 2 : 5);
      }
      return wait(310);
    }).then(function () {
      applyClearLogic(keys);
      applyGravity();
      refreshCells();
      return wait(330);
    });
  }

  function resolveMatches() {
    G.combo = 0;
    var runs = findMatches(G.grid);
    var guard = 0;
    function step() {
      if (!runs.length || guard++ > 40) { G.combo = 0; return Promise.resolve(); }
      G.combo++;
      var pr = processRuns(runs, G.grid);
      var clear = pr.clear;
      var specials = pr.specials;
      expandClear(clear);
      if (specials.length) Sound.special();
      Sound.cascade(G.combo);
      var pts = clear.size * 10 * G.combo;
      G.score += pts;
      updateHud();
      var clearedEls = [], sx = 0, sy = 0, heavy = false;
      var i;
      if (!G.headless) for (i = 0; i < runs.length; i++) FX.line(runs[i]);
      clear.forEach(function (k) {
        var p = coords(k);
        var t = G.grid[p.r][p.c];
        if (t && els[t.id]) { els[t.id].classList.add("matched"); clearedEls.push({ r: p.r, c: p.c, t: t }); }
        sx += p.c; sy += p.r;
      });
      if (clear.size && !G.headless) {
        spawnFloat((sx / clear.size) * G.cell + G.cell / 2, (sy / clear.size) * G.cell + G.cell / 2, "+" + pts);
      }
      if (!G.headless) {
        var bigRun = null;
        for (i = 0; i < runs.length; i++) if (runs[i].len >= 4) bigRun = runs[i];
        if (bigRun) FX.exclaim(bigRun, specials.length ? "rainbow" : (G.combo >= 3 ? "big" : "normal"));
      }
      return wait(150).then(function () {
        for (var i3 = 0; i3 < clearedEls.length; i3++) {
          var it = clearedEls[i3];
          var e = els[it.t.id];
          if (e) { e.classList.remove("matched"); e.classList.add("pop"); }
          if (G.headless) continue;
          if (it.t.special === "h") FX.beam(it.r, it.c, "h");
          else if (it.t.special === "v") FX.beam(it.r, it.c, "v");
          else if (it.t.special === "wrapped") { FX.explosion(it.c, it.r); heavy = true; }
          else if (it.t.special === "rainbow") { FX.rainbow(it.c, it.r); heavy = true; }
          else FX.particles(it.c, it.r, clear.size > 18 ? 4 : 8);
        }
        if (!G.headless) {
          if (heavy) { FX.shake(true); Sound.rainbow(); }
          else if (G.combo >= 2) FX.shake(false);
          if (G.combo >= 2) FX.combo(G.combo);
        }
        return wait(300);
      }).then(function () {
        applyClearLogic(Array.from(clear));
        applyGravity();
        for (var i4 = 0; i4 < specials.length; i4++) {
          var s = specials[i4];
          var old = G.grid[s.r][s.c];
          if (old && old.id && els[old.id]) { els[old.id].remove(); delete els[old.id]; }
          G.grid[s.r][s.c] = { type: s.type, special: s.special, id: 0 };
        }
        refreshCells();
        for (var i5 = 0; i5 < specials.length; i5++) {
          var s2 = specials[i5];
          var st = G.grid[s2.r][s2.c];
          if (st && els[st.id]) els[st.id].classList.add("spec-created");
          if (!G.headless) FX.spawn(s2.c, s2.r);
        }
        return wait(340);
      }).then(function () {
        runs = findMatches(G.grid);
        return step();
      });
    }
    return step();
  }

  function afterMove() {
    if (!G || G.over) return Promise.resolve();
    if (objectivesDone()) return winSequence();
    if (G.moves <= 0) return loseSequence();
    if (!findMoves(1).length) return reshuffle(true).then(function () {
      G.busy = false;
      armHint();
    });
    G.busy = false;
    armHint();
    return Promise.resolve();
  }

  function reshuffleSync() {
    var guard = 0;
    do {
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var t = G.grid[r][c];
        if (t && !t.special) t.type = randType();
      }
      guard++;
    } while ((findMatches(G.grid).length || !findMoves(1).length) && guard < 80);
  }

  function reshuffle(animated) {
    G.busy = true;
    reshuffleSync();
    if (!G.headless && animated) {
      Sound.shuffle();
      syncTiles();
      toast("Aucun alignement possible — les paniers sont rebattus !");
      return wait(300).then(function () { G.busy = false; });
    }
    syncTiles();
    return Promise.resolve();
  }

  // ---------------------------------------------------------- fin de niveau
  function winSequence() {
    G.over = true;
    G.won = true;
    if (G.headless) { recordResult(true); return Promise.resolve(); }
    var left = Math.max(0, G.moves);
    Sound.win();
    var chain = Promise.resolve();
    if (left > 0) {
      chain = chain.then(function () {
        showBanner("Récolte sucrée !");
        Sound.sugar();
        return wait(760);
      }).then(function () {
        var bursts = Math.min(left, 12);
        var seq = Promise.resolve();
        var doBurst = function () {
          if (G.moves <= 0) return Promise.resolve();
          var cands = [];
          for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (G.grid[r][c]) cands.push([r, c]);
          if (!cands.length) return Promise.resolve();
          var q = pick(cands);
          var horiz = Math.random() < 0.5;
          var keys = [], i;
          if (horiz) { for (i = 0; i < COLS; i++) if (G.grid[q[0]][i]) keys.push(q[0] + "," + i); }
          else { for (i = 0; i < ROWS; i++) if (G.grid[i][q[1]]) keys.push(i + "," + q[1]); }
          G.moves--;
          updateHud();
          if (horiz) FX.beam(q[0], q[1], "h"); else FX.beam(q[0], q[1], "v");
          G.score += keys.length * 25;
          updateHud();
          applyClearLogic(keys);
          applyGravity();
          refreshCells();
          Sound.sugar();
          return wait(230).then(doBurst);
        };
        for (var b = 0; b < bursts; b++) seq = seq.then(doBurst);
        return seq;
      });
    }
    return chain.then(function () {
      G.moves = 0;
      updateHud();
      recordResult(true);
      confetti(70);
      Sound.star();
      return wait(260);
    }).then(function () {
      showResultModal(true);
    });
  }

  function loseSequence() {
    G.over = true;
    G.won = false;
    if (G.headless) { return Promise.resolve(); }
    Sound.lose();
    FX.shake(true);
    return wait(320).then(function () {
      recordResult(false);
      return showResultModal(false);
    });
  }

  function recordResult(won) {
    if (G.headless || !META) return;
    META.plays = (META.plays || 0) + 1;
    if (won) {
      var def = G.def;
      var st = Math.max(1, starsFor(G.score, def));
      var prev = META.stars[G.n] || 0;
      if (st > prev) META.stars[G.n] = st;
      if (G.score > (META.best || 0)) META.best = G.score;
      if (prev === 0) {
        var gain = st === 3 ? 2 : 1;
        for (var i = 0; i < gain; i++) {
          var bk = pick(BOOSTERS).key;
          META.boosters[bk] = (META.boosters[bk] || 0) + 1;
        }
      }
      saveMeta();
    } else {
      saveMeta();
    }
  }

  // =====================================================================
  // 6. Modales, bannière, confettis, toast
  // =====================================================================
  function removeModal() {
    var m = document.querySelector(".modal-bg");
    if (m) m.remove();
  }

  function showResultModal(won) {
    removeModal();
    var def = G.def;
    var st = won ? Math.max(1, starsFor(G.score, def)) : 0;
    var starsHtml = "";
    for (var i = 0; i < 3; i++) {
      starsHtml += '<i class="star big' + (i < st ? " lit" : "") + '" style="animation-delay:' + (0.16 + i * 0.26) + 's"></i>';
    }
    var nextN = G.n + 1;
    var canNext = won && nextN <= LEVELS.total;
    var sub;
    if (!won) sub = "Objectif : " + def.mode + ". Il manquait quelques coups...";
    else if (st === 3) sub = "Cueillette parfaite, trois étoiles !";
    else sub = "Objectif atteint en " + (META && META.stars[G.n] ? "grande forme" : "belle récolte") + " !";
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML =
      '<div class="modal result-modal">' +
        '<div class="rm-kicker">Niveau ' + G.n + ' &middot; ' + esc(def.name) + '</div>' +
        '<h3>' + (won ? "Récolte réussie !" : "Plus de coups !") + '</h3>' +
        '<div class="rm-stars">' + starsHtml + '</div>' +
        '<div class="rm-score"><span>Score</span><b>' + G.score + '</b></div>' +
        '<p class="rm-sub">' + esc(sub) + '</p>' +
        '<div class="modal-btns">' +
          '<button class="mb-ghost" data-act="map">Carte</button>' +
          '<button class="mb-ghost" data-act="retry">Réessayer</button>' +
          (canNext ? '<button class="mb-primary" data-act="next">Suivant</button>' : "") +
        '</div>' +
      '</div>';
    document.body.appendChild(bg);
    bg.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.dataset.act;
      var n = G.n;
      removeModal();
      if (act === "map") showMap();
      else if (act === "retry") startLevel(n);
      else if (act === "next") startLevel(Math.min(LEVELS.total, n + 1));
    });
  }

  function showBanner(text) {
    var b = $id("gBanner");
    if (!b) return;
    b.innerHTML = "<span>" + esc(text) + "</span>";
    b.classList.add("show");
    setTimeout(function () { b.classList.remove("show"); b.innerHTML = ""; }, 1500);
  }

  function confetti(n) {
    var c = $id("confetti");
    if (!c) return;
    c.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var d = document.createElement("i");
      d.className = "conf";
      d.style.left = (Math.random() * 100) + "%";
      d.style.background = CONF_COLORS[i % CONF_COLORS.length];
      d.style.width = (5 + Math.random() * 6) + "px";
      d.style.height = (9 + Math.random() * 11) + "px";
      d.style.animationDuration = (1.7 + Math.random() * 1.7) + "s";
      d.style.animationDelay = (Math.random() * 0.6) + "s";
      c.appendChild(d);
    }
    setTimeout(function () { c.innerHTML = ""; }, 4600);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $id("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // =====================================================================
  // 7. Carte des niveaux
  // =====================================================================
  function chilies(tier) { return tier >= 4 ? "\uD83C\uDF36\uD83C\uDF36" : "\uD83C\uDF36"; }

  function starSpan(st) {
    var h = "";
    for (var i = 0; i < 3; i++) h += '<i class="star' + (i < st ? " lit" : "") + '"></i>';
    return h;
  }

  function statBox(v, l) {
    return '<div class="gm-stat"><b>' + esc(String(v)) + '</b><span>' + esc(l) + '</span></div>';
  }

  function renderMap() {
    var grid = $id("levelGrid");
    if (!grid || !META || !LEVELS) return;
    var cur = currentLevel();
    var h = "";
    for (var n = 1; n <= LEVELS.total; n++) {
      var def = LEVELS.get(n);
      var st = META.stars[n] || 0;
      var open = isUnlocked(n);
      var cls = "levelBtn" + (open ? "" : " locked") + (open && n === cur ? " current" : "");
      var thumb = AVATARS[def.tiles[n % def.tiles.length]] || AVATARS[def.tiles[0]] || "";
      h += '<button class="' + cls + '" data-n="' + n + '" title="' + esc(def.name + " - " + def.tierName + " - " + def.mode) + '">' +
        (thumb ? '<img class="thumb" src="' + thumb + '" alt="" loading="lazy">' : "") +
        (def.hard > 1 ? '<span class="chilbadge">' + chilies(def.hard) + '</span>' : "") +
        (open ? "" : '<span class="lockbadge"></span>') +
        '<span class="num">' + n + '</span>' +
        '<span class="stars">' + starSpan(st) + '</span>' +
        '</button>';
    }
    grid.innerHTML = h;
    var stats = $id("gmStats");
    if (stats) {
      stats.innerHTML =
        statBox(totalStars() + " / " + (LEVELS.total * 3), "Étoiles") +
        statBox(completedCount() + " / " + LEVELS.total, "Niveaux terminés") +
        statBox(META.best || 0, "Meilleur score") +
        statBox(META.boosters.hammer + " · " + META.boosters.shuffle + " · " + META.boosters.moves, "Marteau · Mélanger · Coups");
    }
  }

  function showMap() {
    view = "map";
    armed = null;
    clearTargets();
    clearHint();
    removeModal();
    var m = $id("gameMap"), p = $id("gamePlay");
    if (m) m.hidden = false;
    if (p) p.hidden = true;
    renderMap();
  }

  function showPlay() {
    view = "play";
    var m = $id("gameMap"), p = $id("gamePlay");
    if (m) m.hidden = true;
    if (p) p.hidden = false;
  }

  // =====================================================================
  // 8. Démarrage d'un niveau + boosters + indice
  // =====================================================================
  function startLevel(n) {
    if (!LEVELS) return;
    armed = null;
    clearTargets();
    clearHint();
    removeModal();
    buildState(n);
    els = {};
    cellEls = {};
    ["floorLayer", "tileLayer", "jellyLayer", "blockLayer", "fxLayer"].forEach(function (id) {
      var e = layerEl(id);
      if (e) e.innerHTML = "";
    });
    showPlay();
    measure();
    buildFloor();
    syncCells();
    syncTiles();
    updateHud();
    renderBoosters();
    G.busy = false;
    armHint();
  }

  function boosterLabel(k) {
    for (var i = 0; i < BOOSTERS.length; i++) if (BOOSTERS[i].key === k) return BOOSTERS[i].label;
    return k;
  }

  function armBooster(k) {
    if (!G || G.busy || G.over) return;
    if (!META.boosters[k]) {
      toast("Plus de « " + boosterLabel(k) + " » — gagne des niveaux pour en obtenir !");
      return;
    }
    if (k === "hammer") {
      armed = armed === k ? null : k;
      renderBoosters();
      if (armed) { showTargets(); Sound.select(); } else clearTargets();
      return;
    }
    armed = null;
    clearTargets();
    renderBoosters();
    consumeBooster(k);
    if (k === "shuffle") { Sound.shuffle(); reshuffle(true).then(armHint); }
    else if (k === "moves") {
      G.moves += 5;
      updateHud();
      Sound.booster();
      toast("+5 coups !");
      armHint();
    }
  }

  function hammerCell(r, c) {
    if (!G || G.busy || G.over) return;
    var t = G.grid[r][c];
    if (!t) return;
    armed = null;
    clearTargets();
    renderBoosters();
    consumeBooster("hammer");
    G.busy = true;
    Sound.hammer();
    FX.explosion(c, r);
    doClearAndRefill([key(r, c)]).then(resolveMatches).then(afterMove);
  }

  function armHint() {
    clearTimeout(hintTimer);
    if (!G || G.over || G.headless) return;
    hintTimer = setTimeout(showHint, 6500);
  }
  function clearHint() {
    clearTimeout(hintTimer);
    hintEls.forEach(function (e) { e.classList.remove("hint"); });
    hintEls = [];
  }
  function showHint() {
    if (!G || G.busy || G.over || view !== "play" || armed) return;
    var list = findMoves(1);
    if (!list.length) return;
    var m = list[0];
    clearHint();
    var pairs = [[m.r1, m.c1], [m.r2, m.c2]];
    for (var i = 0; i < pairs.length; i++) {
      var t = G.grid[pairs[i][0]][pairs[i][1]];
      if (t && els[t.id]) { els[t.id].classList.add("hint"); hintEls.push(els[t.id]); }
    }
  }

  // =====================================================================
  // 9. Entrées
  // =====================================================================
  function cellAtPoint(x, y) {
    if (!G) return null;
    var layer = layerEl("tileLayer");
    if (!layer) return null;
    var rc = layer.getBoundingClientRect();
    var c = Math.floor((x - rc.left) / G.cell);
    var r = Math.floor((y - rc.top) / G.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r: r, c: c };
  }

  function bindInput() {
    var b = boardEl();
    if (!b) return;
    b.addEventListener("pointerdown", function (e) {
      if (!G || G.busy || G.over || view !== "play") return;
      var p = cellAtPoint(e.clientX, e.clientY);
      if (!p) return;
      Sound.init();
      if (armed === "hammer") { hammerCell(p.r, p.c); e.preventDefault(); return; }
      drag = { r: p.r, c: p.c, x: e.clientX, y: e.clientY, moved: false };
      e.preventDefault();
    }, { passive: false });

    window.addEventListener("pointermove", function (e) {
      if (!drag || !G || G.busy || G.over) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 12) drag.moved = true;
      if (!drag.moved) return;
      var p = cellAtPoint(e.clientX, e.clientY);
      if (!p) return;
      if (Math.abs(p.r - drag.r) + Math.abs(p.c - drag.c) !== 1) return;
      var from = drag;
      drag = null;
      doSelectOrSwap(from.r, from.c, p.r, p.c);
    });

    window.addEventListener("pointerup", function () {
      var d = drag;
      drag = null;
      if (!d || !G) return;
      if (!d.moved) doSelectOrSwap(d.r, d.c, d.r, d.c);
    });
    window.addEventListener("pointercancel", function () { drag = null; });
  }

  // =====================================================================
  // 10. Sons
  // =====================================================================
  var Sound = (function () {
    var ctx = null, muted = false;
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
      if (ctx && ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, when, slideTo) {
      if (muted || (G && G.headless)) return;
      var c = ac();
      if (!c) return;
      var t = c.currentTime + (when || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    return {
      init: function () { ac(); },
      toggle: function () { muted = !muted; return muted; },
      isMuted: function () { return muted; },
      select: function () { tone(540, 0.09, "triangle", 0.1); },
      swap: function () { tone(340, 0.1, "sine", 0.13, 0, 560); },
      bad: function () { tone(170, 0.16, "square", 0.07, 0, 110); },
      cascade: function (c) { tone(520 * Math.pow(1.07, Math.min(c, 12)), 0.14, "sine", 0.16); },
      special: function () { tone(330, 0.4, "sawtooth", 0.09, 0, 880); tone(660, 0.32, "triangle", 0.1, 0.05); },
      rainbow: function () { tone(260, 0.55, "sawtooth", 0.1, 0, 1240); tone(520, 0.4, "triangle", 0.1, 0.06, 990); },
      crate: function () { tone(140, 0.1, "square", 0.11, 0, 90); tone(220, 0.07, "triangle", 0.07, 0.03); },
      hammer: function () { tone(900, 0.07, "square", 0.09); tone(600, 0.12, "triangle", 0.12, 0.05); },
      booster: function () { [440, 620, 880].forEach(function (f, i) { tone(f, 0.16, "triangle", 0.12, i * 0.07); }); },
      shuffle: function () { for (var i = 0; i < 5; i++) tone(400 + i * 60, 0.07, "triangle", 0.07, i * 0.045); },
      sugar: function () { tone(700, 0.18, "triangle", 0.13, 0, 1300); },
      star: function () { [660, 880, 1320].forEach(function (f, i) { tone(f, 0.3, "triangle", 0.12, i * 0.1); }); },
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.38, "triangle", 0.16, i * 0.13); }); },
      lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.34, "triangle", 0.14, i * 0.15); }); }
    };
  })();

  // =====================================================================
  // 11. Effets visuels
  // =====================================================================
  var FX = (function () {
    var COLORS = ["#ff6b6b", "#ffb84d", "#ffd93d", "#6bcf6b", "#4dc3ff", "#b06bff", "#ff7eb3"];
    function el(cls) { var e = document.createElement("div"); e.className = cls; return e; }
    function add(e) {
      if (G && G.headless) return e;
      var layer = layerEl("fxLayer");
      if (!layer) return e;
      layer.appendChild(e);
      setTimeout(function () { e.remove(); }, 1500);
      return e;
    }
    function cxy(c, r) { return { x: c * G.cell + GUTTER + G.cell / 2, y: r * G.cell + GUTTER + G.cell / 2 }; }
    function particles(c, r, n, colors) {
      if (G && G.headless) return;
      var pal = colors || COLORS;
      var p = cxy(c, r);
      for (var i = 0; i < n; i++) {
        var star = i % 4 === 0;
        var e = el(star ? "fx-star" : "fx-part");
        e.style.left = p.x + "px";
        e.style.top = p.y + "px";
        var col = pal[i % pal.length];
        e.style.background = star ? col : "radial-gradient(circle at 32% 32%, #fff, " + col + " 68%)";
        e.style.boxShadow = "0 0 14px 3px " + col;
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
        var dist = G.cell * (0.4 + Math.random() * (star ? 1 : 0.7));
        e.style.setProperty("--dx", Math.cos(ang) * dist + "px");
        e.style.setProperty("--dy", Math.sin(ang) * dist + "px");
        e.style.setProperty("--sz", star ? (10 + Math.random() * 6) + "px" : (6 + Math.random() * 8) + "px");
        add(e);
      }
    }
    function ring(c, r, color, scale) {
      if (G && G.headless) return;
      var p = cxy(c, r);
      var e = el("fx-ring");
      e.style.left = p.x + "px";
      e.style.top = p.y + "px";
      e.style.borderColor = color;
      e.style.boxShadow = "0 0 16px 3px " + color;
      e.style.setProperty("--rsize", scale || G.cell * 1.6);
      add(e);
    }
    function beam(r, c, dir) {
      var e = el("fx-beam " + (dir === "h" ? "fx-beam-h" : "fx-beam-v"));
      if (dir === "h") {
        e.style.left = "0px";
        e.style.top = (r * G.cell + GUTTER + G.cell / 2 - 5) + "px";
        e.style.width = (COLS * G.cell) + "px";
        e.style.height = "10px";
      } else {
        e.style.left = (c * G.cell + GUTTER + G.cell / 2 - 5) + "px";
        e.style.top = "0px";
        e.style.width = "10px";
        e.style.height = (ROWS * G.cell) + "px";
      }
      add(e);
    }
    function line(run) {
      var e = el("fx-line");
      if (run.dir === "h") {
        e.style.left = (run.c * G.cell + GUTTER - 5) + "px";
        e.style.top = (run.r * G.cell + GUTTER + G.cell / 2 - 5) + "px";
        e.style.width = (run.len * G.cell + 10) + "px";
        e.style.height = "10px";
        e.style.background = "linear-gradient(90deg,#ffcf4d,#fff 30%,#fff 70%,#ffcf4d)";
      } else {
        e.style.left = (run.c * G.cell + GUTTER + G.cell / 2 - 5) + "px";
        e.style.top = (run.r * G.cell + GUTTER - 5) + "px";
        e.style.width = "10px";
        e.style.height = (run.len * G.cell + 10) + "px";
        e.style.background = "linear-gradient(0deg,#ffcf4d,#fff 30%,#fff 70%,#ffcf4d)";
      }
      add(e);
    }
    function explosion(c, r) {
      if (G && G.headless) return;
      var p = cxy(c, r);
      particles(c, r, 18);
      ring(c, r, "#ffb84d", G.cell * 2.4);
      ring(c, r, "#fff7e0", G.cell * 1.2);
      var e = el("fx-flash-small");
      e.style.left = p.x + "px";
      e.style.top = p.y + "px";
      e.style.setProperty("--fs", (G.cell * 2.6) + "px");
      add(e);
    }
    function rainbow(c, r) {
      if (G && G.headless) return;
      particles(c, r, 26, COLORS);
      ring(c, r, "#ffffff", G.cell * 2.8);
      ring(c, r, "#ffd93d", G.cell * 1.4);
      flash();
    }
    function flash() {
      if (G && G.headless) return;
      var e = el("fx-flash");
      document.body.appendChild(e);
      setTimeout(function () { e.remove(); }, 700);
    }
    function spawn(c, r) {
      if (G && G.headless) return;
      var p = cxy(c, r);
      var e = el("fx-spawn");
      e.style.left = p.x + "px";
      e.style.top = p.y + "px";
      add(e);
    }
    function combo(n) {
      if (G && G.headless) return;
      var b = boardEl();
      var e = el("fx-combo");
      e.textContent = "Combo x" + n + " !";
      e.style.left = (b.clientWidth / 2) + "px";
      e.style.top = (b.clientHeight / 2) + "px";
      add(e);
    }
    function exclaim(run, kind) {
      if (G && G.headless) return;
      var layer = layerEl("fxLayer");
      if (!layer) return;
      var e = document.createElement("div");
      e.className = "exclaim" + (kind === "rainbow" ? " rainbow" : "");
      e.textContent = kind === "big" ? pick(CHEERS_BIG) : pick(CHEERS);
      var cx, cy;
      if (run.dir === "h") { cx = (run.c + run.len / 2) * G.cell; cy = (run.r + 0.5) * G.cell; }
      else { cx = (run.c + 0.5) * G.cell; cy = (run.r + run.len / 2) * G.cell; }
      e.style.left = cx + "px";
      e.style.top = cy + "px";
      e.style.fontSize = (G.cell * 0.62) + "px";
      layer.appendChild(e);
      setTimeout(function () { e.remove(); }, 1200);
    }
    function shake(strength) {
      if (G && G.headless) return;
      var b = boardEl();
      if (!b) return;
      var w = b.closest(".board-wrap");
      if (w) { w.classList.remove("glow"); void w.offsetWidth; w.classList.add("glow"); }
      b.classList.remove("fx-shake");
      void b.offsetWidth;
      b.style.setProperty("--sh", strength ? "11px" : "5px");
      b.classList.add("fx-shake");
      setTimeout(function () { b.classList.remove("fx-shake"); }, 600);
      if (w) setTimeout(function () { w.classList.remove("glow"); }, 500);
      try { if (navigator.vibrate) navigator.vibrate(strength ? 40 : 18); } catch (err) { /* ignore */ }
    }
    return { particles: particles, ring: ring, beam: beam, line: line, explosion: explosion, rainbow: rainbow, flash: flash, spawn: spawn, combo: combo, exclaim: exclaim, shake: shake };
  })();

  // =====================================================================
  // 12. Simulation headless (équilibrage des niveaux)
  // =====================================================================
  function simulate(n, opts) {
    opts = opts || {};
    buildState(n);
    G.headless = true;
    var guard = 0;
    function loop() {
      if (G.over || G.moves <= 0 || guard++ > 600) {
        var res = { n: n, score: G.score, won: !!G.won, moves: G.moves, stars: G.won ? Math.max(1, starsFor(G.score, G.def)) : 0,
          obj: G.obj.map(function (o) { return { kind: o.kind, type: o.type, need: o.need, done: o.done }; }) };
        G.headless = false;
        return res;
      }
      var cands = findMoves(0);
      if (!cands.length) { reshuffleSync(); return loop(); }
      var best = cands[0].val;
      var top = cands.filter(function (m) { return m.val === best; });
      var m = opts.random ? pick(cands) : pick(top);
      return swap(m.r1, m.c1, m.r2, m.c2).then(loop);
    }
    return Promise.resolve().then(loop);
  }

  // Score par coup d'un bon joueur sur un plateau plein, pour un nombre de types donné.
  // Sert à calibrer les seuils d'objectif dans levels.js (ppm).
  function probe(spec, runs) {
    runs = runs || 6;
    var all = [];
    for (var n = 1; n <= LEVELS.total && all.length < 8; n++) {
      var ts = LEVELS.get(n).tiles;
      for (var j = 0; j < ts.length; j++) if (all.indexOf(ts[j]) === -1) all.push(ts[j]);
    }
    var out = [];
    var chain = Promise.resolve();
    spec.forEach(function (sp) {
      chain = chain.then(function () {
        var tot = 0, used = 0, maxS = 0;
        var seq = Promise.resolve();
        for (var i = 0; i < runs; i++) seq = seq.then(function () {
          buildState(1);
          G.types = all.slice(0, sp.types);
          for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) G.grid[r][c] = null;
          assignIds();
          G.headless = true;
          G.moves = sp.moves;
          G.score = 0;
          G.obj = [{ kind: "score", need: 1e9, done: 0 }];
          fillBoard();
          var guard = 0;
          function loop() {
            if (G.over || G.moves <= 0 || guard++ > 600) {
              tot += G.score; used += (sp.moves - G.moves); maxS = Math.max(maxS, G.score);
              G.headless = false;
              return;
            }
            var cands = findMoves(0);
            if (!cands.length) { reshuffleSync(); return loop(); }
            var best = cands[0].val;
            var m = pick(cands.filter(function (x) { return x.val === best; }));
            return swap(m.r1, m.c1, m.r2, m.c2).then(loop);
          }
          return Promise.resolve().then(loop);
        });
        return seq.then(function () {
          out.push({ types: sp.types, moves: sp.moves, runs: runs, ppm: Math.round(tot / Math.max(1, used)), best: maxS });
        });
      });
    });
    return chain.then(function () { return out; });
  }

  function balance(from, to, runs) {
    runs = runs || 1;
    var out = [];
    var chain = Promise.resolve();
    var mk = function (nn) {
      chain = chain.then(function () {
        var seq = Promise.resolve(), tot = 0, wins = 0, st = 0;
        for (var i = 0; i < runs; i++) {
          seq = seq.then(function () {
            return simulate(nn, {}).then(function (r) {
              tot += r.score;
              if (r.won) wins++;
              st += r.stars;
            });
          });
        }
        return seq.then(function () {
          var def = LEVELS.get(nn);
          out.push({
            n: nn, mode: def.mode, hard: def.hard,
            avg: Math.round(tot / runs), win: Math.round(100 * wins / runs),
            stars: +(st / runs).toFixed(2),
            t1: def.stars[0], t3: def.stars[2], moves: def.moves
          });
        });
      });
    };
    for (var n = from; n <= to; n++) mk(n);
    return chain.then(function () { return out; });
  }

  // =====================================================================
  // 13. Liaison UI + démarrage
  // =====================================================================
  function bindUI() {
    var back = $id("gBack");
    if (back) back.addEventListener("click", function () { showMap(); });
    var gr = $id("gRestart");
    if (gr) gr.addEventListener("click", function () {
      if (!G || G.busy) return;
      startLevel(G.n);
    });
    var gs = $id("gSound");
    if (gs) gs.addEventListener("click", function () {
      var m = Sound.toggle();
      this.classList.toggle("muted", m);
      this.textContent = m ? "\uD83D\uDD07" : "\uD83D\uDD0A";
    });
    var bb = $id("gBoosters");
    if (bb) bb.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".booster") : null;
      if (b) armBooster(b.dataset.b);
    });
    var lg = $id("levelGrid");
    if (lg) lg.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".levelBtn") : null;
      if (!b) return;
      var n = +b.dataset.n;
      if (!isUnlocked(n)) { toast("Termine d'abord le niveau " + (n - 1) + " !"); return; }
      b.classList.add("tap");
      startLevel(n);
    });
    window.addEventListener("resize", function () {
      if (view === "play" && G) { measure(); buildFloor(); syncTiles(); syncCells(); }
    });
  }

  function boot() {
    bindUI();
    bindInput();
    loadMeta().then(function () {
      if (view === "map") showMap();
      else if (G) { measure(); syncTiles(); syncCells(); renderBoosters(); }
    });
  }

  window.GAME = {
    ensureBoard: function () {
      return loadMeta().then(function () {
        if (view === "play" && G && !G.over) {
          measure(); buildFloor(); syncTiles(); syncCells(); renderBoosters();
        } else showMap();
      });
    },
    newGame: function (n) { startLevel(n || 1); },
    isReady: function () { return !!G; },
    __debug: {
      get grid() { return G ? copyTypes(G.grid) : null; },
      get state() {
        if (!G) return null;
        return {
          n: G.n, score: G.score, moves: G.moves, over: G.over, won: G.won, busy: G.busy,
          obj: G.obj.map(function (o) { return { kind: o.kind, type: o.type, done: o.done, need: o.need }; })
        };
      },
      def: function (n) { return LEVELS.get(n); },
      moves: function (limit) { return G ? findMoves(limit || 0) : []; },
      get cells() {
        if (!G) return null;
        return G.cells.map(function (row) {
          return row.map(function (k) { return { v: k.v, j: k.j, b: k.b }; });
        });
      },
      meta: function () { return META; },
      setMeta: function (m) { META = normMeta(m); saveMeta(); renderMap(); renderBoosters(); },
      startLevel: startLevel,
      simulate: simulate,
      balance: balance,
      probe: probe,
      setScore: function (n) { if (G) { G.score = n; updateHud(); } },
      setMoves: function (n) { if (G) { G.moves = n; updateHud(); } },
      setGrid: function (arr) {
        if (!G) return;
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          var t = G.grid[r][c];
          if (t && arr[r] && arr[r][c]) { t.type = arr[r][c].type; t.special = arr[r][c].special || null; }
        }
        refreshCells();
      },
      swap: function (r1, c1, r2, c2) { return swap(r1, c1, r2, c2); },
      reshuffle: function () { return reshuffle(true); }
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
