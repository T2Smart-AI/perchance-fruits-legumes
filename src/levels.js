// Level manifest for "Match des Saisons".
// Levels are generated deterministically from the level number (mulberry32 seeded by a
// hash of n), so a level is always identical for everyone — stars/objectives never drift.
// A level definition is:
//   { n, name, mode, hard, tier, shape, voids[8][8], jelly[8][8], blockers[8][8],
//     tiles:[names], objectives:[{kind,...}], moves, target, stars:[s1,s2,s3] }
// kinds: "score" | "jelly" | "collect" (type) | "blocker"
(function () {
  const ROWS = 8, COLS = 8;

  // ---------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash32(n) {
    let h = (n >>> 0) + 0x9E3779B9;
    h = Math.imul(h ^ (h >>> 16), 0x21F0AAAD);
    h = Math.imul(h ^ (h >>> 15), 0x735A2D97);
    return (h ^ (h >>> 15)) >>> 0;
  }
  function grid0() {
    const g = [];
    for (let r = 0; r < ROWS; r++) { const row = []; for (let c = 0; c < COLS; c++) row.push(0); g.push(row); }
    return g;
  }
  function round25(v) { return Math.round(v / 25) * 25; }
  function clamp01(v) { return v < 0.5 ? 0.5 : (v > 1 ? 1 : v); }

  // ------------------------------------------------------------- board shapes
  const SHAPES = {
    plein: ["########", "########", "########", "########", "########", "########", "########", "########"],
    coussin: ["..####..", "########", "########", "########", "########", "########", "########", "..####.."],
    losange: ["...##...", "..####..", ".######.", "########", "########", ".######.", "..####..", "...##..."],
    croix: ["...##...", "...##...", "########", "########", "########", "########", "...##...", "...##..."],
    sablier: ["########", ".######.", "..####..", "...##...", "...##...", "..####..", ".######.", "########"],
    ailes: ["##....##", "###..###", "########", "########", "########", "########", "###..###", "##....##"],
    cadre: ["########", "########", "##....##", "##....##", "##....##", "##....##", "########", "########"]
  };
  const SHAPE_KEYS = Object.keys(SHAPES);
  function shapeMask(key) {
    const art = SHAPES[key] || SHAPES.plein;
    const m = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      const s = art[r] || SHAPES.plein[r];
      for (let c = 0; c < COLS; c++) row.push(s.charAt(c) === "." ? 1 : 0);
      m.push(row);
    }
    return m;
  }

  // ----------------------------------------------------------------- tiers
  const TIER_NAMES = ["Normal", "Difficile", "Très difficile", "Extrême", "Légendaire"];
  // Points par coup d'un bon joueur, selon le nombre de types de pièces sur le plateau.
  // Mesuré avec GAME.__debug.probe([{types, moves}], runs) — recalibrer si la
  // génération du plateau change (voir README).
  const PPM_BY_TYPES = { 5: 200, 6: 115, 7: 70 };
  function ppmFor(nt) { return PPM_BY_TYPES[nt] || 95; }
  function tierOf(n) {
    if (n < 6) return 1;
    if (n >= 40 && n % 9 === 4) return 5;
    if (n % 13 === 0) return 4;
    if (n % 8 === 0) return 3;
    if (n % 5 === 0) return 2;
    return 1;
  }

  const MIXES = ["jelly", "collect", "blocker", "jelly_collect", "jelly_blocker", "collect_blocker", "score"];
  function archeOf(n) {
    if (n <= 4) return "score";
    if (n <= 8) return "jelly";
    if (n <= 12) return "collect";
    if (n <= 16) return "blocker";
    return MIXES[(n - 17) % MIXES.length];
  }

  const NAMES = [
    "Le premier panier", "Cueillette du matin", "Marché du village", "Petits fruits",
    "Gelée de juillet", "Verger en fleurs", "Potager du dimanche", "Cabas bien rempli",
    "La confiture", "Douceur d'automne", "Cagette de bois", "Récolte partagée",
    "Grand verger", "Vapeur de cuisine", "Le compost", "Graines de saison",
    "Coupe fraîche", "Tarte aux fruits", "Serre chaude", "Paniers croisés",
    "Le grand marché", "Racines profondes", "Trio de saison", "Douze mois",
    "Rouge comme une tomate", "Vert comme un poireau", "Cueillez mûr", "Le grand pressoir",
    "Compote maison", "Le garde-manger", "Champ de cucurbitacées", "Herbes du jardin",
    "Beaux légumes", "Fruits oubliés", "La corbeille d'or", "Récolte nocturne",
    "Le grand panier", "Ferme du plateau", "Couleurs d'été", "Réserve d'hiver",
    "Le labyrinthe vert", "Petits pois fins", "Légumes anciens", "La serre tropicale",
    "Kaki et compagnie", "Marché de nuit", "Le verger carré", "Baies sauvages",
    "Le dernier panier", "Terre et soleil", "Cueillette difficile", "L'abondance",
    "Le potager secret", "Fruits de la passion", "La grande gelée", "Course aux vitamines",
    "Le panier parfait", "Nuit de récolte", "Le festin", "La récolte légendaire"
  ];

  // ------------------------------------------------------- type selection
  function pickTypes(rnd, count) {
    const pool = (window.PRODUCTS || []).filter(function (p) {
      return p && p.n && window.AVATARS && window.AVATARS[p.n];
    }).map(function (p) { return p.n; });
    const out = [];
    if (!pool.length) return out;
    while (out.length < count && out.length < pool.length) {
      const n = pool[Math.floor(rnd() * pool.length)];
      if (out.indexOf(n) === -1) out.push(n);
    }
    return out;
  }

  // ------------------------------------------------------------- jelly blob
  function buildJelly(jelly, rnd, playable, n, tier) {
    const pcount = playable.length;
    const area = clamp01(pcount / 64);
    let want = Math.round((6 + (n - 5) * 0.5 + (tier - 1) * 2) * area);
    want = Math.max(4, Math.min(pcount, want));
    // a handful of levels flood the whole board instead of a blob
    const flood = n >= 10 && (n % 11 === 0);
    if (flood) want = pcount;
    const idx = playable.slice();
    // shuffle deterministically
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    const chosen = [];
    if (flood) {
      for (let i = 0; i < idx.length; i++) chosen.push(idx[i]);
    } else {
      // grow a blob: start anywhere, then repeatedly pick a random chosen cell and try
      // one of its orthogonal playable neighbours.
      const seed = playable[Math.floor(rnd() * playable.length)];
      const inSet = {};
      const set = [];
      const add = function (p) { inSet[p[0] + "," + p[1]] = 1; set.push(p); };
      add(seed);
      let guard = 0;
      while (set.length < want && guard++ < 800) {
        const from = set[Math.floor(rnd() * set.length)];
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const d = dirs[Math.floor(rnd() * 4)];
        const rr = from[0] + d[0], cc = from[1] + d[1];
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        if (!isPlayable(playable, rr, cc)) continue;
        if (inSet[rr + "," + cc]) continue;
        add([rr, cc]);
      }
      for (let i = 0; i < set.length; i++) chosen.push(set[i]);
    }
    let layers = 0;
    const dbl = !flood && (tier >= 3 || n >= 30);
    for (let i = 0; i < chosen.length; i++) {
      const p = chosen[i];
      const two = dbl && ((p[0] + p[1]) % 3 === 0);
      jelly[p[0]][p[1]] = two ? 2 : 1;
      layers += two ? 2 : 1;
    }
    return layers;
  }
  function isPlayable(playable, r, c) {
    for (let i = 0; i < playable.length; i++) if (playable[i][0] === r && playable[i][1] === c) return true;
    return false;
  }

  // ------------------------------------------------------------- blockers
  function buildBlockers(blockers, rnd, playable, n, tier, jelly) {
    const maxB = Math.min(Math.floor(playable.length * 0.15), 2 + Math.floor(n / 5) + (tier - 1));
    let want = Math.max(2, Math.min(9, maxB));
    const idx = playable.slice();
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    let layers = 0;
    let placed = 0;
    for (let i = 0; i < idx.length && placed < want; i++) {
      const r = idx[i][0], c = idx[i][1];
      if (r === 0 && c > 0) continue;             // keep the top row clear of crates
      const two = (tier >= 3 || n >= 34) && (placed % 3 === 2);
      blockers[r][c] = two ? 2 : 1;
      layers += two ? 2 : 1;
      placed++;
    }
    return layers;
  }

  // ------------------------------------------------------------- collect
  function buildCollect(tiles, rnd, n, playableCount) {
    const picks = [];
    const howMany = (n >= 20 && tiles.length >= 6 && n % 3 === 0) ? 2 : 1;
    const base = 7 + Math.floor(n * 0.22);
    const idx = tiles.slice();
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    for (let i = 0; i < howMany && i < idx.length; i++) {
      let need = base + (i ? 3 : 0);
      need = Math.max(4, Math.round(need * clamp01(playableCount / 64)));
      picks.push({ kind: "collect", type: idx[i], need: need });
    }
    return picks;
  }

  // ------------------------------------------------------------------ get
  const cache = {};
  const TOTAL = NAMES.length;

  function get(n) {
    n = Math.max(1, Math.min(TOTAL, n | 0));
    if (cache[n]) return cache[n];
    const rnd = mulberry32(hash32(n));
    const tier = tierOf(n);
    const arche = archeOf(n);

    let shape = "plein";
    if (n >= 9 && n % 6 === 3) shape = SHAPE_KEYS[1 + Math.floor(rnd() * (SHAPE_KEYS.length - 1))];
    const voids = shapeMask(shape);
    const playable = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!voids[r][c]) playable.push([r, c]);

    const nt = n >= 28 ? 7 : n >= 5 ? 6 : 5;
    const tiles = pickTypes(rnd, nt);

    const jelly = grid0(), blockers = grid0();
    const objectives = [];

    const wantScore = arche === "score";
    const wantJelly = arche.indexOf("jelly") >= 0;
    const wantCollect = arche.indexOf("collect") >= 0;
    const wantBlocker = arche.indexOf("blocker") >= 0;

    // Ordre de retrait déterministe (utilisé si l'objectif dépasse le budget de coups).
    const order = playable.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }

    if (wantJelly) buildJelly(jelly, rnd, playable, n, tier);
    const collectPicks = wantCollect ? buildCollect(tiles, rnd, n, playable.length) : [];
    if (wantBlocker) buildBlockers(blockers, rnd, playable, n, tier);

    function tally() {
      let lj = 0, lb = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { lj += jelly[r][c]; lb += blockers[r][c]; }
      let lc = 0;
      collectPicks.forEach(function (o) { lc += o.need; });
      return { lj: lj, lb: lb, lc: lc, w: lj * 1.5 + lc * 1.15 + lb * 4 };
    }
    // Un objectif trop gros pour le nombre de coups disponibles n'est jamais
    // terminable : on le réduit proportionnellement au budget de travail.
    // Le budget grandit avec le niveau (objectifs plus gros) tandis que la marge
    // de coups, elle, se resserre — c'est là que vient la difficulté.
    const WORK_CAP = 18 + Math.round(n * 0.25);
    let tot = tally();
    const shrink = tot.w > WORK_CAP ? WORK_CAP / tot.w : 1;
    if (shrink < 1) {
      const jTarget = Math.max(4, Math.round(tot.lj * shrink));
      let jl = tot.lj;
      for (let pass = 0; pass < 2 && jl > jTarget; pass++) {
        for (let i = 0; i < order.length && jl > jTarget; i++) {
          const r = order[i][0], c = order[i][1];
          if (pass === 0) { if (jelly[r][c] === 2) { jelly[r][c] = 1; jl--; } }
          else if (jelly[r][c] === 1) { jelly[r][c] = 0; jl--; }
        }
      }
      const bTarget = Math.max(2, Math.round(tot.lb * shrink));
      let bl = tot.lb;
      for (let pass = 0; pass < 2 && bl > bTarget; pass++) {
        for (let i = 0; i < order.length && bl > bTarget; i++) {
          const r = order[i][0], c = order[i][1];
          if (pass === 0) { if (blockers[r][c] === 2) { blockers[r][c] = 1; bl--; } }
          else if (blockers[r][c] === 1) { blockers[r][c] = 0; bl--; }
        }
      }
      tot = tally();
    }

    if (wantJelly) objectives.push({ kind: "jelly", need: tot.lj });
    collectPicks.forEach(function (o) {
      objectives.push({ kind: "collect", type: o.type, need: Math.max(4, Math.round(o.need * shrink)) });
    });
    if (wantBlocker) objectives.push({ kind: "blocker", need: tot.lb });

    let work = 0;
    objectives.forEach(function (o) {
      if (o.kind === "jelly") work += o.need * 1.5;
      else if (o.kind === "collect") work += o.need * 1.15;
      else if (o.kind === "blocker") work += o.need * 4;
    });

    let moves;
    if (wantScore) moves = n <= 2 ? 26 : n <= 4 ? 24 : 22;
    else moves = Math.round(Math.max(10, 24 - Math.round(n * 0.23)) + work);
    moves = Math.max(12, Math.min(48, moves));

    // Seuils d'étoiles. Sur un niveau "score", c'est le but à atteindre ; ailleurs
    // c'est un bonus (le niveau est gagné dès que l'objectif est rempli).
    const area = clamp01(playable.length / 64);
    const ppm = ppmFor(nt);
    let target;
    if (wantScore) {
      const f = 0.62 + Math.min(0.2, Math.max(0, (n - 22) * 0.007));
      target = round25(moves * ppm * f * (0.62 + 0.38 * area));
    } else {
      // Score typique au moment où l'objectif se termine (~90 points par unité de travail).
      target = round25(work * 90 * 0.85);
      if (tier >= 4) target = round25(target * 1.06);
    }
    if (wantScore) objectives.push({ kind: "score", need: target });

    const stars = [target, round25(target * 1.32), round25(target * 1.75)];

    const mode = objectives.map(function (o) {
      if (o.kind === "score") return "Score " + target;
      if (o.kind === "jelly") return "Gelée ×" + o.need;
      if (o.kind === "blocker") return "Cageots ×" + o.need;
      return "Récolter " + o.need + " " + o.type;
    }).join(" · ");

    const def = {
      n: n,
      name: NAMES[n - 1],
      mode: mode,
      hard: tier,
      tierName: TIER_NAMES[tier - 1],
      shape: shape,
      voids: voids,
      jelly: jelly,
      blockers: blockers,
      tiles: tiles,
      objectives: objectives,
      moves: moves,
      target: target,
      stars: stars
    };
    cache[n] = def;
    return def;
  }

  window.LEVELS = {
    total: TOTAL,
    get: get,
    tierName: function (n) { return TIER_NAMES[tierOf(n) - 1]; },
    tierOf: tierOf,
    shapes: SHAPE_KEYS
  };
})();
