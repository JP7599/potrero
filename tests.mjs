/* POTRERO tests — node tests.mjs
 *
 * Lo que se verifica: que la matemática cierre (tablas, calendarios, plata),
 * que el mundo no se corrompa después de treinta temporadas, y que una carrera
 * entera se pueda jugar de principio a fin sin romperse.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("./docs/data.js");
const E = require("./docs/engine.js");
const C = require("./docs/career.js");

let passed = 0, failed = 0;
const ok = (c, n) => { if (c) { passed++; console.log(`  ok ${n}`); } else { failed++; console.error(`  FAIL ${n}`); } };
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

/* Política determinista para jugar carreras enteras en los tests. */
function jugar(seed, opciones = {}) {
  const s = C.nuevaPartida({ seed, nombre: "Test", pos: opciones.pos || "DC", perfil: opciones.perfil || "crack" });
  let i = 0;
  const rnd = (n) => Math.floor(((Math.sin(++i * 12.9898) * 43758.5453) % 1 + 1) % 1 * n);
  let pasos = 0;
  const visto = {};
  while (s.pendiente && s.pendiente.tipo !== "fin" && pasos < 40000) {
    const pd = s.pendiente;
    visto[pd.tipo] = (visto[pd.tipo] || 0) + 1;
    let k;
    switch (pd.tipo) {
      case "accion": {
        const p = C.yo(s);
        k = pd.opts.findIndex((o) => o.accion === (p.inj ? "fisio" : p.fit < 60 ? "descanso" : "tecnica"));
        break;
      }
      case "mercado": k = 0; break;
      case "retiro": k = pd.opts.length > 1 ? (C.yo(s).age >= 33 ? 0 : 1) : 0; break;
      case "licencia": case "dt_oferta": k = 0; break;
      default: k = rnd(Math.max(1, (pd.opts || []).length));
    }
    if (k == null || k < 0 || k >= (pd.opts || []).length) k = 0;
    if (opciones.cada) opciones.cada(s, pd);
    C.resolver(s, k);
    pasos++;
  }
  return { s, pasos, visto };
}

/* ------------------------------------------------------------------ motor */
console.log("\nmotor: azar y jugadores");
{
  const a = E.makeRng(42), b = E.makeRng(42);
  ok(a.next() === b.next() && a.next() === b.next(), "el mismo seed da la misma secuencia");
  const r = E.makeRng(1);
  const xs = Array.from({ length: 4000 }, () => r.next());
  ok(xs.every((x) => x >= 0 && x < 1), "el rng vive en [0,1)");
  ok(cerca(xs.reduce((x, y) => x + y, 0) / xs.length, 0.5, 0.02), "la media del rng es ~0.5");

  const lam = 1.4;
  const gs = Array.from({ length: 8000 }, () => E.poisson(r, lam));
  ok(cerca(gs.reduce((x, y) => x + y, 0) / gs.length, lam, 0.08), "poisson tiene media λ");

  const p = E.genPlayer(r, { pos: "DC", age: 22, target: 70, region: "sud", clubId: 0, leagueId: "pe" });
  /* genPlayer mete ruido a propósito (dos jugadores del mismo club no son
   * iguales), así que lo que tiene que dar es el promedio, no cada tirada. */
  const muestras = Array.from({ length: 2000 }, () =>
    E.media(E.genPlayer(r, { pos: "DC", age: 22, target: 70, region: "sud", clubId: 0, leagueId: "pe" })));
  const prom = muestras.reduce((x, y) => x + y, 0) / muestras.length;
  ok(cerca(prom, 70, 0.4), `genPlayer centra la media donde se le pide (${prom.toFixed(2)})`);
  ok(muestras.every((v) => Math.abs(v - 70) < 20), "y el ruido no se va de mambo");
  ok(Object.values(p.attrs).every((v) => v >= 20 && v <= 97), "ningún atributo se sale de rango");
  ok(p.pot >= E.media(p), "el potencial nunca es menor que la media");
}

console.log("\nmotor: plata");
{
  const club = { leagueId: "eu1", prestige: 90 };
  const chico = { leagueId: "pe", prestige: 25 };
  ok(E.wageFor(club, 80, 26) > E.wageFor(club, 70, 26), "más media, más sueldo");
  ok(E.wageFor(club, 75, 26) > E.wageFor(chico, 75, 26), "el mismo jugador cobra más en la élite");
  ok(E.wageFor(chico, 40, 19) >= 40, "hay un sueldo mínimo");
  const distrital = { leagueId: "pe3", prestige: 8 };
  ok(E.wageFor(distrital, 45, 18) < E.wageFor(chico, 45, 18), "en la Copa Perú se cobra menos que en Segunda");
  ok(E.wageFor({ leagueId: "eu1", prestige: 95 }, 88, 26) > 100 * E.wageFor(distrital, 45, 18), "de la tierra a la élite hay dos órdenes de magnitud");
  const joven = { pos: "DC", age: 21, attrs: { rit: 80, tir: 80, pas: 70, reg: 78, def: 40, fis: 75, men: 70 }, pot: 92 };
  const viejo = { ...joven, age: 34, pot: 80 };
  ok(E.valueOf(joven) > E.valueOf(viejo) * 3, "un pibe con proyección vale mucho más que un veterano igual");
}

console.log("\nmotor: calendario");
{
  const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const rr = E.roundRobin(ids);
  ok(rr.length === 11, `12 equipos = 11 fechas (${rr.length})`);
  ok(rr.every((f) => f.length === 6), "6 partidos por fecha");
  ok(rr.every((f) => new Set(f.flat()).size === 12), "nadie juega dos veces en la misma fecha");
  const cruces = new Set();
  for (const f of rr) for (const [h, a] of f) cruces.add([h, a].sort((x, y) => x - y).join("-"));
  ok(cruces.size === 66, `todos contra todos una vez (${cruces.size}/66)`);

  const cal = E.makeSchedule(E.makeRng(3), ids);
  ok(cal.length === 22, "ida y vuelta = 22 fechas");
  const pj = {}, loc = {};
  for (const f of cal) for (const [h, a] of f) { pj[h] = (pj[h] || 0) + 1; pj[a] = (pj[a] || 0) + 1; loc[h] = (loc[h] || 0) + 1; }
  ok(ids.every((i) => pj[i] === 22), "cada club juega 22 partidos");
  ok(ids.every((i) => loc[i] === 11), "cada club es local 11 veces");
}

console.log("\nmotor: partidos");
{
  const r = E.makeRng(9);
  let mejor = 0, peor = 0, empates = 0;
  for (let i = 0; i < 3000; i++) {
    const m = E.simMatch(r, 82, 68, true);
    if (m.gh > m.ga) mejor++; else if (m.ga > m.gh) peor++; else empates++;
  }
  ok(mejor > peor * 3, `el equipo muy superior gana bastante más (${mejor} vs ${peor}, ${empates} empates)`);
  ok(peor > 30, "pero el chico gana de vez en cuando: no hay resultados cantados");

  let localGana = 0, visitaGana = 0;
  for (let i = 0; i < 3000; i++) {
    const m = E.simMatch(r, 70, 70, false);
    if (m.gh > m.ga) localGana++; else if (m.ga > m.gh) visitaGana++;
  }
  ok(localGana > visitaGana, `de local se gana más (${localGana} vs ${visitaGana})`);

  /* Un partido partido en dos mitades tiene los mismos goles esperados que
   * uno entero: si esto se rompe, el modo DT queda desbalanceado. */
  let entero = 0, mitades = 0;
  for (let i = 0; i < 6000; i++) {
    entero += E.simMatch(r, 75, 72, false).gh;
    mitades += E.simTiempo(r, 75, 72, false, 0.5).gh + E.simTiempo(r, 75, 72, false, 0.5).gh;
  }
  ok(cerca(entero / 6000, mitades / 6000, 0.08), `dos mitades = un partido (${(entero / 6000).toFixed(2)} vs ${(mitades / 6000).toFixed(2)})`);
}

console.log("\nmotor: progresión");
{
  const r = E.makeRng(11);
  const p = E.genPlayer(r, { pos: "MC", age: 18, target: 55, region: "sud", clubId: 0, leagueId: "pe" });
  p.pot = 85;
  const antes = E.media(p);
  for (let i = 0; i < 40; i++) E.train(r, p, ["pas", "reg", "tir"], 1, 1);
  ok(E.media(p) > antes, `entrenar mejora (${antes} → ${E.media(p)})`);
  ok(Object.values(p.attrs).every((v) => v <= 99), "el entrenamiento no rompe el techo de 99");

  const techo = E.genPlayer(r, { pos: "MC", age: 27, target: 70, region: "sud", clubId: 0, leagueId: "pe" });
  techo.pot = E.media(techo);
  const m0 = E.media(techo);
  for (let i = 0; i < 60; i++) E.train(r, techo, ["pas"], 1, 1);
  ok(E.media(techo) - m0 <= 3, `el que ya llegó a su techo casi no sube (${m0} → ${E.media(techo)})`);

  const viejo = { age: 34, attrs: { rit: 80, fis: 80, men: 70 } };
  E.declive(viejo, 12);
  ok(viejo.attrs.rit < 80 && viejo.attrs.men > 70, "a los 34 se pierde ritmo y se gana cabeza");

  ok(E.injuryRoll(r, p, 0, 0) === null, "sin jugar no te lesionas");
}

/* ---------------------------------------------------------------- carrera */
console.log("\ncarrera: mundo íntegro");
{
  const { s, visto } = jugar(1234);
  ok(s.fase === "fin", "una carrera entera termina en la pantalla de legado");
  ok(visto.accion > 300 && visto.momento > 100, "hubo semanas y momentos de partido de sobra");
  ok(visto.dt_semana > 50, "la segunda vida como DT también se jugó");

  let huecos = 0, desalineados = 0, duplicados = 0;
  const vistos = new Set();
  for (const c of s.clubs) {
    for (const id of c.squad) {
      if (!s.players[id]) huecos++;
      if (vistos.has(id)) duplicados++;
      vistos.add(id);
    }
  }
  for (let i = 0; i < s.players.length; i++) if (s.players[i] && s.players[i].id !== i) desalineados++;
  ok(huecos === 0, "ningún plantel apunta a un jugador que no existe");
  ok(desalineados === 0, "el id de cada jugador sigue siendo su índice");
  ok(duplicados === 0, "nadie está en dos clubes a la vez");
  ok(s.clubs.every((c) => c.squad.length >= 16), "todos los clubes mantienen plantel completo");
}

console.log("\ncarrera: la tabla cierra");
{
  const s = C.nuevaPartida({ seed: 55, nombre: "T", pos: "MC", perfil: "obrero" });
  /* Jugamos una temporada completa entrenando siempre. */
  let guard = 0;
  while (s.temporada === 1 && guard++ < 6000 && s.pendiente) {
    const pd = s.pendiente;
    const k = pd.tipo === "accion" ? Math.max(0, pd.opts.findIndex((o) => o.accion === "tecnica")) : 0;
    C.resolver(s, k);
  }
  const tabla = s.me.tablaFinal || null;
  const hist = s.me.hist[0];
  ok(hist && hist.temporada === 1, "quedó registrada la primera temporada");
  ok(hist.pos >= 1 && hist.pos <= 12, `tu equipo terminó en una posición válida (${hist && hist.pos}º)`);
  ok(D.LEAGUES.length === 6 && D.CLUBS.length === 72, "la pirámide tiene seis categorías y 72 clubes");
}

console.log("\ncarrera: tablas consistentes durante la temporada");
{
  const { s } = jugar(777, {
    cada: (st) => {
      if (st.semana !== 20 || st.chequeado) return;
      st.chequeado = true;
      for (const l of D.LEAGUES) {
        const t = st.comp.ligas[l.id].tabla;
        const gf = t.reduce((a, r) => a + r.gf, 0), gc = t.reduce((a, r) => a + r.gc, 0);
        const pjs = t.reduce((a, r) => a + r.pj, 0);
        st.chk = st.chk || [];
        st.chk.push({ liga: l.id, gf, gc, pjs, filas: t.length, sumaOk: t.every((r) => r.g + r.e + r.p === r.pj) });
      }
    },
  });
  const chk = s.chk || [];
  ok(chk.length === D.LEAGUES.length, `se auditaron todas las ligas a mitad de temporada (${chk.length})`);
  ok(chk.every((c) => c.gf === c.gc), "goles a favor = goles en contra en cada liga");
  ok(chk.every((c) => c.pjs % 2 === 0), "los partidos jugados siempre son pares");
  ok(chk.every((c) => c.sumaOk), "ganados + empatados + perdidos = jugados");
}

console.log("\ncarrera: plata");
{
  const s = C.nuevaPartida({ seed: 8, nombre: "P", pos: "DC", perfil: "obrero" });
  let guard = 0;
  while (guard++ < 300 && s.pendiente && s.semana < 38) {
    const pd = s.pendiente;
    /* Vive discreto: entrena y dice que no a los gastos grandes. */
    const k = pd.tipo === "accion" ? Math.max(0, pd.opts.findIndex((o) => o.accion === "tecnica"))
      : pd.tipo === "decision" ? pd.opts.length - 1 : 0;
    C.resolver(s, k);
  }
  ok(Number.isFinite(s.me.plata) && Number.isFinite(C.patrimonio(s)), "la plata nunca es NaN");
  ok(s.me.finanzas.ing > 0 && s.me.finanzas.egr > 0, "hay ingresos y también gastos");
  ok(s.me.finanzas.egr < s.me.finanzas.ing, "un futbolista con sueldo no gasta más de lo que gana viviendo discreto");
  s.me.plata = 200000;              // para probar la mecánica sin esperar diez años
  const antes = s.me.plata;
  const puso = C.invertir(s, "bonos", 5000);
  ok(puso && cerca(s.me.plata, antes - 5000, 1), "invertir mueve la plata del efectivo al negocio");
  ok(!C.invertir(s, "bonos", 10), "no se puede invertir menos del mínimo");
  const patAntes = C.patrimonio(s);
  C.retirarInv(s, "bonos");
  ok(cerca(C.patrimonio(s), patAntes, 1), "retirar un negocio no crea ni destruye patrimonio");
}

console.log("\ncarrera: contratos y retiro");
{
  const { s } = jugar(2024);
  const p = C.yo(s);
  ok(p.retirado === true, "el jugador terminó retirado");
  ok(s.clubs.every((c) => !c.squad.includes(0)), "un retirado ya no figura en ningún plantel");
  ok(s.me.carrera.clubes.length >= 1, "quedó registrada la lista de clubes");
  ok(s.me.carrera.pj > 50, `jugó una cantidad razonable de partidos (${s.me.carrera.pj})`);
  ok(s.me.hist.some((h) => h.dt), "hay temporadas registradas como DT");
}

console.log("\ncarrera: determinismo y guardado");
{
  const a = jugar(31337).s, b = jugar(31337).s;
  ok(JSON.stringify(a.me.carrera) === JSON.stringify(b.me.carrera), "la misma semilla da exactamente la misma carrera");
  ok(a.feed.length === b.feed.length, "hasta el relato es idéntico");

  const s = C.nuevaPartida({ seed: 99, nombre: "S", pos: "LAT", perfil: "cerebro" });
  for (let i = 0; i < 60 && s.pendiente; i++) C.resolver(s, 0);
  const txt = C.guardar(s);
  const cargado = C.cargar(txt);
  ok(cargado && C.guardar(cargado) === txt, "guardar y cargar deja el estado igual");
  ok(C.cargar("no soy json") === null, "un archivo inválido no rompe nada");
  ok(C.cargar(null) === null, "sin guardado previo tampoco");

  /* Y sigue jugable después de cargar. */
  const s2 = C.cargar(txt);
  for (let i = 0; i < 30 && s2.pendiente && s2.pendiente.tipo !== "fin"; i++) C.resolver(s2, 0);
  ok(s2.semana >= s.semana || s2.temporada > s.temporada, "una partida cargada sigue avanzando");
}

console.log("\nDT: el banco");
{
  const { s } = jugar(4242);
  const dtHist = s.me.hist.filter((h) => h.dt);
  ok(dtHist.length >= 3, `dirigió varias temporadas (${dtHist.length})`);
  const total = dtHist.reduce((a, h) => a + h.g + h.e + h.p, 0);
  ok(total > 60, `y muchos partidos (${total})`);
  const ganados = dtHist.reduce((a, h) => a + h.g, 0);
  const perdidos = dtHist.reduce((a, h) => a + h.p, 0);
  ok(ganados > total * 0.2, `un DT que elige al azar gana un porcentaje decente (${ganados}/${total})`);
  ok(perdidos < total * 0.75, "y no pierde casi todo: las dos escalas de fuerza coinciden");
}

console.log("\nDT: fuerza en la misma escala que el rival");
{
  const s = C.nuevaPartida({ seed: 5, nombre: "x", pos: "DC", perfil: "obrero" });
  s.fase = "dt"; s.me.repDT = 80;
  s.dt = {
    clubId: 36, sueldo: 1000, objetivo: D.OBJETIVOS[3], paciencia: 60,
    formacion: "4-4-2", estilo: "posesion", mentalidad: "equil",
    entrenamiento: "tecnico", xi: null, temporadas: 0, record: { pj: 0, g: 0, e: 0, p: 0, titulos: 0 },
  };
  C.autoXI(s);
  ok(s.dt.xi.length === 11, "el once automático pone once jugadores");
  ok(new Set(s.dt.xi).size === 11, "y no repite a nadie");
  const f = C.fuerzaDT(s, 36, s.dt.xi);
  const r = E.clubRating(s, 36);
  ok(cerca(f.total, r, 4), `la fuerza del equipo dirigido coincide con la del rival (${f.total.toFixed(1)} vs ${r.toFixed(1)})`);

  /* Las tácticas hacen algo medible. */
  C.setTactica(s, "mentalidad", "muy_ofe");
  const ofe = C.fuerzaDT(s, 36, s.dt.xi);
  C.setTactica(s, "mentalidad", "muy_def");
  const def = C.fuerzaDT(s, 36, s.dt.xi);
  ok(ofe.atk > def.atk && def.def > ofe.def, "salir a atacar sube el ataque y baja la defensa");
}

console.log("\nmomentos de partido");
{
  const p = { attrs: { tir: 40, men: 50, reg: 50, pas: 50, def: 50, fis: 50, rit: 50 } };
  const bueno = { attrs: { ...p.attrs, tir: 95 } };
  const op = D.MOMENTS.find((m) => m.id === "penal").opts[0];
  ok(C.probOpcion(bueno, op) > C.probOpcion(p, op), "pegarle bien al arco depende de tu tiro");
  ok(C.probOpcion(p, op) > 0 && C.probOpcion(bueno, op) < 1, "nunca es imposible ni seguro");
  ok(D.MOMENTS.every((m) => m.opts.every((o) => o.ok || o.mal)), "todo momento tiene consecuencias declaradas");
  ok(D.EVENTOS.every((e) => e.opts.every((o) => o.txtRes)), "todo evento de vida se narra");
}

console.log(`\n${passed} ok, ${failed} fail`);
process.exit(failed ? 1 : 0);
