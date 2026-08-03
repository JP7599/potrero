"use strict";
/* POTRERO — la carrera.
 *
 * Máquina de estados de una vida entera: 42 semanas por temporada, liga +
 * copa + continental, contratos, sueldos, impuestos, negocios, prensa,
 * lesiones, selección, retiro y una segunda vida como DT.
 *
 * Todo pasa por `resolver(state, i)`: la UI y los tests usan la misma puerta.
 */
(function (global) {
  const isNode = typeof module !== "undefined" && module.exports;
  const D = isNode ? require("./data.js") : global.PotreroData;
  const E = isNode ? require("./engine.js") : global.PotreroEngine;
  const { clamp, media, valueOf, wageFor } = E;

  const SEMANAS = 42;
  const W_CONT = [3, 6, 10, 14, 18, 23, 29, 34];
  const W_COPA = [8, 16, 25, 32];
  const W_LIBRE = [21, 37];
  const W_LIGA = [];
  for (let w = 3; w <= 38; w++) if (!W_CONT.includes(w) && !W_COPA.includes(w) && !W_LIBRE.includes(w)) W_LIGA.push(w);

  const PERFILES = {
    crack:  { name: "Crack de barrio", desc: "Gambeta y velocidad. Techo altísimo, cabeza de potrero.", d: { reg: 8, rit: 6, def: -5, men: -4 }, pot: 14, prof: 0.72 },
    obrero: { name: "Obrero",          desc: "Corre por dos, no se lesiona, nunca falta al entrenamiento.", d: { fis: 8, def: 5, men: 4, reg: -5 }, pot: 4, prof: 1.22 },
    cerebro:{ name: "Cerebro",         desc: "Ve el pase antes que todos. Ya piensa como técnico.", d: { pas: 9, men: 6, fis: -4, rit: -3 }, pot: 8, prof: 1.05, dt: 12 },
    killer: { name: "Killer del área", desc: "No toca la pelota en todo el partido y hace dos goles.", d: { tir: 10, men: 4, pas: -5, def: -6 }, pot: 10, prof: 0.95 },
  };

  const yo = (s) => s.players[0];
  const clubDe = (s, p) => s.clubs[p.clubId];
  const ligaDe = (s, clubId) => D.LEAGUES.find((l) => l.id === s.clubs[clubId].leagueId);
  const rngDe = (s) => { const r = E.makeRng(s.rngState); return { r, done: () => { s.rngState = r.state; } }; };
  const dinero = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `${n < 0 ? "-" : ""}$${Math.round(a / 1e3)}k`;
    return `${n < 0 ? "-" : ""}$${Math.round(a)}`;
  };

  function feed(s, txt, tipo = "info") {
    s.feed.unshift({ t: `T${s.temporada} S${s.semana}`, txt, tipo });
    if (s.feed.length > 260) s.feed.length = 260;
  }
  function push(s, p) { s.cola.push(p); }

  /* ================================================================ inicio */
  function nuevaPartida(opts) {
    const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9)) >>> 0;
    const w = E.buildWorld(seed);
    const s = {
      v: 1, seed, rngState: w.rngState, fase: "jugador",
      temporada: 1, anio: 2026, semana: 1,
      clubs: w.clubs, players: w.players,
      comp: null, feed: [], cola: [], pendiente: null, partido: null, dt: null,
      me: {
        perfil: opts.perfil || "crack", fama: 2, rep: 8, plata: 1200,
        estilo: 0, sponsors: [], inv: [], puntos: 0, xp: 0, nivel: 1,
        confianza: 52, quimica: 50, prof: 1, idioma: 20, adaptacion: 100,
        dtxp: 0, licencia: 0, agente: { comision: 0.06, red: 1 },
        contrato: { golBonus: 0, pjBonus: 0, clausula: 0 },
        caps: 0, golesSel: 0, enSeleccion: false,
        finanzas: { ing: 0, egr: 0 },
        carrera: { pj: 0, g: 0, a: 0, mvp: 0, min: 0, ratSum: 0, titulos: { liga: 0, copa: 0, cont: 0, sel: 0 }, balones: 0, clubes: [] },
        hist: [],
      },
    };
    const { r, done } = rngDe(s);
    const perfil = PERFILES[s.me.perfil];
    s.me.prof = perfil.prof;
    s.me.dtxp = perfil.dt || 0;

    /* Tú: 16 años, media baja, potencial escondido hasta que alguien te vea. */
    const you = E.genPlayer(r, { pos: opts.pos || "DC", age: 16, target: 44, region: "sud", clubId: 0, leagueId: "pe3" });
    you.id = 0; you.name = opts.nombre || "Chibolo del Potrero"; you.yo = true;
    for (const k in perfil.d) you.attrs[k] = clamp(you.attrs[k] + perfil.d[k], 20, 90);
    you.pot = clamp(media(you) + r.int(13, 33) + perfil.pot, 60, 97);
    you.apodo = r.pick(D.CITY_NICK);
    you.years = 2;
    s.players[0] = you;
    done();

    nuevaTemporada(s, true);
    /* Arranque: tres clubes chicos te prueban. Eliges tu primera camiseta. */
    push(s, ofertasIniciales(s));
    siguiente(s);
    return s;
  }

  function ofertasIniciales(s) {
    const { r, done } = rngDe(s);
    /* Dos equipos de tierra que te ponen a jugar ya, y una cantera de Primera:
     * mejor gente, mejores canchas, pero ahí adentro eres uno más de treinta. */
    const barrio = r.shuffle(s.clubs.filter((c) => c.leagueId === "pe3")).slice(0, 2);
    const opts = barrio.map((c) => {
      const sueldo = Math.round(wageFor(c, 46, 16) * (0.8 + r.next() * 0.6) / 10) * 10;
      const minutos = clamp(Math.round(96 - c.prestige * 1.6 + r.int(-6, 6)), 45, 95);
      return {
        txt: `${c.name} (Copa Perú)`,
        club: c.id, sueldo, minutos,
        sub: `${dinero(sueldo)}/semana · ${minutos}% de chance de entrar · ${c.city}. Cancha de tierra, pero se juega.`,
      };
    });
    const grandes = s.clubs.filter((c) => c.leagueId === "pe").sort((a, b) => b.prestige - a.prestige).slice(0, 6);
    const cant = r.pick(grandes);
    opts.push({
      txt: `Cantera de ${cant.name} (Primera)`,
      club: cant.id, sueldo: Math.round(wageFor(cant, 40, 16) / 10) * 10, minutos: 0, cantera: true,
      sub: "Sueldo de mentira y reserva todos los fines de semana, pero entrenas el doble y el club está en Primera. Si rindes, te suben.",
    });
    done();
    return {
      tipo: "inicio", titulo: "Tu primer contrato",
      texto: "Te vieron jugando en el barrio. Tienes tres puertas, y ninguna es la buena para todos.",
      opts,
    };
  }

  /* ============================================================ temporada */
  function nuevaTemporada(s, primera) {
    const { r, done } = rngDe(s);
    if (!primera) {
      /* Envejecer el mundo: crecen los chibolos, se caen los viejos. */
      for (let i = 1; i < s.players.length; i++) {
        const p = s.players[i];
        if (!p) continue;
        p.age++; p.years = Math.max(0, p.years - 1);
        E.train(r, p, ["rit", "tir", "pas", "reg", "def", "fis", "men"], 12, 1);
        E.declive(p, 6);
        p.st = { pj: 0, g: 0, a: 0, mvp: 0, am: 0, ro: 0, min: 0, rat: 0 };
        p.fit = r.int(88, 100); p.form = 0; p.inj = null;
      }
      /* Tú envejeces aparte: no te entrena la IA, entrenas tú cada semana. */
      const p0 = s.players[0];
      p0.age++;
      p0.st = { pj: 0, g: 0, a: 0, mvp: 0, am: 0, ro: 0, min: 0, rat: 0 };
      p0.fit = clamp(p0.fit + 20, 60, 100); p0.form = 0;
      ascensosYDescensos(s);
      retiradosYCantera(s, r);
      mercadoIA(s, r);
      for (const c of s.clubs) c.form = 0;
    }
    /* Competencias de la temporada. */
    const comp = { ligas: {}, copa: {}, cont: {} };
    for (const l of D.LEAGUES) {
      const ids = s.clubs.filter((c) => c.leagueId === l.id).map((c) => c.id);
      comp.ligas[l.id] = { fixtures: E.makeSchedule(r, ids), tabla: ids.map(E.emptyRow), fecha: 0 };
      /* Los cabezas de serie salen de la tabla del año pasado, pero filtrada
       * por quién sigue en la categoría: los que ascendieron o descendieron
       * entran al final del cuadro. Sin este filtro un club sembrado en una
       * copa que ya no juega deja el cuadro con un lugar vacío. */
      comp.copa[l.id] = { ronda: 0, llaves: cuadroCopa(sembrado(s, l.id, ids)), campeon: null };
    }
    for (const cid of ["condor", "europa"]) {
      const ligas = D.LEAGUES.filter((l) => l.cont === cid);
      let clasificados = [];
      for (const l of ligas) {
        const ids = s.clubs.filter((c) => c.leagueId === l.id).map((c) => c.id);
        clasificados = clasificados.concat(sembrado(s, l.id, ids).slice(0, 4));
      }
      const mix = r.shuffle(clasificados);
      const grupos = [mix.slice(0, 4), mix.slice(4, 8)];
      comp.cont[cid] = {
        grupos,
        tablas: grupos.map((g) => g.map(E.emptyRow)),
        fixtures: grupos.map((g) => { const rr = E.roundRobin(g); return rr.concat(rr.map((rd) => rd.map(([h, a]) => [a, h]))); }),
        fecha: 0, fase: "grupos", semis: null, final: null, campeon: null,
      };
    }
    s.comp = comp;
    s.semana = 1;
    s.me.finanzas = { ing: 0, egr: 0 };
    if (!primera) { s.temporada++; s.anio++; }
    done();
    if (!primera) feed(s, `Arranca la temporada ${s.anio}.`, "hito");
  }

  /* Orden de mérito de una liga: la tabla anterior, pero solo con los clubes
   * que hoy están en esa categoría; los recién llegados van últimos. */
  function sembrado(s, ligaId, ids) {
    const prev = s.comp && s.comp.ligas[ligaId];
    const orden = prev ? E.sortTable(prev.tabla).map((x) => x.clubId).filter((id) => ids.includes(id)) : [];
    const faltan = ids.filter((id) => !orden.includes(id)).sort((a, b) => s.clubs[b].prestige - s.clubs[a].prestige);
    return orden.concat(faltan);
  }

  function cuadroCopa(seeds) {
    /* 12 equipos: los 4 primeros esperan, los otros 8 se cruzan. */
    const byes = seeds.slice(0, 4), resto = seeds.slice(4);
    const r1 = [];
    for (let i = 0; i < 4; i++) r1.push([resto[i], resto[7 - i]]);
    return { byes, rondas: [r1] };
  }

  /* Los dos últimos se van al descenso y los dos primeros de abajo suben.
   * Se calcula todo con las tablas viejas y recién después se aplica, para que
   * un recién descendido no entre en la cuenta del descenso de la categoría
   * de abajo en la misma temporada. */
  function ascensosYDescensos(s) {
    if (!s.comp) return;
    const movidas = [];
    for (const arriba of D.LEAGUES.filter((l) => l.baja)) {
      const abajo = D.LEAGUES.find((l) => l.id === arriba.baja);
      const tA = E.sortTable(s.comp.ligas[arriba.id].tabla);
      const tB = E.sortTable(s.comp.ligas[abajo.id].tabla);
      movidas.push({ ids: tA.slice(-2).map((x) => x.clubId), destino: abajo.id, d: -5 });
      movidas.push({ ids: tB.slice(0, 2).map((x) => x.clubId), destino: arriba.id, d: +5 });
    }
    const miClub = s.fase === "dt" && s.dt ? s.dt.clubId : yo(s).clubId;
    for (const mov of movidas) {
      for (const id of mov.ids) {
        const club = s.clubs[id];
        const antes = D.LEAGUES.find((l) => l.id === club.leagueId);
        const ahora = D.LEAGUES.find((l) => l.id === mov.destino);
        club.leagueId = mov.destino;
        club.prestige = clamp(club.prestige + mov.d, 3, 96);
        for (const pid of club.squad) if (s.players[pid]) s.players[pid].leagueId = mov.destino;
        if (id === miClub) {
          feed(s, mov.d > 0
            ? `¡ASCENSO! ${club.name} sube a ${ahora.name}.`
            : `Descenso. ${club.name} se va a ${ahora.name}.`, mov.d > 0 ? "hito" : "malo");
        } else if (mov.d > 0 && antes.tier <= 1) {
          feed(s, `${club.name} ascendió a ${ahora.name}.`, "info");
        }
      }
    }
  }

  function retiradosYCantera(s, r) {
    for (const c of s.clubs) {
      const league = D.LEAGUES.find((l) => l.id === c.leagueId);
      c.squad = c.squad.filter((id) => {
        if (id === 0) return true;
        const p = s.players[id];
        const m = media(p);
        const retira = p.age >= 37 || (p.age >= 34 && m < E.mediaObjetivo(c.prestige) - 6);
        if (retira) s.players[id] = null;
        return !retira;
      });
      while (c.squad.length < 18) {
        const pos = D.SQUAD_SHAPE[c.squad.length % D.SQUAD_SHAPE.length];
        const p = E.genPlayer(r, {
          pos, age: r.int(17, 20), target: E.mediaObjetivo(c.prestige) - r.int(4, 12),
          clubId: c.id, leagueId: c.leagueId, region: league.region === "eur" ? (r.chance(0.3) ? "sud" : "eur") : "sud",
        });
        p.wage = wageFor(c, media(p), p.age);
        p.id = s.players.length;      // id === índice, siempre
        s.players.push(p);
        c.squad.push(p.id);
      }
    }
  }

  function mercadoIA(s, r) {
    /* Movimiento de mercado barato pero creíble: el que rinde sube de club. */
    const movidas = 60;
    for (let i = 0; i < movidas; i++) {
      const origen = s.clubs[r.int(0, s.clubs.length - 1)];
      const cand = origen.squad.filter((id) => id !== 0 && s.players[id] && s.players[id].age < 31);
      if (cand.length <= 14) continue;
      const pid = r.pick(cand);
      const p = s.players[pid];
      const m = media(p);
      const destinos = s.clubs.filter((c) => c.id !== origen.id && c.squad.length < 22
        && Math.abs(E.mediaObjetivo(c.prestige) - m) < 7);
      if (!destinos.length) continue;
      const dest = r.pick(destinos);
      origen.squad = origen.squad.filter((x) => x !== pid);
      dest.squad.push(pid);
      p.clubId = dest.id; p.leagueId = dest.leagueId;
      p.wage = wageFor(dest, m, p.age);
      p.years = r.int(2, 4);
    }
  }

  /* ========================================================= flujo semanal */
  /* El corazón del bucle: vacía la cola de decisiones, y cuando no queda
   * ninguna cierra la semana y arranca la siguiente. Todo lo que consume
   * tiempo marca `necesitaCierre`, así ninguna semana especial se cuelga. */
  function siguiente(s) {
    for (let guard = 0; guard < 500; guard++) {
      if (s.cola.length) { s.pendiente = s.cola.shift(); return s.pendiente; }
      if (s.fase === "fin" || s.fase === "retirado") return s.pendiente;
      if (s.necesitaCierre) { s.necesitaCierre = false; cerrarSemana(s); continue; }
      const p = arrancarSemana(s);
      if (p) { s.pendiente = p; return p; }
    }
    return s.pendiente;
  }

  function tipoSemana(s) {
    const w = s.semana;
    if (w <= 2) return "pretemporada";
    if (W_LIGA.includes(w)) return "liga";
    if (W_COPA.includes(w)) return "copa";
    if (W_CONT.includes(w)) return "cont";
    if (W_LIBRE.includes(w)) return "libre";
    if (w === 39) return "premios";
    if (w === 40) return "mercado";
    if (w === 41) return "seleccion";
    return "vacaciones";
  }

  function arrancarSemana(s) {
    s.necesitaCierre = true;
    if (s.fase === "dt") return arrancarSemanaDT(s);
    const t = tipoSemana(s);
    if (t === "premios") { premios(s); return null; }
    if (t === "mercado") { mercado(s); return null; }
    if (t === "seleccion") { seleccion(s); return null; }
    if (t === "vacaciones") { cerrarTemporada(s); return null; }
    return { tipo: "accion", titulo: tituloSemana(s, t), texto: subtituloSemana(s, t), opts: accionesDisponibles(s) };
  }

  function tituloSemana(s, t) {
    const p = yo(s), c = clubDe(s, p);
    if (t === "pretemporada") return `Pretemporada con ${c.name}`;
    if (t === "libre") return "Semana libre";
    const rival = rivalDe(s, t);
    if (!rival) return "Semana sin partido";
    const comp = t === "liga" ? ligaDe(s, p.clubId).name : t === "copa" ? ligaDe(s, p.clubId).cup : "copa internacional";
    return `${rival.local ? "vs" : "visita a"} ${s.clubs[rival.rival].name}`;
  }
  function subtituloSemana(s, t) {
    const p = yo(s);
    if (p.inj) return `Lesionado: ${p.inj.name} (${p.inj.weeks} semanas). Elige cómo pasas la semana.`;
    if (t === "pretemporada") return "Todavía no hay puntos en juego. Es cuando más se crece.";
    if (t === "libre") return "Sin partido. El cuerpo agradece o el técnico aprovecha.";
    const r = rivalDe(s, t);
    if (!r) return "Tu equipo no juega esta semana.";
    const comp = t === "liga" ? ligaDe(s, p.clubId).name : t === "copa" ? ligaDe(s, p.clubId).cup : "copa internacional";
    return `${comp}. Confianza del técnico: ${Math.round(s.me.confianza)}/100.`;
  }

  function accionesDisponibles(s) {
    const p = yo(s);
    return D.ACTIONS.filter((a) => (a.id === "fisio" ? !!p.inj : true))
      .map((a) => ({ txt: `${a.icon}  ${a.name}`, sub: a.desc, accion: a.id }));
  }

  /* En la fase DT el "tu club" ya no es donde juegas sino donde diriges. */
  const miClubId = (s) => (s.fase === "dt" && s.dt ? s.dt.clubId : yo(s).clubId);

  /* ¿El partido de tu club lo resuelves tú, o lo simula el mundo? En la
   * cantera juegas la reserva, así que el primer equipo juega sin ti: si no
   * se simula, la copa se queda sin ganador y el cuadro se parte. */
  const juegoYo = (s) => (s.fase === "dt" && !!s.dt) || (s.fase === "jugador" && !s.me.cantera);
  const clubReservado = (s) => (juegoYo(s) ? miClubId(s) : -1);

  function rivalDe(s, t) {
    const club = s.clubs[miClubId(s)];
    if (t === "liga") {
      const L = s.comp.ligas[club.leagueId];
      const fecha = L.fixtures[L.fecha];
      if (!fecha) return null;
      for (const [h, a] of fecha) {
        if (h === club.id) return { rival: a, local: true };
        if (a === club.id) return { rival: h, local: false };
      }
      return null;
    }
    if (t === "copa") {
      const C = s.comp.copa[club.leagueId];
      const ronda = C.llaves.rondas[C.ronda];
      if (!ronda) return null;
      for (const [h, a] of ronda) {
        if (h === club.id) return { rival: a, local: true };
        if (a === club.id) return { rival: h, local: false };
      }
      return null;
    }
    if (t === "cont") {
      const cid = ligaDe(s, club.id).cont;
      if (!cid) return null;              // en las ligas de abajo no hay copa internacional
      const K = s.comp.cont[cid];
      if (K.fase === "grupos") {
        for (let g = 0; g < 2; g++) {
          const fecha = K.fixtures[g][K.fecha];
          if (!fecha) continue;
          for (const [h, a] of fecha) {
            if (h === club.id) return { rival: a, local: true };
            if (a === club.id) return { rival: h, local: false };
          }
        }
      } else if (K.fase === "semis" && K.semis) {
        for (const [h, a] of K.semis) {
          if (h === club.id) return { rival: a, local: true, neutral: true };
          if (a === club.id) return { rival: h, local: false, neutral: true };
        }
      } else if (K.fase === "final" && K.final) {
        const [h, a] = K.final;
        if (h === club.id) return { rival: a, local: true, neutral: true };
        if (a === club.id) return { rival: h, local: false, neutral: true };
      }
      return null;
    }
    return null;
  }

  /* -------------------------------------------------- resolución de semana */
  function aplicarAccion(s, accionId) {
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me;
    const a = D.ACTIONS.find((x) => x.id === accionId) || D.ACTIONS[0];
    me.accionSemana = a.id;
    if (a.attrs.length) {
      const sub = E.train(r, p, a.attrs, a.xp * (p.inj ? 0.3 : 1), me.prof);
      me.ultimaSubida = sub;
    } else me.ultimaSubida = null;
    p.fit = clamp(p.fit + a.fit + (p.inj ? 4 : 0), 20, 100);
    p.mor = clamp(p.mor + (a.mor || 0), 5, 100);
    me.fama = clamp(me.fama + (a.fama || 0), 0, 100);
    me.prof = clamp(me.prof + (a.prof || 0) * 0.02, 0.6, 1.4);
    me.idioma = clamp(me.idioma + (a.idioma || 0), 0, 100);
    me.dtxp += (a.dt || 0);
    me.resistencia = (me.resistencia || 0) + (a.resist || 0);
    if (a.cura && p.inj) p.inj.weeks = Math.max(0, p.inj.weeks - 1);
    if (a.escandalo && r.chance(a.escandalo)) {
      const golpe = r.int(4, 12);
      me.confianza = clamp(me.confianza - golpe, 0, 100);
      me.fama = clamp(me.fama + 3, 0, 100);
      p.mor = clamp(p.mor - 6, 5, 100);
      feed(s, `Escándalo: te filtraron un video de la salida. El técnico no aplaudió.`, "malo");
    }
    me.multNegocio = a.negocio ? 2.2 : 1;
    done();
  }

  function jugarSemana(s) {
    const t = tipoSemana(s);
    const { r, done } = rngDe(s);
    /* El mundo juega, juegues o no. */
    if (t === "liga") simFechaLiga(s, r);
    if (t === "copa") simRondaCopa(s, r);
    if (t === "cont") simFechaCont(s, r);
    done();

    if (s.me.cantera) return partidoReserva(s, t);
    const info = t === "liga" || t === "copa" || t === "cont" ? rivalDe(s, t) : null;
    if (info) prepararPartido(s, t, info);
    else { finSemanaSinPartido(s, t); }
  }

  /* ------------------------------------------------------------- reserva */
  /* La cantera: partidos que no salen en ningún lado, contra chibolos de tu edad.
   * No suman a la liga ni al Balón de Oro, pero es donde te haces. */
  function partidoReserva(s, t) {
    if (t !== "liga" && t !== "copa" && t !== "cont") return finSemanaSinPartido(s, t);
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me, club = clubDe(s, p);
    if (p.inj) {
      done();
      s.cola.push({ tipo: "resumen", titulo: "Semana de reserva", texto: "Lesionado: la viste desde el borde de la cancha auxiliar.", opts: [{ txt: "Seguir" }] });
      return;
    }
    const nivel = E.mediaObjetivo(club.prestige) - 9;
    const m = media(p);
    const perf = E.perfRoll(r, p, { local: r.chance(0.5), rivalRating: nivel, equipoRating: nivel + 2 });
    const ev = { gol: 0, asi: 0, amarilla: 0, roja: 0, atajada: 0, bonus: 0 };
    const sh = D.SHARE[p.pos];
    const golesEquipo = E.poisson(r, clamp(1.4 + (m - nivel) * 0.09, 0.3, 5));
    const encontra = E.poisson(r, clamp(1.4 - (m - nivel) * 0.06, 0.2, 5));
    const factor = clamp(Math.exp((perf - m) / 22), 0.2, 2.6);
    for (let i = 0; i < golesEquipo; i++) {
      if (r.chance(clamp(sh.gol * factor * 1.35, 0, 0.9))) ev.gol++;
      else if (r.chance(clamp(sh.asi * factor, 0, 0.85))) ev.asi++;
    }
    const rating = E.ratingFrom(perf, m, ev);
    p.stRes = p.stRes || { pj: 0, g: 0, a: 0, rat: 0 };
    p.stRes.pj++; p.stRes.g += ev.gol; p.stRes.a += ev.asi; p.stRes.rat += rating;
    me.carrera.res = me.carrera.res || { pj: 0, g: 0, a: 0 };
    me.carrera.res.pj++; me.carrera.res.g += ev.gol; me.carrera.res.a += ev.asi;
    p.form = clamp(p.form * 0.62 + (rating - 6.6) * 0.62, -3, 3);
    p.fit = clamp(p.fit - r.int(9, 16), 15, 100);
    /* En la cantera se entrena el doble: es todo el sentido de estar ahí. */
    const w = D.POSITIONS[p.pos].w;
    const clave = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 3);
    E.train(r, p, clave, 0.55, me.prof);
    me.confianza = clamp(me.confianza + (rating - 6.4) * 2.4 + ev.gol * 1.6, 0, 100);
    me.xp += 8 + rating + ev.gol * 4;
    const les = E.injuryRoll(r, p, 90, me.resistencia || 0);
    if (les) { p.inj = les; feed(s, `Te lesionaste en la reserva: ${les.name}. ${les.weeks} semanas.`, "malo"); }
    feed(s, `Reserva ${golesEquipo}-${encontra} · tú: ${rating.toFixed(1)}${ev.gol ? ` (${ev.gol} gol${ev.gol > 1 ? "es" : ""})` : ""}`, ev.gol ? "bueno" : "info");
    done();
    s.cola.push({
      tipo: "resumen", titulo: `Reserva ${golesEquipo} - ${encontra}`,
      texto: `Nota ${rating.toFixed(1)}. Confianza del técnico del primer equipo: ${Math.round(me.confianza)}/100.`,
      partido: {
        rating, ev, minutos: 90, narracion: [],
        resTxt: golesEquipo > encontra ? "ganamos" : golesEquipo < encontra ? "perdimos" : "empatamos",
        /* Para que la interfaz pinte el marcador con escudos sin tener que
         * leer el título a mano. */
        marcador: { clubId: club.id, rivalId: null, mios: golesEquipo, rival: encontra, local: true, comp: "Reserva", rivalTxt: "Rival de reserva" },
      },
      opts: [{ txt: "Seguir" }],
    });
  }

  /* -------------------------------------------------------- competencias */
  function golAleatorio(s, r, clubId, n) {
    const club = s.clubs[clubId];
    const ps = club.squad.map((id) => s.players[id]).filter((p) => p && !p.inj && p.id !== 0);
    if (!ps.length) return;
    const pesos = ps.map((p) => (D.SHARE[p.pos].gol + 0.01) * Math.pow(media(p) / 60, 2));
    const total = pesos.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      let x = r.next() * total;
      for (let j = 0; j < ps.length; j++) { x -= pesos[j]; if (x <= 0) { ps[j].st.g++; break; } }
      if (r.chance(0.62)) {
        const asi = ps[Math.floor(r.next() * ps.length)];
        if (asi) asi.st.a++;
      }
    }
  }

  function jugarIA(s, r, h, a, neutral) {
    const rh = E.clubRating(s, h), ra = E.clubRating(s, a);
    const res = E.simMatch(r, rh, ra, neutral);
    golAleatorio(s, r, h, res.gh);
    golAleatorio(s, r, a, res.ga);
    s.clubs[h].form = clamp(s.clubs[h].form * 0.7 + (res.gh - res.ga) * 0.25, -3, 3);
    s.clubs[a].form = clamp(s.clubs[a].form * 0.7 + (res.ga - res.gh) * 0.25, -3, 3);
    return res;
  }

  function simFechaLiga(s, r) {
    const miClub = clubReservado(s);
    for (const l of D.LEAGUES) {
      const L = s.comp.ligas[l.id];
      const fecha = L.fixtures[L.fecha];
      if (!fecha) continue;
      for (const [h, a] of fecha) {
        if (h === miClub || a === miClub) continue;   // el tuyo se juega aparte
        const res = jugarIA(s, r, h, a, false);
        E.applyResult(L.tabla, h, a, res.gh, res.ga);
      }
    }
  }

  function simRondaCopa(s, r) {
    const miClub = clubReservado(s);
    for (const l of D.LEAGUES) {
      const C = s.comp.copa[l.id];
      const ronda = C.llaves.rondas[C.ronda];
      if (!ronda || C.campeon) continue;
      C.ganadores = C.ganadores || [];
      for (const par of ronda) {
        if (par[0] === miClub || par[1] === miClub) continue;
        const res = jugarIA(s, r, par[0], par[1], false);
        const g = res.gh > res.ga ? par[0] : res.ga > res.gh ? par[1] : (r.chance(0.5) ? par[0] : par[1]);
        C.ganadores.push(g);
      }
    }
  }

  function avanzarCopa(s, r) {
    for (const l of D.LEAGUES) {
      const C = s.comp.copa[l.id];
      if (C.campeon) continue;
      const gan = C.ganadores || [];
      C.ganadores = [];
      let siguientes;
      if (C.ronda === 0) siguientes = C.llaves.byes.concat(gan);
      else siguientes = gan;
      C.ronda++;
      if (siguientes.length === 1) {
        C.campeon = siguientes[0];
        s.clubs[C.campeon].titulos.copa++;
        continue;
      }
      const nueva = [];
      for (let i = 0; i < siguientes.length; i += 2) nueva.push([siguientes[i], siguientes[i + 1]]);
      C.llaves.rondas[C.ronda] = nueva;
    }
  }

  function simFechaCont(s, r) {
    const miClub = clubReservado(s);
    for (const cid of ["condor", "europa"]) {
      const K = s.comp.cont[cid];
      if (K.campeon) continue;
      if (K.fase === "grupos") {
        for (let g = 0; g < 2; g++) {
          const fecha = K.fixtures[g][K.fecha];
          if (!fecha) continue;
          for (const [h, a] of fecha) {
            if (h === miClub || a === miClub) continue;
            const res = jugarIA(s, r, h, a, false);
            E.applyResult(K.tablas[g], h, a, res.gh, res.ga);
          }
        }
      } else if (K.fase === "semis" && K.semis) {
        K.ganadores = K.ganadores || [];
        for (const [h, a] of K.semis) {
          if (h === miClub || a === miClub) continue;
          const res = jugarIA(s, r, h, a, true);
          K.ganadores.push(res.gh >= res.ga ? h : a);
        }
      } else if (K.fase === "final" && K.final) {
        const [h, a] = K.final;
        if (h !== miClub && a !== miClub) {
          const res = jugarIA(s, r, h, a, true);
          coronarCont(s, cid, res.gh >= res.ga ? h : a);
        }
      }
    }
  }

  function coronarCont(s, cid, campeon) {
    const K = s.comp.cont[cid];
    K.campeon = campeon;
    s.clubs[campeon].titulos.cont++;
  }

  function avanzarCont(s, r) {
    for (const cid of ["condor", "europa"]) {
      const K = s.comp.cont[cid];
      if (K.campeon) continue;
      if (K.fase === "grupos") {
        K.fecha++;
        if (K.fecha >= 6) {
          const [a, b] = K.tablas.map((t) => E.sortTable(t));
          K.semis = [[a[0].clubId, b[1].clubId], [b[0].clubId, a[1].clubId]];
          K.fase = "semis"; K.ganadores = [];
        }
      } else if (K.fase === "semis") {
        if ((K.ganadores || []).length >= 2) {
          K.final = [K.ganadores[0], K.ganadores[1]];
          K.fase = "final";
        }
      }
    }
  }

  /* ------------------------------------------------------------ tu partido */
  function prepararPartido(s, t, info) {
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me, club = clubDe(s, p);
    const rivalClub = s.clubs[info.rival];
    const minutos = E.minutosFor(r, s, p, me.confianza);
    const ratingMio = E.clubRating(s, club.id);
    const ratingRival = E.clubRating(s, rivalClub.id);
    const res = E.simMatch(r, info.local ? ratingMio : ratingRival, info.local ? ratingRival : ratingMio, !!info.neutral);
    const golesMios = info.local ? res.gh : res.ga;
    const golesRival = info.local ? res.ga : res.gh;

    const perf = minutos ? E.perfRoll(r, p, {
      local: info.local, rivalRating: ratingRival, equipoRating: ratingMio, adaptacion: me.adaptacion,
    }) : 0;
    const ev = { gol: 0, asi: 0, amarilla: 0, roja: 0, atajada: 0, bonus: 0 };
    if (minutos) {
      const sh = D.SHARE[p.pos];
      const factor = clamp(Math.exp((perf - media(p)) / 22) * (minutos / 90), 0.15, 2.6);
      for (let i = 0; i < golesMios; i++) {
        if (r.chance(clamp(sh.gol * factor, 0, 0.9))) ev.gol++;
        else if (r.chance(clamp(sh.asi * factor, 0, 0.85))) ev.asi++;
      }
      if (p.pos === "POR" && golesRival === 0 && minutos >= 80) ev.bonus += 0.7;
      if (r.chance(clamp(0.10 + (70 - p.attrs.men) * 0.0022, 0.03, 0.3))) ev.amarilla++;
    }

    s.partido = {
      t, comp: t, local: info.local, neutral: !!info.neutral, rival: rivalClub.id,
      minutos, perf, ev, golesMios, golesRival, momentos: [], idx: 0,
      ratingMio, ratingRival, clasico: club.city === rivalClub.city,
    };

    /* Momentos: hasta dos decisiones dentro del partido. */
    if (minutos >= 20) {
      const ctx = {
        jugando: true, pos: p.pos, min: 0, local: info.local, clasico: s.partido.clasico,
        penal: r.chance(0.24), penalContra: r.chance(0.18), molestia: r.chance(0.22),
        marcadorTxt: "",
      };
      const cands = D.MOMENTS.filter((m) => { ctx.min = 55; return m.when(ctx); });
      const elegidos = [];
      const pool = r.shuffle(cands);
      const n = r.chance(0.45) ? 2 : 1;
      for (const m of pool) { if (elegidos.length >= n) break; elegidos.push(m); }
      s.partido.momentos = elegidos.map((m) => ({ id: m.id, min: r.int(12, 89) }));
      s.partido.momentos.sort((a, b) => a.min - b.min);
    }
    done();
    if (s.partido.momentos.length) empujarMomento(s);
    else { s.cola.push(cerrarPartido(s)); }
  }

  function empujarMomento(s) {
    const P = s.partido, p = yo(s);
    const m = D.MOMENTS.find((x) => x.id === P.momentos[P.idx].id);
    const min = P.momentos[P.idx].min;
    const dif = P.golesMios - P.golesRival;
    const ctx = {
      min, pos: p.pos, local: P.local, clasico: P.clasico, jugando: true,
      marcadorTxt: dif > 0 ? `ganan ${P.golesMios}-${P.golesRival}` : dif < 0 ? `pierden ${P.golesMios}-${P.golesRival}` : `empatan ${P.golesMios}-${P.golesRival}`,
    };
    s.cola.unshift({
      tipo: "momento", titulo: `Minuto ${min}`, texto: m.texto(ctx), momento: m.id,
      opts: m.opts.map((o) => ({ txt: o.txt, sub: probTxt(s, o) })),
    });
  }

  function probTxt(s, o) {
    if (!o.key) return o.base >= 1 ? "sale seguro" : "sin vuelta atrás";
    const p = yo(s);
    const prob = probOpcion(p, o);
    return `${Math.round(prob * 100)}% con tu ${o.key.toUpperCase()} ${Math.round(p.attrs[o.key])}`;
  }
  function probOpcion(p, o) {
    if (!o.key) return o.base;
    return clamp(o.base + ((p.attrs[o.key] - 62) / 100) * (o.w || 0.4) * 2.2, 0.05, 0.96);
  }

  function resolverMomento(s, i) {
    const { r, done } = rngDe(s);
    const P = s.partido, p = yo(s), me = s.me;
    const m = D.MOMENTS.find((x) => x.id === P.momentos[P.idx].id);
    const o = m.opts[i];
    const exito = r.chance(probOpcion(p, o));
    const ef = (exito ? o.ok : o.mal) || {};
    if (ef.gol) { P.ev.gol += ef.gol; P.golesMios += ef.gol; }
    if (ef.asi) { P.ev.asi += ef.asi; P.golesMios += 1; }
    if (ef.conGol) P.golesRival += ef.conGol;
    if (ef.atajada) P.ev.atajada += ef.atajada;
    if (ef.amarilla) P.ev.amarilla += ef.amarilla;
    if (ef.roja) { P.ev.roja += ef.roja; P.minutos = Math.min(P.minutos, P.momentos[P.idx].min); }
    if (ef.mor) p.mor = clamp(p.mor + ef.mor, 5, 100);
    if (ef.conf) me.confianza = clamp(me.confianza + ef.conf, 0, 100);
    if (ef.fama) me.fama = clamp(me.fama + ef.fama, 0, 100);
    if (ef.quimica) me.quimica = clamp(me.quimica + ef.quimica, 0, 100);
    if (ef.men) p.attrs.men = clamp(p.attrs.men + ef.men, 20, 99);
    if (ef.lesion) p.inj = { name: "Desgarro por aguantar", weeks: ef.lesion };
    if (ef.salir) P.minutos = Math.min(P.minutos, P.momentos[P.idx].min);
    P.narracion = P.narracion || [];
    P.narracion.push({ min: P.momentos[P.idx].min, txt: ef.txt || "", ok: exito });
    done();
    P.idx++;
    if (P.idx < P.momentos.length) empujarMomento(s);
    else s.cola.unshift(cerrarPartido(s));
    return siguiente(s);
  }

  function cerrarPartido(s) {
    const { r, done } = rngDe(s);
    const P = s.partido, p = yo(s), me = s.me, club = clubDe(s, p);
    const rival = s.clubs[P.rival];
    const rating = P.minutos ? E.ratingFrom(P.perf, media(p), P.ev) : 0;

    /* Estadística y estado. */
    if (P.minutos) {
      p.st.pj++; p.st.min += P.minutos; p.st.g += P.ev.gol; p.st.a += P.ev.asi;
      p.st.am += P.ev.amarilla; p.st.ro += P.ev.roja; p.st.rat += rating;
      me.carrera.pj++; me.carrera.min += P.minutos; me.carrera.g += P.ev.gol;
      me.carrera.a += P.ev.asi; me.carrera.ratSum += rating;
      const mvp = rating >= 8.2;
      if (mvp) { p.st.mvp++; me.carrera.mvp++; }
      p.form = clamp(p.form * 0.62 + (rating - 6.6) * 0.62, -3, 3);
      p.fit = clamp(p.fit - (P.minutos / 90) * r.int(12, 20), 15, 100);
      me.confianza = clamp(me.confianza + (rating - 6.5) * 3.1 + P.ev.gol * 2.2 - P.ev.roja * 9, 0, 100);
      me.fama = clamp(me.fama + P.ev.gol * 0.7 + (mvp ? 0.6 : 0) + 0.05, 0, 100);
      me.rep = clamp(me.rep + (rating - 6.4) * 0.32 + P.ev.gol * 0.5, 0, 100);
      me.xp += P.minutos * 0.09 + rating * 1.4 + P.ev.gol * 6 + P.ev.asi * 3;
      /* Jugar también entrena: los minutos valen más que el gimnasio. */
      const w = D.POSITIONS[p.pos].w;
      const clave = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 3);
      E.train(r, p, clave, (P.minutos / 90) * 0.22, me.prof);
      const bonus = P.ev.gol * (me.contrato.golBonus || 0) + (me.contrato.pjBonus || 0);
      if (bonus) { me.plata += bonus; me.finanzas.ing += bonus; }
      const les = E.injuryRoll(r, p, P.minutos, me.resistencia || 0);
      if (les) { p.inj = les; feed(s, `Te lesionaste: ${les.name}. ${les.weeks} semanas afuera.`, "malo"); }
    } else {
      me.confianza = clamp(me.confianza - 0.8, 0, 100);
      p.mor = clamp(p.mor - (p.inj ? 1 : 3), 5, 100);
      me.fama = clamp(me.fama - 0.15, 0, 100);
    }

    /* Resultado en las competencias. */
    const local = P.local;
    const gh = local ? P.golesMios : P.golesRival;
    const ga = local ? P.golesRival : P.golesMios;
    const h = local ? club.id : rival.id, a = local ? rival.id : club.id;
    golAleatorio(s, r, club.id, Math.max(0, P.golesMios - P.ev.gol - P.ev.asi));
    golAleatorio(s, r, rival.id, P.golesRival);
    club.form = clamp(club.form * 0.7 + (P.golesMios - P.golesRival) * 0.25, -3, 3);

    if (P.t === "liga") E.applyResult(s.comp.ligas[club.leagueId].tabla, h, a, gh, ga);
    if (P.t === "copa") {
      const C = s.comp.copa[club.leagueId];
      C.ganadores = C.ganadores || [];
      const gano = P.golesMios > P.golesRival || (P.golesMios === P.golesRival && r.chance(0.5));
      C.ganadores.push(gano ? club.id : rival.id);
      if (!gano) feed(s, `Eliminados de la ${ligaDe(s, club.id).cup} por ${rival.name}.`, "malo");
    }
    if (P.t === "cont") {
      const cid = ligaDe(s, club.id).cont;
      const K = cid ? s.comp.cont[cid] : null;   // abajo no hay copa internacional
      if (K && K.fase === "grupos") {
        const g = K.grupos.findIndex((gr) => gr.includes(club.id));
        E.applyResult(K.tablas[g], h, a, gh, ga);
      } else if (K && K.fase === "semis") {
        K.ganadores = K.ganadores || [];
        K.ganadores.push(P.golesMios >= P.golesRival ? club.id : rival.id);
      } else if (K && K.fase === "final") {
        coronarCont(s, cid, P.golesMios >= P.golesRival ? club.id : rival.id);
      }
    }

    const resTxt = P.golesMios > P.golesRival ? "ganamos" : P.golesMios < P.golesRival ? "perdimos" : "empatamos";
    p.mor = clamp(p.mor + (P.golesMios > P.golesRival ? 4 : P.golesMios < P.golesRival ? -3 : 0), 5, 100);
    feed(s, `${club.name} ${P.golesMios}-${P.golesRival} ${rival.name}${P.minutos ? ` · tú: ${rating} (${P.minutos}')${P.ev.gol ? ` ${P.ev.gol} gol${P.ev.gol > 1 ? "es" : ""}` : ""}` : " · no jugaste"}`,
      P.minutos === 0 ? "info" : P.golesMios > P.golesRival ? "bueno" : P.golesMios < P.golesRival ? "malo" : "info");
    done();

    const resumen = {
      tipo: "resumen", titulo: `${club.name} ${P.golesMios} - ${P.golesRival} ${rival.name}`,
      texto: P.minutos ? `Jugaste ${P.minutos} minutos. Nota ${rating.toFixed(1)}.` : "No entraste. A verlo desde afuera.",
      partido: {
        rating, ev: P.ev, minutos: P.minutos, narracion: P.narracion || [], resTxt,
        marcador: {
          clubId: club.id, rivalId: rival.id, mios: P.golesMios, rival: P.golesRival, local: P.local,
          comp: P.t === "liga" ? ligaDe(s, club.id).name : P.t === "copa" ? ligaDe(s, club.id).cup : "Copa internacional",
        },
      },
      opts: [{ txt: "Seguir" }],
    };
    return resumen;
  }

  function finSemanaSinPartido(s, t) {
    const p = yo(s);
    p.fit = clamp(p.fit + 9, 20, 100);
    s.cola.push({
      tipo: "resumen", titulo: t === "pretemporada" ? "Semana de pretemporada" : "Semana sin partido",
      texto: t === "pretemporada" ? "Doble turno, mucho volumen. Se nota en enero." : "Descanso y trabajo de a poco.",
      opts: [{ txt: "Seguir" }],
    });
  }

  /* --------------------------------------------------------- fin de semana */
  function cerrarSemana(s) {
    const { r, done } = rngDe(s);
    const t = tipoSemana(s);

    if (s.fase === "jugador") {
      const p = yo(s), me = s.me;
      if (p.inj) { p.inj.weeks--; if (p.inj.weeks <= 0) { feed(s, "Te dieron el alta. Vuelves a entrenar con el grupo.", "bueno"); p.inj = null; } }
      p.fit = clamp(p.fit + 7, 10, 100);
      p.mor = clamp(p.mor + (me.confianza > 60 ? 1.2 : -0.8) + (D.LIFESTYLE[me.estilo].mor * 0.2), 5, 100);
      me.fama = clamp(me.fama * 0.995 - 0.05 + D.LIFESTYLE[me.estilo].fama * 0.25, 0, 100);
      me.adaptacion = clamp(me.adaptacion + 1.2, 0, 100);
      E.declive(p, 0.3);
      finanzasSemana(s, r);
      subirNivel(s);
      if (me.cantera) chequearCantera(s, r);
      if (t !== "pretemporada" && r.chance(0.11) && !me.cantera) eventoDeVida(s, r);
      if (r.chance(0.09) && !me.cantera) ofertaSponsor(s, r);
    } else if (s.fase === "dt" && s.dt) {
      const liga = D.LEAGUES.find((l) => l.id === s.clubs[s.dt.clubId].leagueId);
      s.me.plata += s.dt.sueldo * (1 - liga.tax);
      for (const inv of s.me.inv) E.investTick(r, inv, 1);
    }

    /* El calendario avanza igual, dirijas, juegues o mires de afuera. */
    if (t === "liga") D.LEAGUES.forEach((l) => s.comp.ligas[l.id].fecha++);
    if (t === "copa") avanzarCopa(s, r);
    if (t === "cont") avanzarCont(s, r);
    done();

    s.semana++;
    if (s.semana > SEMANAS) { nuevaTemporada(s); if (s.fase === "dt") autoXI(s); }
  }

  function finanzasSemana(s, r) {
    const p = yo(s), me = s.me;
    const liga = ligaDe(s, p.clubId);
    const sponsors = me.sponsors.reduce((a, x) => a + x.pago, 0);
    const bruto = p.wage + sponsors;
    const impuesto = bruto * liga.tax;
    const agente = p.wage * me.agente.comision;
    const vida = D.LIFESTYLE[me.estilo].cost * p.wage + 10 + liga.tier * 30;  // en la Copa Perú se vive en casa de la vieja
    const neto = bruto - impuesto - agente - vida;
    me.plata += neto;
    me.finanzas.ing += bruto;
    me.finanzas.egr += impuesto + agente + vida;
    for (const inv of me.inv) {
      const d = D.INVESTMENTS.find((x) => x.id === inv.id);
      let mult = me.multNegocio || 1;
      if (d.fama) mult *= clamp(me.fama / 40, 0.3, 2.2);
      E.investTick(r, inv, mult);
      if (d.dt) me.dtxp += 0.35;
    }
    me.multNegocio = 1;
    if (me.plata < 0) {
      /* Nadie te embarga, pero el ánimo se resiente. */
      p.mor = clamp(p.mor - 3, 5, 100);
    }
  }

  /* ¿Te suben al primer equipo? Depende de tu media contra el nivel del club
   * y de cuánto te miró el técnico en la reserva. Si a los 20 no pasó, pasó. */
  function chequearCantera(s, r) {
    const p = yo(s), me = s.me, club = clubDe(s, p);
    const nivel = E.mediaObjetivo(club.prestige);
    const listo = media(p) >= nivel - 7 && me.confianza >= 55;
    if (listo && me.canteraPedido !== s.temporada) {
      const sueldo = wageFor(club, media(p), p.age);
      s.cola.push({
        tipo: "cantera", titulo: "Te suben al primer equipo", sueldo,
        texto: `${club.name} te sube al plantel profesional: ${dinero(sueldo)} por semana. Vas a pelear el puesto con gente hecha.`,
        opts: [
          { txt: `Firmar profesional (${dinero(sueldo)}/sem)`, subir: true },
          { txt: "Pedir un año más en reserva", sub: "Juegas todo, entrenas el doble, pero sigues cobrando una miseria." },
        ],
      });
      me.canteraPedido = s.temporada;
      return;
    }
    if (p.age >= 20) {
      /* No la pegaste: te dan la libertad y hay que bajar a buscar minutos. */
      const destinos = s.clubs.filter((c) => c.leagueId === "pe2" || c.leagueId === "pe3");
      const destino = r.pick(destinos.sort((a, b) => b.prestige - a.prestige).slice(0, 8));
      me.cantera = false;
      const sueldo = wageFor(destino, media(p), p.age);
      transferir(s, destino.id, sueldo, 2, 0);
      feed(s, `${club.name} no te renovó. A los 20 te toca empezar de nuevo, más abajo.`, "malo");
      s.cola.push({
        tipo: "resumen", titulo: "Fin de la cantera",
        texto: `No llegaste al primer equipo de ${club.name}. ${destino.name} te da una oportunidad.`,
        opts: [{ txt: "Seguir" }],
      });
    }
  }

  function subirNivel(s) {
    const me = s.me;
    const need = () => 120 * Math.pow(me.nivel, 1.32);
    while (me.xp >= need()) {
      me.xp -= need();
      me.nivel++; me.puntos++;
      feed(s, `Nivel ${me.nivel}. Tienes un punto de talento para repartir.`, "hito");
    }
  }

  function eventoDeVida(s, r) {
    const ev = r.pick(D.EVENTOS);
    s.cola.push({
      tipo: "decision", titulo: "Fuera de la cancha", texto: ev.texto, evento: ev.id,
      opts: ev.opts.map((o) => ({ txt: o.txt })),
    });
  }

  function resolverDecision(s, i) {
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me;
    const ev = D.EVENTOS.find((x) => x.id === s.pendiente.evento);
    const o = ev.opts[i], ef = o.ef || {};
    /* Los montos declarados son el techo, no el precio fijo: ayudar a tu vieja
     * cuesta lo que puede costar el que gana $40 por semana en la Copa Perú y
     * lo que puede costar el que gana medio millón en la élite. */
    const escala = (monto) => {
      const tope = Math.max(80, p.wage * 6);
      return Math.round(Math.sign(monto) * Math.min(Math.abs(monto), tope));
    };
    let gastado = 0;
    if (ef.plata) { gastado = escala(ef.plata); me.plata += gastado; me.finanzas.egr += Math.max(0, -gastado); }
    if (ef.mor) p.mor = clamp(p.mor + ef.mor, 5, 100);
    if (ef.fama) me.fama = clamp(me.fama + ef.fama, 0, 100);
    if (ef.conf) me.confianza = clamp(me.confianza + ef.conf, 0, 100);
    if (ef.fis) p.attrs.fis = clamp(p.attrs.fis + ef.fis, 20, 99);
    if (ef.men) p.attrs.men = clamp(p.attrs.men + ef.men, 20, 99);
    if (ef.prof) me.prof = clamp(me.prof + ef.prof * 0.02, 0.6, 1.4);
    if (ef.dt) me.dtxp += ef.dt;
    if (ef.comision) me.agente.comision = clamp(me.agente.comision + ef.comision, 0.01, 0.2);
    if (ef.ofertas) me.agente.red = clamp(me.agente.red + ef.ofertas, 0.4, 2);
    if (ef.caps) { me.caps += ef.caps; }
    if (ef.sel) me.selPuntos = (me.selPuntos || 0) + ef.sel;
    if (ef.apuesta) {
      const puesto = Math.abs(gastado) || 1;
      const gano = r.chance(0.42);
      const monto = gano ? Math.round(puesto * (1.8 + r.next() * 3.4)) : 0;
      me.plata += monto;
      if (monto) me.finanzas.ing += monto;
      feed(s, gano ? `El negocio del excompañero salió: ${dinero(monto)}.` : `El negocio del excompañero era humo. Chau ${dinero(puesto)}.`, gano ? "bueno" : "malo");
    }
    feed(s, o.txtRes, "info");
    done();
    return siguiente(s);
  }

  function ofertaSponsor(s, r) {
    const me = s.me;
    const libres = D.SPONSORS.filter((sp) => sp.min <= me.fama && !me.sponsors.some((x) => x.id === sp.id));
    if (!libres.length) return;
    const sp = r.pick(libres);
    const pago = Math.round(sp.base * Math.pow(clamp(me.fama / 50, 0.3, 2.4), 1.25) / 10) * 10;
    s.cola.push({
      tipo: "sponsor", titulo: `Te busca ${sp.marca}`, sponsorId: sp.id, pago,
      texto: `${sp.marca} te ofrece ${dinero(pago)} por semana${sp.riesgo ? ". Aviso: la marca es medio turbia." : "."}`,
      opts: [{ txt: `Firmar (${dinero(pago)}/semana)` }, { txt: "No, gracias" }],
    });
  }

  function resolverSponsor(s, i) {
    const me = s.me, pd = s.pendiente;
    if (i === 0) {
      const sp = D.SPONSORS.find((x) => x.id === pd.sponsorId);
      me.sponsors.push({ id: sp.id, marca: sp.marca, pago: pd.pago, riesgo: !!sp.riesgo });
      me.fama = clamp(me.fama + 1.5, 0, 100);
      feed(s, `Firmaste con ${sp.marca}: ${dinero(pd.pago)} por semana.`, "bueno");
    }
    return siguiente(s);
  }

  /* ============================================== premios / mercado / sel. */
  function premios(s) {
    const p = yo(s), me = s.me;
    const lineas = [];
    for (const l of D.LEAGUES) {
      const tabla = E.sortTable(s.comp.ligas[l.id].tabla);
      const campeon = s.clubs[tabla[0].clubId];
      campeon.titulos.liga++;
      lineas.push(`${l.name}: campeón ${campeon.name} (${tabla[0].pts} pts)`);
      if (campeon.id === p.clubId) {
        me.carrera.titulos.liga++; me.rep = clamp(me.rep + 6, 0, 100); me.fama = clamp(me.fama + 5, 0, 100);
        feed(s, `¡CAMPEONES! ${campeon.name} gana ${l.name}.`, "hito");
      }
    }
    for (const l of D.LEAGUES) {
      const C = s.comp.copa[l.id];
      if (C.campeon != null && C.campeon === p.clubId) {
        me.carrera.titulos.copa++; me.rep = clamp(me.rep + 4, 0, 100);
        feed(s, `Ganaron la ${l.cup}.`, "hito");
      }
    }
    for (const cid of ["condor", "europa"]) {
      const K = s.comp.cont[cid];
      if (K.campeon != null) {
        lineas.push(`Copa ${cid === "condor" ? "Cóndor" : "de Europa"}: ${s.clubs[K.campeon].name}`);
        if (K.campeon === p.clubId) {
          me.carrera.titulos.cont++; me.rep = clamp(me.rep + 12, 0, 100); me.fama = clamp(me.fama + 10, 0, 100);
          feed(s, `COPA INTERNACIONAL. Te vas a acordar de esta noche toda la vida.`, "hito");
        }
      }
    }
    /* El Balón: mejor jugador del mundo de la temporada. */
    const cands = s.players.filter(Boolean).map((q) => {
      const club = s.clubs[q.clubId];
      const tier = D.LEAGUES.find((l) => l.id === club.leagueId).tier;
      const score = q.st.g * 1.5 + q.st.a * 0.9 + media(q) * 0.4 + tier * 5
        + (s.comp.cont.condor.campeon === club.id || s.comp.cont.europa.campeon === club.id ? 14 : 0);
      return { q, score };
    }).sort((a, b) => b.score - a.score);
    const ganador = cands[0].q;
    const puesto = cands.findIndex((c) => c.q.id === 0) + 1;
    if (ganador.id === 0) { me.carrera.balones++; me.fama = clamp(me.fama + 18, 0, 100); me.rep = clamp(me.rep + 14, 0, 100); }
    const goleador = s.players.filter(Boolean).sort((a, b) => b.st.g - a.st.g)[0];

    s.cola.push({
      tipo: "premios", titulo: `Premios ${s.anio}`,
      texto: ganador.id === 0 ? "GANASTE EL BALÓN. Eres el mejor jugador del mundo." : `El Balón fue para ${ganador.name} (${s.clubs[ganador.clubId].name}).`,
      datos: { lineas, balon: ganador.name, goleador: `${goleador.name} — ${goleador.st.g} goles`, tuPuesto: puesto, tus: { ...p.st } },
      opts: [{ txt: "Seguir" }],
    });
  }

  function mercado(s) {
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me;
    const club = clubDe(s, p);
    const m = media(p);
    const ofertas = [];
    /* Quién te quiere: clubes cuyo nivel medio esté cerca de tu media + tu ruido. */
    const interes = m + me.rep * 0.11 + p.form * 1.5 + (p.pot - m) * 0.22 + me.fama * 0.05;
    const jugoPoco = p.st.pj < 10;
    for (const c of s.clubs) {
      if (c.id === club.id) continue;
      const nivel = E.mediaObjetivo(c.prestige);
      if (nivel > interes + 4) continue;                     // te queda grande
      if (nivel < interes - 13) continue;                    // te queda chico
      /* Nadie baja tres escalones si viene jugando: solo se retrocede
       * cuando no sumas minutos y necesitas cancha. */
      if (!jugoPoco && c.prestige < club.prestige - 16) continue;
      /* Nadie salta de la Copa Perú a Europa: se sube de a un escalón. */
      if (D.LEAGUES.find((l) => l.id === c.leagueId).tier > ligaDe(s, club.id).tier + 1) continue;
      const prob = clamp(0.10 * me.agente.red * (1 - Math.abs(nivel - interes) / 16), 0.01, 0.55);
      if (!r.chance(prob)) continue;
      const sueldo = Math.round(wageFor(c, m, p.age) * (0.9 + r.next() * 0.45));
      const rol = nivel > m + 2 ? "rotación" : nivel > m - 4 ? "titular a pelear" : "estrella del equipo";
      const prima = Math.round(sueldo * r.int(6, 30));
      ofertas.push({
        txt: `${c.name} — ${dinero(sueldo)}/sem, ${r.int(2, 5)} años`,
        sub: `${D.LEAGUES.find((l) => l.id === c.leagueId).name} · prestigio ${c.prestige} · rol: ${rol} · prima ${dinero(prima)}`,
        club: c.id, sueldo, anios: r.int(2, 5), prima, rol,
      });
    }
    ofertas.sort((a, b) => s.clubs[b.club].prestige - s.clubs[a.club].prestige);
    const top = ofertas.slice(0, 4);

    /* Renovación del club actual si te queda poco contrato. */
    const renov = p.years <= 1 ? {
      txt: `Renovar con ${club.name} — ${dinero(Math.round(wageFor(club, m, p.age) * 1.15))}/sem`,
      sub: `${club.name} te quiere. ${me.confianza > 60 ? "El técnico está contigo." : "El técnico no está muy convencido."}`,
      renovar: true, sueldo: Math.round(wageFor(club, m, p.age) * 1.15), anios: 3,
    } : null;

    done();
    if (!top.length && !renov) {
      feed(s, "Mercado cerrado sin novedades. Sigues donde estás.", "info");
      return;
    }
    const opts = top.slice();
    if (renov) opts.push(renov);
    opts.push({ txt: "Quedarme como estoy", quedarse: true, sub: p.years <= 0 ? "Ojo: te quedas sin contrato." : `Te quedan ${p.years} años de contrato.` });
    s.cola.push({
      tipo: "mercado", titulo: "Mercado de pases",
      texto: `Tu valor de mercado: ${dinero(valueOf(p))}. Media ${m}, ${p.age} años.`,
      opts,
    });
  }

  function resolverMercado(s, i) {
    const p = yo(s), me = s.me;
    const o = s.pendiente.opts[i];
    if (o.quedarse) { feed(s, "Te quedas. Hay lealtad todavía.", "info"); return siguiente(s); }
    if (o.renovar) {
      p.wage = o.sueldo; p.years = o.anios;
      me.contrato.golBonus = Math.round(o.sueldo * 1.2);
      me.plata += o.sueldo * 4; me.finanzas.ing += o.sueldo * 4;
      feed(s, `Renovaste con ${clubDe(s, p).name}: ${dinero(o.sueldo)}/semana por ${o.anios} años.`, "bueno");
      return siguiente(s);
    }
    transferir(s, o.club, o.sueldo, o.anios, o.prima);
    return siguiente(s);
  }

  function transferir(s, clubId, sueldo, anios, prima) {
    const p = yo(s), me = s.me;
    const viejo = clubDe(s, p), nuevo = s.clubs[clubId];
    viejo.squad = viejo.squad.filter((x) => x !== 0);
    nuevo.squad.push(0);
    p.clubId = clubId; p.leagueId = nuevo.leagueId;
    p.wage = sueldo; p.years = anios;
    me.contrato.golBonus = Math.round(sueldo * 1.2);
    me.contrato.pjBonus = Math.round(sueldo * 0.15);
    me.plata += prima || 0; me.finanzas.ing += prima || 0;
    me.confianza = 55; me.quimica = 40;
    const cruzoOceano = D.LEAGUES.find((l) => l.id === viejo.leagueId).region !== D.LEAGUES.find((l) => l.id === nuevo.leagueId).region;
    me.adaptacion = cruzoOceano ? clamp(55 + me.idioma * 0.35, 40, 95) : 88;
    if (!me.carrera.clubes.includes(nuevo.name)) me.carrera.clubes.push(nuevo.name);
    feed(s, `Fichaste por ${nuevo.name}. ${dinero(sueldo)}/semana${prima ? `, prima de ${dinero(prima)}` : ""}.`, "hito");
  }

  function seleccion(s) {
    const { r, done } = rngDe(s);
    const p = yo(s), me = s.me;
    const m = media(p);
    const umbral = 62 + s.temporada * 0.15;
    const llamado = m + me.rep * 0.2 + (me.selPuntos || 0) > umbral && !p.inj;
    if (!llamado) {
      done();
      s.cola.push({ tipo: "resumen", titulo: "Sin llamado", texto: "La selección no te citó esta vez. Se ve por TV como todos.", opts: [{ txt: "Seguir" }] });
      return;
    }
    const esMundial = s.anio % 4 === 0;
    const torneo = esMundial ? "el Mundial" : "la Copa de Naciones";
    let g = 0, pj = 0, rat = 0;
    const rondas = esMundial ? 5 : 4;
    let vivos = true;
    for (let i = 0; i < rondas && vivos; i++) {
      pj++; me.caps++;
      const perf = E.perfRoll(r, p, { local: false, rivalRating: 70 + i * 2, equipoRating: 62 + me.rep * 0.1 });
      const goles = r.chance(clamp(D.SHARE[p.pos].gol * Math.exp((perf - m) / 20), 0, 0.8)) ? 1 : 0;
      g += goles; me.golesSel += goles;
      rat += E.ratingFrom(perf, m, { gol: goles });
      if (i >= 2 && r.chance(0.42)) vivos = false;
    }
    const campeon = vivos && r.chance(0.35);
    if (campeon) { me.carrera.titulos.sel++; me.fama = clamp(me.fama + 14, 0, 100); me.rep = clamp(me.rep + 10, 0, 100); }
    me.fama = clamp(me.fama + pj * 0.8 + g * 1.5, 0, 100);
    me.rep = clamp(me.rep + g * 0.8 + 1, 0, 100);
    done();
    s.cola.push({
      tipo: "resumen", titulo: `Selección — ${torneo}`,
      texto: `${pj} partidos, ${g} goles, promedio ${(rat / Math.max(1, pj)).toFixed(1)}.${campeon ? " CAMPEONES. La ciudad no durmió." : vivos ? " Buena campaña." : " Eliminados antes de lo que querías."}`,
      opts: [{ txt: "Seguir" }],
    });
  }

  function cerrarTemporada(s) {
    const p = yo(s), me = s.me;
    const tabla = E.sortTable(s.comp.ligas[clubDe(s, p).leagueId].tabla);
    const pos = tabla.findIndex((x) => x.clubId === p.clubId) + 1;
    me.hist.push({
      temporada: s.temporada, anio: s.anio, club: clubDe(s, p).name, edad: p.age,
      media: media(p), pj: p.st.pj, g: p.st.g, a: p.st.a, mvp: p.st.mvp,
      rat: p.st.pj ? +(p.st.rat / p.st.pj).toFixed(2) : 0, pos, sueldo: p.wage, plata: Math.round(patrimonio(s)),
    });
    p.years = Math.max(0, p.years - 1);
    if (p.years === 0) feed(s, "Tu contrato se termina. En el próximo mercado hay que decidir.", "info");
    /* ¿Colgamos? */
    const m = media(p);
    if (p.age >= 40 || (p.age >= 31 && m < 55) || (p.age >= 34 && p.st.pj < 8)) {
      s.cola.push({
        tipo: "retiro", titulo: "El cuerpo habla", forzado: p.age >= 40,
        texto: p.age >= 40 ? "Cuarenta años. Se terminó, y está bien." : `Tienes ${p.age} y ${p.st.pj} partidos esta temporada. Hay que decidir.`,
        opts: p.age >= 40 ? [{ txt: "Colgar los botines" }] : [{ txt: "Colgar los botines" }, { txt: "Un año más" }],
      });
    } else if (p.age >= 30) {
      s.cola.push({
        tipo: "retiro", titulo: "¿Seguimos?",
        texto: `${p.age} años, media ${m}. Puedes seguir o empezar la otra vida.`,
        opts: [{ txt: "Colgar los botines" }, { txt: "Un año más" }],
      });
    }
  }

  const patrimonio = (s) => s.me.plata + s.me.inv.reduce((a, x) => a + x.value, 0);

  /* ================================================================= retiro */
  function retirarse(s) {
    const p = yo(s), me = s.me;
    s.fase = "retirado";
    /* Sales del plantel: un retirado no puede seguir apareciendo en la tabla. */
    const club = clubDe(s, p);
    club.squad = club.squad.filter((x) => x !== 0);
    p.retirado = true; p.wage = 0;
    const c = me.carrera;
    feed(s, `Te retiraste con ${c.pj} partidos, ${c.g} goles y ${c.titulos.liga + c.titulos.copa + c.titulos.cont} títulos.`, "hito");
    const costo = Math.round(clamp(180000 - me.dtxp * 2200, 25000, 180000));
    s.cola.push({
      tipo: "licencia", titulo: "La licencia de entrenador", costo,
      texto: `El curso cuesta ${dinero(costo)}. Tu experiencia táctica (${Math.round(me.dtxp)}) te lo abarató. Tienes ${dinero(patrimonio(s))}.`,
      opts: [
        { txt: `Sacar la licencia (${dinero(costo)})`, sacar: true },
        { txt: "Vivir de las rentas", sacar: false },
      ],
    });
  }

  function resolverLicencia(s, i) {
    const me = s.me;
    const o = s.pendiente.opts[i];
    if (!o.sacar || me.plata < s.pendiente.costo) {
      if (o.sacar) feed(s, "No te alcanza la plata para el curso. Ironía cruel.", "malo");
      s.fase = "fin";
      s.cola.push(pantallaFinal(s, "Te quedaste viendo fútbol desde el sofá."));
      return siguiente(s);
    }
    me.plata -= s.pendiente.costo;
    me.licencia = 1;
    feed(s, "Licencia de entrenador en mano. Ahora hay que conseguir banco.", "hito");
    ofertasDT(s);
    return siguiente(s);
  }

  /* ==================================================================== DT */
  function ofertasDT(s, despedido, conTrabajo) {
    const { r, done } = rngDe(s);
    const me = s.me;
    /* Prestigio como técnico: lo que hiciste como jugador pesa, pero baja. */
    const c = me.carrera;
    const repDT = me.repDT != null ? me.repDT
      : clamp(c.titulos.cont * 9 + c.titulos.liga * 5 + c.balones * 12 + me.rep * 0.45 + me.dtxp * 0.25, 5, 92);
    me.repDT = repDT;
    const techo = repDT + (despedido ? -8 : 0);
    const actual = conTrabajo && s.dt ? s.clubs[s.dt.clubId] : null;
    const cand = s.clubs.filter((cl) => cl.prestige <= techo + 8 && cl.prestige >= techo - 34)
      .filter((cl) => !actual || (cl.id !== actual.id && cl.prestige > actual.prestige + 4))
      .sort((a, b) => Math.abs(a.prestige - techo) - Math.abs(b.prestige - techo)).slice(0, 8);
    const elegidos = r.shuffle(cand).slice(0, 3);
    if (!elegidos.length) {
      done();
      if (conTrabajo) return;                 // ya tienes club, no pasa nada
      s.fase = "fin";
      s.cola.push(pantallaFinal(s, "Nadie te ofreció un banco. El teléfono no volvió a sonar."));
      return;
    }
    const opts = elegidos.map((cl) => {
      const liga = D.LEAGUES.find((l) => l.id === cl.leagueId);
      const obj = objetivoPara(cl, s);
      const sueldo = Math.round(E.TIER_WAGE[liga.tier] * (0.4 + cl.prestige / 100) * 1.6 / 100) * 100;
      return {
        txt: `${cl.name} — ${dinero(sueldo)}/sem`,
        sub: `${liga.name} · prestigio ${cl.prestige} · objetivo: ${obj.txt}`,
        club: cl.id, sueldo, obj,
      };
    });
    if (conTrabajo && actual) opts.push({ txt: `Quedarme en ${actual.name}`, quedarse: true, sub: "Lealtad, proyecto, comodidad. Elige tú." });
    else opts.push({ txt: "Esperar una mejor", esperar: true, sub: "Te quedas sin chamba una temporada." });
    done();
    s.cola.push({
      tipo: "dt_oferta",
      titulo: conTrabajo ? "Te vienen a buscar" : "Ofertas para dirigir",
      texto: `Tu prestigio como técnico: ${Math.round(repDT)}/100.`, opts,
    });
  }

  function objetivoPara(club, s) {
    const rivales = s.clubs.filter((c) => c.leagueId === club.leagueId).sort((a, b) => b.prestige - a.prestige);
    const idx = rivales.findIndex((c) => c.id === club.id);
    if (idx === 0) return D.OBJETIVOS[4];
    if (idx <= 2) return D.OBJETIVOS[3];
    if (idx <= 5) return D.OBJETIVOS[2];
    if (idx <= 8) return D.OBJETIVOS[1];
    return D.OBJETIVOS[0];
  }

  function resolverOfertaDT(s, i) {
    const o = s.pendiente.opts[i];
    if (o.quedarse) { feed(s, `Rechazaste las ofertas: sigues en ${s.clubs[s.dt.clubId].name}.`, "info"); return siguiente(s); }
    s.necesitaCierre = false;      // el calendario lo reinicia nuevaTemporada
    if (o.esperar) {
      s.fase = "retirado";
      nuevaTemporada(s);
      s.me.repDT = clamp(s.me.repDT - 4, 0, 100);   // un año afuera se paga
      ofertasDT(s);
      return siguiente(s);
    }
    s.fase = "dt";
    s.dt = {
      clubId: o.club, sueldo: o.sueldo, objetivo: o.obj, paciencia: 62,
      formacion: "4-4-2", estilo: "posesion", mentalidad: "equil",
      entrenamiento: "tecnico", xi: null, temporadas: 0,
      record: { pj: 0, g: 0, e: 0, p: 0, titulos: 0 },
    };
    feed(s, `Firmaste como DT de ${s.clubs[o.club].name}. Objetivo: ${o.obj.txt}.`, "hito");
    nuevaTemporada(s);      // arranca una temporada limpia desde la semana 1
    autoXI(s);
    return siguiente(s);
  }

  function plantelDT(s) {
    const club = s.clubs[s.dt.clubId];
    return club.squad.map((id) => s.players[id]).filter(Boolean);
  }

  function autoXI(s) {
    const f = D.FORMATIONS[s.dt.formacion];
    const disp = plantelDT(s).filter((p) => !p.inj).sort((a, b) => media(b) - media(a));
    const xi = [];
    const usados = new Set();
    for (const pos in f.lines) {
      let n = f.lines[pos];
      for (const p of disp) {
        if (n <= 0) break;
        if (usados.has(p.id)) continue;
        if (p.pos !== pos) continue;
        xi.push(p.id); usados.add(p.id); n--;
      }
      /* Si falta gente del puesto, se completa con lo que haya (fuera de puesto). */
      for (const p of disp) {
        if (n <= 0) break;
        if (usados.has(p.id)) continue;
        if (D.POSITIONS[p.pos].line !== D.POSITIONS[pos].line) continue;
        xi.push(p.id); usados.add(p.id); n--;
      }
      while (n > 0) {
        const p = disp.find((q) => !usados.has(q.id));
        if (!p) break;
        xi.push(p.id); usados.add(p.id); n--;
      }
    }
    s.dt.xi = xi;
    return xi;
  }

  function fuerzaDT(s, clubId, xi) {
    const f = D.FORMATIONS[s.dt.formacion];
    const ment = D.MENTALITIES.find((m) => m.id === s.dt.mentalidad);
    const ps = (xi || []).map((id) => s.players[id]).filter(Boolean);
    if (ps.length < 7) return { total: E.clubRating(s, clubId), def: 60, atk: 60 };
    const lineas = { por: [], def: [], med: [], atk: [] };
    for (const p of ps) {
            lineas[D.POSITIONS[p.pos].line].push(media(p) + p.form * 0.8 + (p.fit - 90) * 0.06);
    }
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 55);
    const def = (avg(lineas.por) * 0.3 + avg(lineas.def) * 0.5 + avg(lineas.med) * 0.2) * f.def * ment.def;
    const atk = (avg(lineas.atk) * 0.5 + avg(lineas.med) * 0.35 + avg(lineas.def) * 0.15) * f.atk * ment.atk;
    /* Misma escala que E.clubRating: si no, tu equipo arranca abajo de todos
     * los rivales por una cuenta distinta y pierdes partidos por un bug. */
    const club = s.clubs[clubId];
    const escala = (v) => v * 0.86 + club.prestige * 0.145 + club.form * 0.5;
    return { def: escala(def), atk: escala(atk), total: escala((def + atk) / 2) };
  }

  function arrancarSemanaDT(s) {
    const t = tipoSemana(s);
    if (t === "premios") { premios(s); premiosDT(s); return null; }
    if (t === "mercado") { mercadoDT(s); return null; }
    if (t === "seleccion") return null;
    if (t === "vacaciones") { cerrarTemporadaDT(s); return null; }
    const info = t === "liga" || t === "copa" || t === "cont" ? rivalDe(s, t) : null;
    const club = s.clubs[s.dt.clubId];
    return {
      tipo: "dt_semana",
      titulo: info ? `${info.local ? "vs" : "visita a"} ${s.clubs[info.rival].name}` : t === "pretemporada" ? "Pretemporada" : "Semana sin partido",
      texto: `${club.name} · paciencia de la dirigencia ${Math.round(s.dt.paciencia)}/100 · objetivo: ${s.dt.objetivo.txt}`,
      opts: [
        { txt: "◎  Entrenar técnica", sub: "Sube pase/regate/tiro del plantel.", ent: "tecnico" },
        { txt: "▲  Entrenar físico", sub: "Sube físico y estado de forma.", ent: "fisico" },
        { txt: "▤  Entrenar táctica", sub: "Sube defensa y mentalidad; menos goles en contra.", ent: "tactico" },
        { txt: "☾  Semana suave", sub: "Recupera físico y ánimo del plantel.", ent: "descanso" },
      ],
    };
    return s.pendiente;
  }

  function resolverSemanaDT(s, i) {
    const { r, done } = rngDe(s);
    const ent = s.pendiente.opts[i].ent;
    s.dt.entrenamiento = ent;
    const plantel = plantelDT(s);
    const mapa = { tecnico: ["pas", "reg", "tir"], fisico: ["fis", "rit"], tactico: ["def", "men"], descanso: [] };
    for (const p of plantel) {
      if (p.inj) { p.inj.weeks--; if (p.inj.weeks <= 0) p.inj = null; }
      E.train(r, p, mapa[ent], ent === "descanso" ? 0 : 0.55, 1);
      /* La recuperación semanal tiene que compensar el desgaste del partido:
       * si no, tu plantel llega roto a diciembre y el rival intacto. */
      p.fit = clamp(p.fit + (ent === "descanso" ? 24 : ent === "fisico" ? 8 : 14), 25, 100);
      p.mor = clamp(p.mor + (ent === "descanso" ? 4 : 0) + (60 - p.mor) * 0.05, 5, 100);
    }
    const t = tipoSemana(s);
    if (t === "liga") simFechaLiga(s, r);
    if (t === "copa") simRondaCopa(s, r);
    if (t === "cont") simFechaCont(s, r);
    done();
    const info = t === "liga" || t === "copa" || t === "cont" ? rivalDe(s, t) : null;
    if (info) partidoDT(s, t, info);
    else {
      s.cola.push({ tipo: "resumen", titulo: "Semana de trabajo", texto: "Sin partido. Se entrenó y se miró video.", opts: [{ txt: "Seguir" }] });
    }
    return siguiente(s);
  }

  function partidoDT(s, t, info) {
    const { r, done } = rngDe(s);
    if (!s.dt.xi || s.dt.xi.some((id) => !s.players[id] || s.players[id].inj)) autoXI(s);
    const mio = fuerzaDT(s, s.dt.clubId, s.dt.xi);
    const rivalClub = s.clubs[info.rival];
    const rr = E.clubRating(s, rivalClub.id);
    const estiloRival = ["posesion", "presion", "contra", "directo"][r.int(0, 3)];
    const st = D.STYLES[s.dt.estilo];
    const bonus = st.gana === estiloRival ? 2.6 : st.pierde === estiloRival ? -2.6 : 0;
    const mioTotal = mio.total + bonus;
    const res1 = E.simTiempo(r, info.local ? mioTotal : rr, info.local ? rr : mioTotal, !!info.neutral, 0.5);
    const g1 = { mios: info.local ? res1.gh : res1.ga, rival: info.local ? res1.ga : res1.gh };
    s.dtPartido = { t, info, estiloRival, bonus, g1, mio, rr };
    done();
    s.cola.push({
      tipo: "dt_entretiempo",
      titulo: `Entretiempo: ${g1.mios} - ${g1.rival} vs ${rivalClub.name}`,
      texto: `Ellos juegan ${D.STYLES[estiloRival].name.toLowerCase()}. ${bonus > 0 ? "Tu plan les gana la pulseada." : bonus < 0 ? "Tu plan les queda cómodo a ellos." : "Están parejos tácticamente."}`,
      opts: [
        { txt: "Arenga en el vestuario", sub: "Empuje anímico, algo de riesgo.", aj: "arenga" },
        { txt: "Meter un delantero", sub: "Más ataque, más expuesto atrás.", aj: "ofensivo" },
        { txt: "Cerrar el partido", sub: "Menos goles de los dos lados.", aj: "defensivo" },
        { txt: "No tocar nada", sub: "Confías en el plan.", aj: "nada" },
      ],
    });
  }

  function resolverEntretiempo(s, i) {
    const { r, done } = rngDe(s);
    const P = s.dtPartido;
    const aj = s.pendiente.opts[i].aj;
    const club = s.clubs[s.dt.clubId], rival = s.clubs[P.info.rival];
    let dAtk = 0, dDef = 0;
    if (aj === "arenga") { dAtk = 1.6; dDef = 0.8; if (r.chance(0.2)) { dAtk = -1; dDef = -1; } }
    if (aj === "ofensivo") { dAtk = 3.2; dDef = -2.6; }
    if (aj === "defensivo") { dAtk = -2.4; dDef = 3.4; }
    const mio2 = P.mio.total + P.bonus + (dAtk + dDef) / 2;
    const res2 = E.simTiempo(r, P.info.local ? mio2 : P.rr, P.info.local ? P.rr : mio2, !!P.info.neutral, 0.5);
    const g2 = { mios: P.info.local ? res2.gh : res2.ga, rival: P.info.local ? res2.ga : res2.gh };
    const finales = { mios: P.g1.mios + g2.mios, rival: P.g1.rival + g2.rival };

    golAleatorio(s, r, club.id, finales.mios);
    golAleatorio(s, r, rival.id, finales.rival);
    for (const id of s.dt.xi) {
      const p = s.players[id];
      if (!p) continue;
      p.st.pj++; p.st.min += 90;
      p.fit = clamp(p.fit - r.int(8, 14), 20, 100);
      const les = E.injuryRoll(r, p, 90, 0);
      if (les) p.inj = les;
      p.form = clamp(p.form * 0.7 + (finales.mios - finales.rival) * 0.3, -3, 3);
    }
    const local = P.info.local;
    const gh = local ? finales.mios : finales.rival, ga = local ? finales.rival : finales.mios;
    const h = local ? club.id : rival.id, a = local ? rival.id : club.id;
    if (P.t === "liga") E.applyResult(s.comp.ligas[club.leagueId].tabla, h, a, gh, ga);
    if (P.t === "copa") {
      const C = s.comp.copa[club.leagueId];
      C.ganadores = C.ganadores || [];
      C.ganadores.push(finales.mios >= finales.rival ? club.id : rival.id);
    }
    if (P.t === "cont") {
      const cid = D.LEAGUES.find((l) => l.id === club.leagueId).cont;
      const K = cid ? s.comp.cont[cid] : null;
      if (K && K.fase === "grupos") {
        const g = K.grupos.findIndex((gr) => gr.includes(club.id));
        if (g >= 0) E.applyResult(K.tablas[g], h, a, gh, ga);
      } else if (K && K.fase === "semis") { K.ganadores = K.ganadores || []; K.ganadores.push(finales.mios >= finales.rival ? club.id : rival.id); }
      else if (K && K.fase === "final") coronarCont(s, cid, finales.mios >= finales.rival ? club.id : rival.id);
    }
    club.form = clamp(club.form * 0.7 + (finales.mios - finales.rival) * 0.25, -3, 3);

    const R = s.dt.record;
    R.pj++;
    if (finales.mios > finales.rival) { R.g++; s.dt.paciencia = clamp(s.dt.paciencia + 5.5, 0, 100); }
    else if (finales.mios === finales.rival) { R.e++; s.dt.paciencia = clamp(s.dt.paciencia - 0.8, 0, 100); }
    else { R.p++; s.dt.paciencia = clamp(s.dt.paciencia - 6.5, 0, 100); }
    feed(s, `${club.name} ${finales.mios}-${finales.rival} ${rival.name}`, finales.mios > finales.rival ? "bueno" : finales.mios < finales.rival ? "malo" : "info");
    if (r.chance(0.14)) prensaDT(s, r);
    done();
    s.cola.push({
      tipo: "resumen", titulo: `${club.name} ${finales.mios} - ${finales.rival} ${rival.name}`,
      texto: `Segundo tiempo: ${g2.mios}-${g2.rival}. Paciencia de la dirigencia: ${Math.round(s.dt.paciencia)}/100.`,
      partido: {
        minutos: 0, ev: null, narracion: [],
        resTxt: finales.mios > finales.rival ? "ganamos" : finales.mios < finales.rival ? "perdimos" : "empatamos",
        marcador: {
          clubId: club.id, rivalId: rival.id, mios: finales.mios, rival: finales.rival, local,
          comp: P.t === "liga" ? ligaDe(s, club.id).name : P.t === "copa" ? ligaDe(s, club.id).cup : "Copa internacional",
        },
      },
      opts: [{ txt: "Seguir" }],
    });
    return siguiente(s);
  }

  function prensaDT(s, r) {
    const q = r.pick(D.PRENSA);
    s.cola.push({ tipo: "dt_prensa", titulo: "Rueda de prensa", texto: q.q, prensa: D.PRENSA.indexOf(q), opts: q.opts.map((o) => ({ txt: o.txt })) });
  }

  function resolverPrensa(s, i) {
    const q = D.PRENSA[s.pendiente.prensa];
    const o = q.opts[i];
    s.dt.paciencia = clamp(s.dt.paciencia + o.dir, 0, 100);
    for (const p of plantelDT(s)) p.mor = clamp(p.mor + o.vest * 0.4, 5, 100);
    s.me.fama = clamp(s.me.fama + Math.abs(o.hin) * 0.2, 0, 100);
    feed(s, `Rueda de prensa: «${o.txt.slice(1, 40)}…»`, "info");
    return siguiente(s);
  }

  function mercadoDT(s) {
    const { r, done } = rngDe(s);
    const club = s.clubs[s.dt.clubId];
    const presupuesto = Math.round(Math.exp(club.prestige / 16) * 90000);
    const objetivos = s.players.filter(Boolean)
      .filter((p) => p.clubId !== club.id && p.id !== 0 && valueOf(p) <= presupuesto && media(p) > E.mediaObjetivo(club.prestige) - 4)
      .sort((a, b) => media(b) - media(a)).slice(0, 30);
    const opts = r.shuffle(objetivos).slice(0, 3).map((p) => ({
      txt: `${p.name} (${p.pos}, ${p.age}) — ${dinero(valueOf(p))}`,
      sub: `media ${media(p)} · potencial ${p.pot} · viene de ${s.clubs[p.clubId].name}`,
      fichar: p.id, precio: valueOf(p),
    }));
    opts.push({ txt: "No fichar a nadie", sub: `Presupuesto disponible: ${dinero(presupuesto)}.` });
    done();
    s.cola.push({ tipo: "dt_mercado", titulo: "Mercado de pases", texto: `Presupuesto: ${dinero(presupuesto)}.`, opts, presupuesto });
  }

  function resolverMercadoDT(s, i) {
    const o = s.pendiente.opts[i];
    if (o.fichar != null) {
      const p = s.players[o.fichar];
      const viejo = s.clubs[p.clubId], club = s.clubs[s.dt.clubId];
      viejo.squad = viejo.squad.filter((x) => x !== p.id);
      club.squad.push(p.id);
      p.clubId = club.id; p.leagueId = club.leagueId;
      p.wage = wageFor(club, media(p), p.age); p.years = 3;
      feed(s, `Fichaste a ${p.name} por ${dinero(o.precio)}.`, "bueno");
      autoXI(s);
    }
    return siguiente(s);
  }

  function premiosDT(s) {
    const club = s.clubs[s.dt.clubId];
    const tabla = E.sortTable(s.comp.ligas[club.leagueId].tabla);
    const pos = tabla.findIndex((x) => x.clubId === club.id) + 1;
    const cumplio = pos <= s.dt.objetivo.pos;
    s.dt.paciencia = clamp(s.dt.paciencia + (cumplio ? 26 : -34), 0, 100);
    s.me.repDT = clamp(s.me.repDT + (cumplio ? 6 : -5) + (pos === 1 ? 9 : 0), 0, 100);
    if (pos === 1) s.dt.record.titulos++;
    s.cola.push({
      tipo: "resumen", titulo: cumplio ? "Objetivo cumplido" : "Objetivo incumplido",
      texto: `${club.name} terminó ${pos}º. Pedían: ${s.dt.objetivo.txt}. Prestigio de DT: ${Math.round(s.me.repDT)}.`,
      opts: [{ txt: "Seguir" }],
    });
    if (!cumplio && s.dt.paciencia <= 12) {
      s.cola.push({ tipo: "dt_despido", titulo: "Te echaron", texto: `${club.name} te agradece los servicios prestados. Así es esto.`, opts: [{ txt: "Buscar otro banco" }] });
    }
  }

  function histDT(s) {
    if (!s.dt) return;
    s.me.dtTemporadas = (s.me.dtTemporadas || 0) + 1;   // cuenta entre todos los clubes
    s.me.hist.push({
      temporada: s.temporada, anio: s.anio, club: s.clubs[s.dt.clubId].name, dt: true,
      pj: s.dt.record.pj, g: s.dt.record.g, e: s.dt.record.e, p: s.dt.record.p,
      rep: Math.round(s.me.repDT), titulos: s.dt.record.titulos,
    });
  }

  function cerrarTemporadaDT(s) {
    s.dt.temporadas++;
    histDT(s);
    s.dt.record = { pj: 0, g: 0, e: 0, p: 0, titulos: s.dt.record.titulos };
    /* Si tu prestigio se le escapó al club, viene alguien más grande a buscarte. */
    const club = s.clubs[s.dt.clubId];
    if (s.me.repDT > club.prestige + 10) ofertasDT(s, false, true);
    if (s.me.dtTemporadas >= 12 || yo(s).age >= 62) {
      s.cola.push({
        tipo: "dt_fin", titulo: "Se termina el viaje",
        texto: `${s.me.dtTemporadas} temporadas dirigiendo y ${yo(s).age} años. Es hora.`,
        opts: [{ txt: "Colgar el pizarrón" }],
      });
    }
  }

  function pantallaFinal(s, cierre) {
    const me = s.me, c = me.carrera;
    return {
      tipo: "fin", titulo: "Tu legado", texto: cierre,
      datos: {
        pj: c.pj, g: c.g, a: c.a, mvp: c.mvp, balones: c.balones,
        titulos: c.titulos, caps: me.caps, golesSel: me.golesSel,
        patrimonio: Math.round(patrimonio(s)), clubes: c.clubes,
        rating: c.pj ? +(c.ratSum / c.pj).toFixed(2) : 0,
        dt: s.dt ? { temporadas: s.dt.temporadas, titulos: s.dt.record.titulos, rep: Math.round(me.repDT || 0) } : null,
      },
      opts: [],
    };
  }

  /* ============================================================== acciones */
  /* Cosas que puedes hacer en cualquier momento, fuera de la cola. */
  function gastarPunto(s, attr) {
    const me = s.me, p = yo(s);
    if (me.puntos <= 0) return false;
    if (p.attrs[attr] >= 99) return false;
    me.puntos--;
    p.attrs[attr] = clamp(p.attrs[attr] + 1, 20, 99);
    p.pot = Math.max(p.pot, media(p));
    return true;
  }

  function invertir(s, id, monto) {
    const me = s.me;
    const d = D.INVESTMENTS.find((x) => x.id === id);
    if (!d || monto < d.min || me.plata < monto) return false;
    me.plata -= monto;
    const ex = me.inv.find((x) => x.id === id);
    if (ex) ex.value += monto; else me.inv.push({ id, value: monto, last: 0 });
    return true;
  }

  function retirarInv(s, id) {
    const me = s.me;
    const ix = me.inv.findIndex((x) => x.id === id);
    if (ix < 0) return false;
    me.plata += me.inv[ix].value;
    me.inv.splice(ix, 1);
    return true;
  }

  function setEstilo(s, i) { s.me.estilo = clamp(i, 0, D.LIFESTYLE.length - 1); }
  function setTactica(s, campo, val) {
    if (!s.dt) return;
    s.dt[campo] = val;
    if (campo === "formacion") autoXI(s);
  }
  function setXI(s, ids) { if (s.dt) s.dt.xi = ids.slice(0, 11); }

  /* ================================================================ router */
  function resolver(s, i) {
    const pd = s.pendiente;
    if (!pd) return siguiente(s);
    switch (pd.tipo) {
      case "inicio": {
        const o = pd.opts[i];
        const p = yo(s);
        const club = s.clubs[o.club];
        clubDe(s, p).squad = clubDe(s, p).squad.filter((x) => x !== 0);
        p.clubId = club.id; p.leagueId = club.leagueId; p.wage = o.sueldo; p.years = 3;
        s.me.carrera.clubes.push(club.name);
        s.me.contrato.golBonus = Math.round(o.sueldo * 1.5);
        if (o.cantera) {
          /* En la cantera no entras al plantel profesional: juegas la reserva
           * hasta que el técnico se digne a mirarte. */
          s.me.cantera = true;
          s.me.confianza = 30;
          feed(s, `Entraste a la cantera de ${club.name}. Ahora hay que ganarse el ascenso al primer equipo.`, "hito");
        } else {
          club.squad.push(0);
          s.me.confianza = 35 + o.minutos * 0.3;
          feed(s, `Firmaste tu primer contrato con ${club.name}.`, "hito");
        }
        return siguiente(s);
      }
      case "accion": {
        aplicarAccion(s, pd.opts[i].accion);
        jugarSemana(s);
        return siguiente(s);
      }
      case "cantera": {
        if (i === 0) {
          const p = yo(s), club = clubDe(s, p);
          s.me.cantera = false;
          club.squad.push(0);
          p.wage = pd.sueldo; p.years = 3;
          s.me.contrato.golBonus = Math.round(pd.sueldo * 1.2);
          s.me.confianza = 55;
          feed(s, `Debutas en el primer equipo de ${club.name}.`, "hito");
        } else feed(s, "Un año más en reserva. Vas a volver más hecho.", "info");
        return siguiente(s);
      }
      case "momento": return resolverMomento(s, i);
      case "decision": return resolverDecision(s, i);
      case "sponsor": return resolverSponsor(s, i);
      case "mercado": return resolverMercado(s, i);
      case "resumen": return siguiente(s);
      case "premios": return siguiente(s);
      case "retiro": {
        if (i === 0) { retirarse(s); return siguiente(s); }
        feed(s, "Un año más. El cuerpo aguanta, la cabeza quiere.", "info");
        return siguiente(s);
      }
      case "licencia": return resolverLicencia(s, i);
      case "dt_oferta": return resolverOfertaDT(s, i);
      case "dt_semana": return resolverSemanaDT(s, i);
      case "dt_entretiempo": return resolverEntretiempo(s, i);
      case "dt_prensa": return resolverPrensa(s, i);
      case "dt_mercado": return resolverMercadoDT(s, i);
      case "dt_despido": {
        histDT(s);
        const basta = s.me.dtTemporadas >= 12 || yo(s).age >= 62;
        s.fase = "retirado"; s.dt = null;
        if (basta) {
          s.cola.push({ tipo: "dt_fin", titulo: "Hasta acá llegamos", texto: "Después de tantos bancos y tantos despidos, no hay ganas de empezar de nuevo.", opts: [{ txt: "Colgar el pizarrón" }] });
        } else ofertasDT(s, true);
        return siguiente(s);
      }
      case "dt_fin": {
        s.fase = "fin";
        s.cola.push(pantallaFinal(s, "Colgaste el pizarrón. Ahora sí, a mirar fútbol tranquilo."));
        return siguiente(s);
      }
      case "fin": return s.pendiente;
      default: return siguiente(s);
    }
  }

  /* ============================================================ save/load */
  function guardar(s) {
    return JSON.stringify({
      v: s.v, seed: s.seed, rngState: s.rngState, fase: s.fase, temporada: s.temporada,
      anio: s.anio, semana: s.semana, clubs: s.clubs, players: s.players, comp: s.comp,
      feed: s.feed.slice(0, 80), cola: s.cola, pendiente: s.pendiente, partido: s.partido,
      dt: s.dt, dtPartido: s.dtPartido, me: s.me,
    });
  }
  function cargar(txt) {
    if (!txt) return null;
    try {
      const o = JSON.parse(txt);
      if (!o || o.v !== 1 || !o.players) return null;
      return o;
    } catch { return null; }
  }

  const Exported = {
    SEMANAS, W_LIGA, W_COPA, W_CONT, W_LIBRE, PERFILES,
    nuevaPartida, resolver, siguiente, tipoSemana, rivalDe, patrimonio, dinero,
    gastarPunto, invertir, retirarInv, setEstilo, setTactica, setXI, autoXI,
    fuerzaDT, plantelDT, guardar, cargar, yo, clubDe, ligaDe, probOpcion, valueOf,
  };
  if (isNode) module.exports = Exported;
  else global.PotreroCareer = Exported;
})(typeof window !== "undefined" ? window : globalThis);
