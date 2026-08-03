"use strict";
/* POTRERO — motor.
 *
 * Matemática pura y determinista: mismo seed, misma carrera. Nada de DOM acá,
 * así node puede simular veinte temporadas en un test y verificar que la tabla
 * cierra, que la plata cuadra y que nadie tiene 130 de media.
 */
(function (global) {
  const D = (typeof module !== "undefined" && module.exports)
    ? require("./data.js") : global.PotreroData;

  /* --------------------------------------------------------------- utils */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  /* mulberry32: 32 bits de estado, serializable en el save. */
  function makeRng(seed) {
    let s = seed >>> 0;
    const api = {
      get state() { return s; },
      set state(v) { s = v >>> 0; },
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int(a, b) { return a + Math.floor(api.next() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(api.next() * arr.length)]; },
      chance(p) { return api.next() < p; },
      gauss(mu = 0, sd = 1) {
        const u = Math.max(api.next(), 1e-9), v = api.next();
        return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(api.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
      },
    };
    return api;
  }

  function poisson(rng, lam) {
    if (lam <= 0) return 0;
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L && k < 40);
    return k - 1;
  }

  /* ------------------------------------------------------------ jugadores */
  function media(p) {
    const w = D.POSITIONS[p.pos].w;
    let m = 0;
    for (const k in w) m += w[k] * p.attrs[k];
    return Math.round(m);
  }

  function nombre(rng, region) {
    if (region === "sud" && rng.chance(0.22)) return rng.pick(D.NAMES.sud.solo);
    const pool = D.NAMES[region] || D.NAMES.sud;
    return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
  }

  /* Media objetivo de un club según prestigio: de ~48 (Ate) a ~86 (Castilla). */
  function mediaObjetivo(prestige) { return 38 + prestige * 0.50; }

  let _pid = 1;
  function genPlayer(rng, { pos, age, target, region, clubId, leagueId }) {
    const m = clamp(Math.round(target + rng.gauss(0, 4)), 32, 94);
    const w = D.POSITIONS[pos].w;
    const attrs = {};
    /* Repartimos alrededor de la media: lo que el puesto pesa mucho sube,
     * lo que no pesa queda flojo. Un central rápido existe, pero es raro. */
    for (const k of ["rit", "tir", "pas", "reg", "def", "fis", "men"]) {
      const rel = w[k] / 0.25;                    // 1 = atributo central del puesto
      const off = (rel - 1) * 7 + rng.gauss(0, 6);
      attrs[k] = clamp(Math.round(m + off), 20, 97);
    }
    /* Ajuste exacto: los pesos de cada puesto suman 1, así que sumarle lo
     * mismo a todos los atributos corre la media exactamente esa cantidad.
     * Se repite un par de veces porque los topes 20/97 comen parte del ajuste. */
    const tmp = { pos, attrs };
    for (let paso = 0; paso < 4 && media(tmp) !== m; paso++) {
      const d = m - media(tmp);
      for (const k in attrs) attrs[k] = clamp(attrs[k] + d, 20, 97);
    }
    const potBonus = age < 21 ? rng.int(4, 18) : age < 25 ? rng.int(1, 9) : rng.int(0, 3);
    return {
      id: _pid++, name: nombre(rng, region), pos, age, region, clubId, leagueId,
      attrs, pot: clamp(m + potBonus, m, 97), fit: rng.int(88, 100), mor: rng.int(58, 82),
      form: 0, inj: null, wage: 0, years: rng.int(1, 4), xp: 0,
      st: { pj: 0, g: 0, a: 0, mvp: 0, am: 0, ro: 0, min: 0, rat: 0 },
    };
  }

  /* --------------------------------------------------------------- dinero */
  const TIER_WAGE = { 0: 95, 1: 240, 2: 620, 3: 3200, 4: 14000, 5: 34000 };

  /* El sueldo se mide contra el nivel de la propia liga, no contra una media
   * absoluta: el mejor de la Copa Perú sigue cobrando como amateur, y en la
   * élite la diferencia entre ser del montón y ser figura es exponencial. */
  function wageFor(club, m, age) {
    const tier = D.LEAGUES.find((l) => l.id === club.leagueId).tier;
    const pres = 0.55 + (club.prestige / 100) * 0.95;
    const mf = clamp(Math.exp((m - mediaObjetivo(club.prestige)) / 9), 0.25, 9);
    const af = age < 20 ? 0.55 : age < 23 ? 0.8 : age > 33 ? 0.75 : 1;
    return Math.max(40, Math.round(TIER_WAGE[tier] * pres * mf * af / 10) * 10);
  }

  function valueOf(p) {
    const m = media(p);
    const af = p.age <= 20 ? 1.35 : p.age <= 24 ? 1.5 : p.age <= 27 ? 1.2
      : p.age <= 30 ? 0.75 : p.age <= 33 ? 0.35 : 0.12;
    const pf = 1 + Math.max(0, p.pot - m) * 0.035;
    const base = Math.exp((m - 50) / 8.2) * 42000;
    return Math.round(base * af * pf / 1000) * 1000;
  }

  /* ---------------------------------------------------------------- mundo */
  function buildWorld(seed) {
    _pid = 1;
    const rng = makeRng(seed);
    const clubs = D.CLUBS.map((c, i) => ({
      id: i, leagueId: c[0], name: c[1], city: c[2], prestige: c[3],
      colors: [c[4], c[5]], squad: [], form: 0,
      titulos: { liga: 0, copa: 0, cont: 0 },
    }));
    const players = [null]; // índice 0 reservado para ti
    for (const club of clubs) {
      const league = D.LEAGUES.find((l) => l.id === club.leagueId);
      const target = mediaObjetivo(club.prestige);
      for (const pos of D.SQUAD_SHAPE) {
        const age = rng.int(18, 34);
        const q = target + (age < 21 ? -6 : age > 32 ? -3 : 0) + rng.gauss(0, 2.5);
        const p = genPlayer(rng, {
          pos, age, target: q, clubId: club.id, leagueId: club.leagueId,
          region: league.region === "eur" ? (rng.chance(0.25) ? "sud" : "eur") : "sud",
        });
        p.wage = wageFor(club, media(p), p.age);
        /* El id ES el índice del array. Invariante que los tests verifican:
         * sin esto, un jugador nuevo pisa el hueco de un retirado. */
        p.id = players.length;
        players.push(p);
        club.squad.push(p.id);
      }
    }
    return { clubs, players, rngState: rng.state };
  }

  /* Fuerza de un club: los 11 mejores + un plus por infraestructura. */
  function clubRating(state, clubId, opts = {}) {
    const club = state.clubs[clubId];
    const ps = club.squad.map((id) => state.players[id])
      .filter((p) => p && (!p.inj || opts.ignoreInj) && p.id !== opts.without);
    const ms = ps.map((p) => media(p) + (p.fit - 92) * 0.08 + p.form * 0.8).sort((a, b) => b - a).slice(0, 11);
    if (!ms.length) return 40;
    const avg = sum(ms) / ms.length;
    return avg * 0.86 + club.prestige * 0.145 + club.form * 0.5;
  }

  /* Goles esperados de cada lado. Se exportan aparte porque el partido del DT
   * se juega en dos mitades: un Poisson se parte en dos Poisson de λ/2, así
   * que el segundo tiempo se simula sin inflar el marcador. */
  function lambdas(rH, rA, neutral) {
    const d = (rH - rA) + (neutral ? 0 : 3.1);
    return {
      h: clamp(1.32 * Math.exp(d / 17), 0.12, 6),
      a: clamp(1.14 * Math.exp(-d / 17), 0.10, 6),
    };
  }

  function simMatch(rng, rH, rA, neutral) {
    const l = lambdas(rH, rA, neutral);
    return { gh: poisson(rng, l.h), ga: poisson(rng, l.a) };
  }

  function simTiempo(rng, rH, rA, neutral, share) {
    const l = lambdas(rH, rA, neutral);
    return { gh: poisson(rng, l.h * share), ga: poisson(rng, l.a * share) };
  }

  /* --------------------------------------------------------- calendarios */
  /* Round robin clásico (método del círculo). Devuelve rondas de pares. */
  function roundRobin(ids) {
    const n = ids.length;
    const arr = ids.slice();
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const h = arr[i], a = arr[n - 1 - i];
        pairs.push(r % 2 === 0 ? [h, a] : [a, h]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());     // rota todos menos el primero
    }
    return rounds;
  }

  function makeSchedule(rng, ids) {
    const base = roundRobin(rng.shuffle(ids));
    const vuelta = base.map((rd) => rd.map(([h, a]) => [a, h]));
    return base.concat(vuelta);        // 22 fechas con 12 equipos
  }

  const emptyRow = (clubId) => ({ clubId, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });

  function applyResult(table, h, a, gh, ga) {
    const rh = table.find((r) => r.clubId === h), ra = table.find((r) => r.clubId === a);
    rh.pj++; ra.pj++; rh.gf += gh; rh.gc += ga; ra.gf += ga; ra.gc += gh;
    if (gh > ga) { rh.g++; ra.p++; rh.pts += 3; }
    else if (gh < ga) { ra.g++; rh.p++; ra.pts += 3; }
    else { rh.e++; ra.e++; rh.pts++; ra.pts++; }
  }

  const sortTable = (t) => t.slice().sort((x, y) =>
    y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf || x.clubId - y.clubId);

  /* ------------------------------------------------- progresión y físico */
  function ageMult(age) {
    if (age <= 18) return 1.25; if (age <= 21) return 1.3; if (age <= 24) return 0.95;
    if (age <= 27) return 0.55; if (age <= 30) return 0.28; return 0.12;
  }

  /* Sube atributos hacia el potencial. Devuelve las subidas aplicadas. */
  function train(rng, p, attrs, intensity, prof) {
    const m = media(p);
    const room = clamp((p.pot - m) / 12, 0.06, 1);
    const gain = intensity * ageMult(p.age) * room * (0.7 + prof * 0.3) * 0.52;
    const out = {};
    if (!attrs.length || gain <= 0) return out;
    for (const k of attrs) {
      const g = gain / attrs.length * (0.7 + rng.next() * 0.6);
      p.attrs[k] = clamp(p.attrs[k] + g, 20, 99);
      out[k] = (out[k] || 0) + g;
    }
    return out;
  }

  /* Declive físico: empieza a los 29 y no perdona. */
  function declive(p, weeks = 1) {
    if (p.age < 29) return;
    const k = (p.age - 28) * 0.014 * weeks;
    p.attrs.rit = clamp(p.attrs.rit - k, 20, 99);
    p.attrs.fis = clamp(p.attrs.fis - k * 0.8, 20, 99);
    p.attrs.men = clamp(p.attrs.men + k * 0.35, 20, 99);   // la cabeza sí mejora
  }

  function injuryRoll(rng, p, minutos, resist) {
    if (!minutos) return null;
    const base = 0.028 * (minutos / 90);
    const fitPenal = clamp((88 - p.fit) / 100, 0, 0.45);
    const edad = p.age > 30 ? (p.age - 30) * 0.004 : 0;
    const fis = (70 - p.attrs.fis) * 0.0007;
    const pr = clamp(base + fitPenal * 0.09 + edad + fis - resist * 0.012, 0.004, 0.30);
    if (!rng.chance(pr)) return null;
    /* Ponderado por gravedad: los golpes tontos son el pan de cada día y la
     * rotura de ligamentos tiene que ser la desgracia rara que es. */
    const pesos = D.LESIONES.map((x) => 1 / ((x.w[0] + x.w[1]) / 2));
    const total = pesos.reduce((a, b) => a + b, 0);
    const tirada = rng.next() * total;
    let acum = 0, l = D.LESIONES[0];
    for (let i = 0; i < D.LESIONES.length; i++) {
      acum += pesos[i];
      if (tirada <= acum) { l = D.LESIONES[i]; break; }
    }
    const sev = rng.next();
    const weeks = Math.max(1, Math.round(l.w[0] + (l.w[1] - l.w[0]) * sev * sev));
    return { name: l.n, weeks };
  }

  /* ------------------------------------------- tu rendimiento en el partido */
  /* Nota 1-10 estilo diario deportivo, y de ahí salen goles y asistencias. */
  function perfRoll(rng, p, ctx) {
    const m = media(p);
    const base = m
      + p.form * 1.6
      + (p.mor - 70) * 0.10
      + (p.fit - 92) * 0.14
      + (ctx.local ? 1.2 : -0.8)
      - (ctx.rivalRating - ctx.equipoRating) * 0.22
      + (ctx.adaptacion != null ? (ctx.adaptacion - 100) * 0.06 : 0);
    const perf = base + rng.gauss(0, 6.5);
    return perf;
  }

  function ratingFrom(perf, m, ev) {
    let r = 6.0 + (perf - m) * 0.085;
    r += (ev.gol || 0) * 0.85 + (ev.asi || 0) * 0.5 + (ev.atajada || 0) * 0.6;
    r -= (ev.amarilla || 0) * 0.25 + (ev.roja || 0) * 1.6;
    r += (ev.bonus || 0);
    return clamp(r1(r), 3.0, 10.0);
  }

  /* Minutos: el técnico no te regala nada. */
  function minutosFor(rng, state, p, confianza) {
    if (p.inj) return 0;
    const club = state.clubs[p.clubId];
    const rivales = club.squad
      .map((id) => state.players[id])
      .filter((q) => q && q.id !== p.id && !q.inj && D.POSITIONS[q.pos].line === D.POSITIONS[p.pos].line);
    const mejores = rivales.map((q) => media(q)).sort((a, b) => b - a);
    const cupos = { por: 1, def: 4, med: 4, atk: 3 }[D.POSITIONS[p.pos].line];
    const corte = mejores[cupos - 1] != null ? mejores[cupos - 1] : 0;
    const edge = media(p) + confianza * 0.14 + p.form * 1.2 + (p.fit - 90) * 0.05 - corte;
    const pTit = clamp(0.5 + edge * 0.075, 0.02, 0.97);
    if (rng.chance(pTit)) return rng.chance(0.22) ? rng.int(55, 85) : 90;
    if (rng.chance(clamp(0.30 + edge * 0.04, 0.05, 0.8))) return rng.int(8, 35);
    return 0;
  }

  /* --------------------------------------------------------- inversiones */
  function investTick(rng, inv, mult) {
    const d = D.INVESTMENTS.find((i) => i.id === inv.id);
    const drift = d.drift * (mult || 1);
    const r = drift + d.vol * rng.gauss(0, 1);
    inv.value = Math.max(0, inv.value * (1 + r));
    inv.last = r;
    return r;
  }

  const Exported = {
    clamp, r1, sum, makeRng, poisson, media, nombre, mediaObjetivo, genPlayer,
    wageFor, valueOf, buildWorld, clubRating, simMatch, roundRobin, makeSchedule,
    emptyRow, applyResult, sortTable, ageMult, train, declive, injuryRoll, lambdas, simTiempo,
    perfRoll, ratingFrom, minutosFor, investTick, TIER_WAGE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Exported;
  else global.PotreroEngine = Exported;
})(typeof window !== "undefined" ? window : globalThis);
