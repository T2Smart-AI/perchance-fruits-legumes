(function () {
  const PRODUCTS = window.PRODUCTS || [];
  const AVATARS = window.AVATARS || {};
  const BANNERS = window.BANNERS || {};
  const NUTRITION = window.NUTRITION || {};

  const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const GROUP_LABEL = { saisonnier: "Saisonnier", exotique: "Exotique", ancien: "Ancien" };

  const state = {
    tab: "home",
    cat: "tous",
    group: "tous",
    season: "tous",
    q: "",
    month: new Date().getMonth() + 1,
    scrollY: 0
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function $id(id) { return document.getElementById(id); }

  function seasonOf(p, m) {
    if (p.always) return "toute";
    if (p.m && p.m.includes(m)) return "saison";
    if (p.mc && p.mc.includes(m)) return "conserve";
    return "hors";
  }

  function monthStrip(p) {
    let h = '<div class="mstrip">';
    for (let i = 1; i <= 12; i++) {
      let cls = "d";
      if (p.always) cls += " on";
      else if (p.m && p.m.includes(i)) cls += " on";
      else if (p.mc && p.mc.includes(i)) cls += " con";
      h += '<span class="' + cls + '"></span>';
    }
    return h + "</div>";
  }

  function badge(p) {
    if (p.always) return '<span class="badge b-toute">Toute l\'année</span>';
    if (p.group === "exotique") return '<span class="badge b-exo">Exotique</span>';
    if (p.group === "ancien") return '<span class="badge b-ancien">Ancien</span>';
    const s = seasonOf(p, state.month);
    if (s === "saison") return '<span class="badge b-saison">En saison</span>';
    if (s === "conserve") return '<span class="badge b-conserve">Conservé</span>';
    return "";
  }

  function card(p) {
    const av = AVATARS[p.n] ? '<img class="thumb" src="' + AVATARS[p.n] + '" alt="' + esc(p.n) + '" loading="lazy">' : "";
    return '<div class="card" data-name="' + esc(p.n) + '">' + badge(p) + av +
      '<div class="name">' + esc(p.n) + '</div>' +
      '<div class="meta">' + esc(p.origin || "") + '</div>' +
      monthStrip(p) + '</div>';
  }

  function normS(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  function searchText(p) {
    const nu = NUTRITION[p.n] || {};
    return normS([p.n, p.origin, p.cat, GROUP_LABEL[p.group] || p.group, p.d, nu.sci, nu.f].join(" "));
  }
  const searchCache = {};
  function searchKey(p) {
    const k = p.n;
    if (!searchCache[k]) searchCache[k] = searchText(p);
    return searchCache[k];
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return PRODUCTS.filter(function (p) {
      if (state.cat !== "tous" && p.cat.toLowerCase() !== state.cat) return false;
      if (state.group !== "tous" && p.group !== state.group) return false;
      if (state.season === "saison" && !(p.always || (p.m && p.m.includes(state.month)))) return false;
      if (state.season === "hors" && (p.always || (p.m && p.m.includes(state.month)) || (p.mc && p.mc.includes(state.month)))) return false;
      if (q && searchKey(p).indexOf(normS(q)) === -1) return false;
      return true;
    });
  }

  function renderHeaderAvatars() {
    const pool = PRODUCTS.filter(function (p) { return AVATARS[p.n]; });
    const picked = [];
    while (picked.length < 10 && pool.length) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      if (picked.indexOf(p) === -1) picked.push(p);
    }
    $id("headerAvatars").innerHTML = picked.map(function (p) {
      return '<img src="' + AVATARS[p.n] + '" alt="' + esc(p.n) + '">';
    }).join("");
  }

  function makeChips(containerId, items, currentKey, onPick) {
    const el = $id(containerId);
    el.innerHTML = items.map(function (it) {
      return '<button class="chip' + (it.key === currentKey ? " active" : "") + '" data-key="' + it.key + '">' + esc(it.label) + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        onPick(b.dataset.key);
        el.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
  }

  function renderAlmanach() {
    const list = filtered();
    $id("countLine").textContent = list.length + " produit" + (list.length > 1 ? "s" : "") + " affiché" + (list.length > 1 ? "s" : "");
    $id("almanachGrid").innerHTML = list.length
      ? list.map(card).join("")
      : '<div class="empty">Aucun produit ne correspond &agrave; votre recherche.</div>';
  }

  function renderCalendar() {
    const m = state.month;
    $id("monthName").textContent = MONTHS[m - 1];
    const plein = PRODUCTS.filter(function (p) { return p.always || (p.m && p.m.includes(m)); });
    const conserve = PRODUCTS.filter(function (p) {
      return !(p.always || (p.m && p.m.includes(m))) && (p.mc && p.mc.includes(m));
    });
    let h = '<div class="cal-group">Pleine saison &mdash; ' + plein.length + " produit" + (plein.length > 1 ? "s" : "") + "</div>";
    h += '<div class="grid">' + (plein.length ? plein.map(card).join("") : '<div class="empty">Rien cette fois&hellip;</div>') + "</div>";
    if (conserve.length) {
      h += '<div class="cal-group">Conserv&eacute; / disponible &mdash; ' + conserve.length + " produit" + (conserve.length > 1 ? "s" : "") + "</div>";
      h += '<div class="grid">' + conserve.map(card).join("") + "</div>";
    }
    $id("calendarBody").innerHTML = h;
  }

  function renderLocal() {
    $id("localBody").innerHTML = window.LOCAL_HTML || "";
  }

  const TIPS = [
    "Les légumes racines (carottes, panais, betteraves) se conservent des semaines dans un endroit frais et sombre.",
    "Achetez les fruits à la couleur et au parfum plutôt qu'à la taille : les plus gros ne sont pas les plus goûteux.",
    "Congelez les herbes fraîches hachées dans des bacs à glaçons avec un peu d'huile d'olive.",
    "Privilégiez les circuits courts : un produit local parcourt en moyenne 10 fois moins de kilomètres qu'un importé.",
    "Les pommes et poires mûrissent après la cueillette : gardez-les à température ambiante, séparément.",
    "Lavez les champignons sans les tremper : un passage rapide sous l'eau, puis séchez-les aussitôt.",
    "Les légumes verts perdent leurs vitamines à la cuisson longue : préférez la vapeur ou le wok.",
    "En automne, les cucurbitacées se conservent plusieurs mois dans une pièce sèche et fraîche.",
    "Un produit de saison et local est souvent plus goûteux et moins cher : la nature fait le travail.",
    "Épluchez les carottes juste avant de les cuisiner : leurs vitamines vivent sous la peau."
  ];

  function scard(p) {
    const av = AVATARS[p.n] ? '<img class="s-av" src="' + AVATARS[p.n] + '" alt="' + esc(p.n) + '" loading="lazy">' : "";
    return '<div class="scard" data-name="' + esc(p.n) + '">' + av + '<div class="s-name">' + esc(p.n) + "</div></div>";
  }

  function renderHome() {
    const m = state.month;
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const plein = PRODUCTS.filter(function (p) { return p.always || (p.m && p.m.includes(m)); });
    const conserve = PRODUCTS.filter(function (p) {
      return !(p.always || (p.m && p.m.includes(m))) && (p.mc && p.mc.includes(m));
    });
    const tip = TIPS[Math.floor(now.getTime() / 86400000) % TIPS.length];

    let h = '<div class="home-hero">' +
      '<div class="hh-label">' + esc(dateStr) + "</div>" +
      '<div class="hh-month">' + esc(MONTHS[m - 1]) + "</div>" +
      '<div class="hh-count"><b>' + plein.length + "</b> produit" + (plein.length > 1 ? "s" : "") + " en pleine saison ce mois-ci</div>" +
      '<button class="hh-btn" data-go="calendrier">Voir le calendrier</button>' +
      '<button class="hh-btn hh-btn2" data-go="random">Surprenez-moi&nbsp;!</button>' +
      "</div>";

    const cats = [
      { key: "fruit", label: "Fruits" },
      { key: "légume", label: "Légumes" },
      { key: "aromatique", label: "Aromatiques" }
    ];
    cats.forEach(function (c) {
      const list = plein.filter(function (p) { return p.cat.toLowerCase() === c.key; });
      if (!list.length) return;
      h += '<div class="strip-title">' + c.label + ' <small>&mdash; ' + list.length + " en saison</small></div>";
      h += '<div class="strip">' + list.map(scard).join("") + "</div>";
    });

    if (conserve.length) {
      h += '<div class="strip-title">Conserv&eacute;s ce mois-ci <small>&mdash; ' + conserve.length + "</small></div>";
      h += '<div class="strip">' + conserve.map(scard).join("") + "</div>";
    }

    h += '<div class="tip-card"><div class="d-label">Le conseil du jour</div><p>' + esc(tip) + "</p></div>";

    $id("homeBody").innerHTML = h;
    $id("homeBody").querySelectorAll(".strip").forEach(function (s) {
      if (s.scrollWidth > s.clientWidth + 4) s.classList.add("overflow");
    });
  }

  function section(title, inner) {
    return '<div class="d-section"><h3>' + esc(title) + "</h3>" + inner + "</div>";
  }
  function para(text) {
    return "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>";
  }

  function fmtN(v) {
    if (v == null) return "";
    const r = Math.round(v * 100) / 100;
    return String(r).replace(".", ",");
  }
  const NUT_SCALE = { c: 30, s: 20, p: 20, l: 65, fib: 25 };
  function nutBar(pct) {
    return '<div class="nt-bar"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%"></i></div>';
  }
  const NUT_REF = { vitc: [80, "Vitamine C"], vita: [800, "Vitamine A"], vitb9: [200, "Vitamine B9"], vite: [12, "Vitamine E"], kp: [2000, "Potassium"], ca: [800, "Calcium"], fe: [14, "Fer"], mg: [375, "Magnésium"], zn: [10, "Zinc"], fib: [25, "Fibres"] };
  function nutHighlights(nu) {
    const pct = [];
    for (const k in NUT_REF) {
      const v = nu[k];
      if (v == null) continue;
      pct.push({ l: NUT_REF[k][1], p: Math.round((v / NUT_REF[k][0]) * 100) });
    }
    pct.sort(function (a, b) { return b.p - a.p; });
    const top = pct.filter(function (x) { return x.p >= 15; }).slice(0, 3);
    if (!top.length) return "";
    return '<div class="nh-head">Points forts nutritionnels</div><div class="nh-wrap">' +
      top.map(function (x) { return '<span class="nh-chip"><b>' + esc(x.l) + "</b> " + x.p + " %</span>"; }).join("") + "</div>";
  }

  function nutritionSection(p) {
    const nu = NUTRITION[p.n];
    if (!nu) return "";
    const tiles = [
      nu.k != null && !p.kc ? { l: "Énergie", v: fmtN(nu.k), u: "kcal / 100 g", bar: nu.k / 2.5 } : null,
      { l: "Glucides", v: fmtN(nu.c), u: "g / 100 g", bar: (nu.c / NUT_SCALE.c) * 100 },
      { l: "Sucres", v: fmtN(nu.s), u: "g / 100 g", bar: (nu.s / NUT_SCALE.s) * 100 },
      { l: "Fibres", v: fmtN(nu.fib), u: "g / 100 g", bar: (nu.fib / NUT_SCALE.fib) * 100 },
      { l: "Protéines", v: fmtN(nu.p), u: "g / 100 g", bar: (nu.p / NUT_SCALE.p) * 100 },
      { l: "Lipides", v: fmtN(nu.l), u: "g / 100 g", bar: (nu.l / NUT_SCALE.l) * 100 }
    ].filter(function (t) { return t && t.v !== ""; });
    let grid = '<div class="nut-grid">' + tiles.map(function (t) {
      return '<div class="nut-tile"><div class="nt-l">' + t.l + '</div><div class="nt-v">' + t.v +
        '</div><div class="nt-u">' + t.u + "</div>" + nutBar(t.bar) + "</div>";
    }).join("") + "</div>";
    const hl = nutHighlights(nu);
    let botRows = "";
    if (nu.sci) botRows += '<div class="nut-bot-row"><span>Nom scientifique</span><b><i>' + esc(nu.sci) + "</i></b></div>";
    if (nu.f) botRows += '<div class="nut-bot-row"><span>Famille</span><b>' + esc(nu.f) + "</b></div>";
    if (nu.o) botRows += '<div class="nut-bot-row"><span>Ordre</span><b>' + esc(nu.o) + "</b></div>";
    if (nu.g) botRows += '<div class="nut-bot-row"><span>Genre</span><b><i>' + esc(nu.g) + "</i></b></div>";
    const bot = botRows ? '<div class="nut-bot"><div class="nut-bot-head">Classification botanique</div>' + botRows + "</div>" : "";
    const src = nu.src === "ref"
      ? 'Source : <a href="https://www.fruityvice.com/" target="_blank" rel="noopener">FruityVice</a> + valeurs de r&eacute;f&eacute;rence &mdash; valeurs indicatives.'
      : 'Source : <a href="https://ciqual.anses.fr/" target="_blank" rel="noopener">Table Ciqual 2025 &mdash; Anses</a> (licence ouverte) &mdash; valeurs indicatives.';
    return '<div class="d-section"><h3>Valeurs nutritionnelles <small>pour 100 g</small></h3>' + grid + hl + bot +
      '<div class="nut-src">' + src + "</div></div>";
  }

  function seasonText(p) {
    if (p.always) return "Disponible toute l'année (souvent importé).";
    const ins = (p.m || []).slice().sort(function (a, b) { return a - b; });
    const cons = (p.mc || []).slice().sort(function (a, b) { return a - b; });
    let out = "";
    if (ins.length) out += "Pleine saison : " + ins.map(function (x) { return MONTHS[x - 1]; }).join(", ") + ".";
    if (cons.length) out += " Disponible en conservation : " + cons.map(function (x) { return MONTHS[x - 1]; }).join(", ") + ".";
    if (!out) out = "Produit hors saison (importé).";
    return out;
  }

  function openDetail(n) {
    const p = PRODUCTS.find(function (x) { return x.n === n; });
    if (!p) return;
    const banner = $id("detailBanner");
    const body = $id("detailBody");
    const bimg = BANNERS[p.n] ? '<img class="d-banner-img" src="' + BANNERS[p.n] + '" alt="">' : "";
    const av = AVATARS[p.n] ? '<img class="d-avatar" src="' + AVATARS[p.n] + '" alt="' + esc(p.n) + '">' : "";
    const tags = '<span class="d-tag">' + esc(p.cat) + "</span>" +
      (GROUP_LABEL[p.group] ? '<span class="d-tag">' + esc(GROUP_LABEL[p.group]) + "</span>" : "") +
      (p.origin ? '<span class="d-tag">' + esc(p.origin) + "</span>" : "");
    banner.innerHTML = bimg + '<div class="d-banner-shade"></div><div class="d-head">' + av +
      '<div class="d-titlebox"><h2>' + esc(p.n) + "</h2><div class=\"d-tags\">" + tags + "</div></div></div>";

    let h = '<div class="d-row">' +
      '<div class="d-season"><div class="d-label">Saison</div>' + monthStrip(p) +
      '<div class="d-season-text">' + esc(seasonText(p)) + "</div></div>";
    if (p.kc) {
      h += '<div class="d-kcal"><div class="d-label">&Eacute;nergie</div><div class="kc-v">' + p.kc + '<span> kcal / 100 g</span></div></div>';
    }
    h += "</div>";
    h += nutritionSection(p);
    h += section("La description", para(p.d || ""));
    if (p.b && p.b.length) h += section("Bienfaits", "<ul>" + p.b.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>");
    if (p.a && p.a.length) h += section("Astuces", "<ul>" + p.a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>");
    if (p.pc) h += section("Choix & achat", para(p.pc));
    if (p.cons) h += section("Conservation", para(p.cons));
    if (p.f) h += '<div class="d-fact"><div class="d-label">Le saviez-vous ?</div>' + para(p.f) + "</div>";

    body.innerHTML = h;
    const ov = $id("detailOverlay");
    ov.classList.add("open");
    ov.scrollTop = 0;
    document.body.style.overflow = "hidden";
  }

  function closeDetail() {
    $id("detailOverlay").classList.remove("open");
    document.body.style.overflow = "";
    window.scrollTo(0, state.scrollY);
  }

  function setTab(t) {
    state.tab = t;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === t);
    });
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + t);
    });
    if (t === "home") renderHome();
    if (t === "almanach") renderAlmanach();
    if (t === "calendrier") renderCalendar();
    if (t === "jeu" && window.GAME) window.GAME.ensureBoard();
    if (t === "local") renderLocal();
    window.scrollTo(0, 0);
  }

  function init() {
    renderHeaderAvatars();
    makeChips("catChips", [
      { key: "tous", label: "Tous" },
      { key: "fruit", label: "Fruits" },
      { key: "légume", label: "Légumes" },
      { key: "aromatique", label: "Aromatiques" }
    ], state.cat, function (k) { state.cat = k; renderAlmanach(); });
    makeChips("groupChips", [
      { key: "tous", label: "Toutes origines" },
      { key: "saisonnier", label: "Saisonniers" },
      { key: "exotique", label: "Exotiques" },
      { key: "ancien", label: "Anciens" }
    ], state.group, function (k) { state.group = k; renderAlmanach(); });
    makeChips("seasonChips", [
      { key: "tous", label: "Toute la saison" },
      { key: "saison", label: "En saison en " + MONTHS[state.month - 1] },
      { key: "hors", label: "Hors saison" }
    ], state.season, function (k) { state.season = k; renderAlmanach(); });

    $id("searchInput").addEventListener("input", function (e) {
      state.q = e.target.value;
      renderAlmanach();
    });

    $id("almanachGrid").addEventListener("click", function (e) {
      const c = e.target.closest(".card");
      if (c) openDetail(c.dataset.name);
    });
    $id("calendarBody").addEventListener("click", function (e) {
      const c = e.target.closest(".card");
      if (c) openDetail(c.dataset.name);
    });
    $id("monthPrev").addEventListener("click", function () {
      state.month = state.month === 1 ? 12 : state.month - 1;
      renderCalendar();
    });
    $id("monthNext").addEventListener("click", function () {
      state.month = state.month === 12 ? 1 : state.month + 1;
      renderCalendar();
    });
    $id("detailClose").addEventListener("click", closeDetail);

    $id("homeBody").addEventListener("click", function (e) {
      const go = e.target.closest("[data-go]");
      if (go) {
        if (go.dataset.go === "random") {
          const pool = PRODUCTS.filter(function (p) { return AVATARS[p.n]; });
          openDetail(pool[Math.floor(Math.random() * pool.length)].n);
        } else {
          setTab(go.dataset.go);
        }
        return;
      }
      const c = e.target.closest(".scard");
      if (c) openDetail(c.dataset.name);
    });

    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.dataset.view); });
    });

    renderHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
