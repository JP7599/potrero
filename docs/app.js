"use strict";
/* POTRERO — interfaz.
 *
 * Todo el estado vive en career.js: acá solo se pinta y se escuchan clics.
 * La regla es que esta capa no decide nada del juego; si hace falta un dato
 * para dibujar, se agrega al estado, no se recalcula acá. */
(function () {
  const D = window.PotreroData, E = window.PotreroEngine, C = window.PotreroCareer, ESC = window.PotreroEscudos;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dinero = C.dinero;
  const liga = (id) => D.LEAGUES.find((l) => l.id === id);
  const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  /* Escudo de un club, listo para meter en cualquier plantilla. */
  const escudo = (club, clase) => (club ? ESC.svg(club, clase) : "");

  /* localStorage explota en file:// y en modo incógnito: sin este colchón la
   * partida muere antes de pintar la primera pantalla. */
  const KEY = "potrero.v1";
  const store = (() => {
    let ok = true;
    try { localStorage.setItem("potrero.probe", "1"); localStorage.removeItem("potrero.probe"); } catch { ok = false; }
    let mem = null;
    return {
      persistente: ok,
      get: () => { try { return ok ? localStorage.getItem(KEY) : mem; } catch { return mem; } },
      set: (v) => { try { ok ? localStorage.setItem(KEY, v) : (mem = v); } catch { ok = false; mem = v; } },
      del: () => { try { ok ? localStorage.removeItem(KEY) : (mem = null); } catch { mem = null; } },
    };
  })();

  let s = null;
  /* La pestaña abierta se recuerda entre recargas: si estabas mirando la tabla
   * de posiciones, vuelves a la tabla, no a tus atributos. */
  const TAB_KEY = "potrero.tab";
  let tab = (() => { try { return localStorage.getItem(TAB_KEY) || "yo"; } catch { return "yo"; } })();
  let nuevoPerfil = "crack", nuevoPos = "DC";
  let ligaVista = "pe";

  /* ================================================================ arranque */
  function initInicio() {
    const ps = $("pos-sel");
    ps.innerHTML = "";
    for (const p of D.POS_LIST) {
      const b = el("button", p === nuevoPos ? "on" : "", p);
      b.title = D.POSITIONS[p].name;
      b.onclick = () => { nuevoPos = p; initInicio(); };
      ps.appendChild(b);
    }
    const pf = $("perfiles");
    pf.innerHTML = "";
    for (const k in C.PERFILES) {
      const v = C.PERFILES[k];
      const b = el("button", "perfil" + (k === nuevoPerfil ? " on" : ""), `<b>${esc(v.name)}</b>${esc(v.desc)}`);
      b.onclick = () => { nuevoPerfil = k; initInicio(); };
      pf.appendChild(b);
    }
    $("empezar").onclick = () => {
      const semilla = $("seed").value.trim();
      s = C.nuevaPartida({
        nombre: $("nom").value.trim() || "Chibolo del Potrero",
        pos: nuevoPos, perfil: nuevoPerfil,
        seed: semilla ? (parseInt(semilla, 10) || hash(semilla)) : undefined,
      });
      tab = "yo";
      guardar();
      render();
    };
  }
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function guardar() { try { store.set(C.guardar(s)); } catch { /* estado gigante: seguimos solo en memoria */ } }

  function accionesTop() {
    const box = $("acciones-top");
    box.innerHTML = "";
    if (s) {
      const b1 = el("button", "chico", "Exportar");
      b1.onclick = () => {
        const blob = new Blob([C.guardar(s)], { type: "application/json" });
        const a = el("a"); a.href = URL.createObjectURL(blob);
        a.download = `potrero-${s.seed}-T${s.temporada}.json`; a.click();
      };
      box.appendChild(b1);
    }
    const b2 = el("button", "chico", "Importar");
    b2.onclick = () => {
      const inp = el("input"); inp.type = "file"; inp.accept = ".json";
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const o = C.cargar(rd.result);
          if (o) { s = o; guardar(); render(); } else alert("Ese archivo no es una carrera de POTRERO.");
        };
        rd.readAsText(f);
      };
      inp.click();
    };
    box.appendChild(b2);
    const b3 = el("button", "chico", "Nueva carrera");
    b3.onclick = () => {
      if (s && !confirm("¿Arrancas otra carrera? La de ahora se borra.")) return;
      store.del(); s = null; render();
    };
    box.appendChild(b3);
  }

  /* ================================================================== render */
  function render() {
    accionesTop();
    if (!s) { $("inicio").hidden = false; $("juego").hidden = true; initInicio(); return; }
    $("inicio").hidden = true; $("juego").hidden = false;
    renderHud();
    renderFicha();
    renderStats();
    renderDecision();
    renderFeed();
    renderTabs();
  }

  const NOMBRE_SEMANA = {
    pretemporada: "Pretemporada", liga: "Fecha de liga", copa: "Copa nacional",
    cont: "Copa internacional", libre: "Semana libre", premios: "Premios",
    mercado: "Mercado de pases", seleccion: "Selección", vacaciones: "Vacaciones",
  };

  function renderHud() {
    const t = C.tipoSemana(s);
    const dirige = s.fase === "dt" && s.dt;
    const club = s.clubs[dirige ? s.dt.clubId : C.yo(s).clubId];
    $("hud").innerHTML = `
      <span class="via">Temporada <b>${s.temporada}</b></span>
      <span class="via">Año <b>${s.anio}</b></span>
      <span class="via">Semana <b>${s.semana}</b>/${C.SEMANAS}</span>
      <span class="via" style="color:var(--cian)">${esc(NOMBRE_SEMANA[t] || "")}</span>
      <span class="via">${esc(liga(club.leagueId).short)}</span>
      <span class="plata">${dinero(C.patrimonio(s))}</span>
      <span class="barra-sem"><i style="width:${(s.semana / C.SEMANAS) * 100}%"></i></span>`;
  }

  function renderFicha() {
    const p = C.yo(s);
    const dirige = s.fase === "dt" && s.dt;
    const club = s.clubs[dirige ? s.dt.clubId : p.clubId];
    $("ficha").innerHTML = `
      <div class="cab">
        ${escudo(club)}
        <div style="min-width:0">
          <div class="nom">${esc(p.name)}</div>
          <div class="apodo">«${esc(p.apodo || "el del barrio")}» · ${p.age} años</div>
          <div class="club">${dirige ? "DT" : esc(p.pos)} · ${esc(club.name)}</div>
          <div class="club" style="color:var(--tenue)">${esc(liga(club.leagueId).name)}</div>
        </div>
        <div class="med">
          <b>${dirige ? Math.round(s.me.repDT || 0) : E.media(p)}</b>
          <span>${dirige ? "PRESTIGIO" : "MEDIA"}</span>
        </div>
      </div>
      <div class="tira"><i style="background:${club.colors[0]}"></i><i style="background:${club.colors[1]}"></i></div>`;
  }

  function barra(lab, val, max, neutra) {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    const cls = neutra ? "" : pct < 33 ? " mal" : pct < 60 ? " medio" : "";
    return `<div class="barra${cls}"><span class="lab">${esc(lab)}<i>${Math.round(val)}</i></span>
      <div class="riel"><div class="rel" style="width:${pct}%"></div></div></div>`;
  }

  function renderStats() {
    const p = C.yo(s), me = s.me;
    const box = $("stats");
    if (s.fase === "dt" && s.dt) {
      const plantel = C.plantelDT(s);
      box.innerHTML = `<h2 class="titulito">El banco</h2>
        <div class="barras">
          ${barra("Paciencia", s.dt.paciencia, 100)}
          ${barra("Prestigio DT", me.repDT || 0, 100)}
          ${barra("Ánimo plantel", prom(plantel.map((x) => x.mor)), 100)}
          ${barra("Físico plantel", prom(plantel.map((x) => x.fit)), 100)}
        </div>
        <p class="mini" style="margin:10px 0 0">Objetivo: ${esc(s.dt.objetivo.txt)}<br>
        Esta temporada: ${s.dt.record.g}G ${s.dt.record.e}E ${s.dt.record.p}P</p>`;
      return;
    }
    box.innerHTML = `<h2 class="titulito">Estado</h2>
      <div class="barras">
        ${barra("Físico", p.fit, 100)}
        ${barra("Ánimo", p.mor, 100)}
        ${barra("Confianza DT", me.confianza, 100)}
        ${barra("Forma", (p.form + 3) * 16.6, 100)}
        ${barra("Fama", me.fama, 100)}
        ${barra("Reputación", me.rep, 100)}
      </div>
      <p class="mini" style="margin:10px 0 0">
        Temporada: ${p.st.pj} PJ · ${p.st.g} goles · ${p.st.a} asist. · nota ${p.st.pj ? (p.st.rat / p.st.pj).toFixed(2) : "—"}
        ${p.inj ? `<br><b style="color:var(--rojo)">LESIONADO: ${esc(p.inj.name)} (${p.inj.weeks} sem)</b>` : ""}
        ${me.puntos ? `<br><b style="color:var(--amar)">${me.puntos} punto${me.puntos > 1 ? "s" : ""} de talento sin usar</b>` : ""}
      </p>`;
  }

  /* --------------------------------------------------------------- pantalla */
  const CINTA = {
    inicio: "Primer contrato", accion: "Tu semana", resumen: "Resultado",
    momento: "Momento del partido", decision: "Fuera de la cancha", sponsor: "Te buscan",
    mercado: "Mercado de pases", premios: "Premios", retiro: "Final del camino",
    licencia: "Después de jugar", cantera: "Reserva", fin: "Carrera terminada",
    dt_oferta: "Te ofrecen un banco", dt_semana: "Semana de entrenamiento",
    dt_entretiempo: "Entretiempo", dt_prensa: "Rueda de prensa", dt_mercado: "Fichajes",
    dt_despido: "Despido", dt_fin: "Se acabó",
  };

  function renderDecision() {
    const pd = s.pendiente;
    const caja = $("decision");
    caja.innerHTML = `<div class="cinta">${esc(CINTA[pd ? pd.tipo : "accion"] || "Tu semana")}</div>`;
    const box = el("div", "cuerpo");
    caja.appendChild(box);
    if (!pd) { box.innerHTML = "<p class='texto'>…</p>"; return; }

    if (pd.tipo === "fin") return renderFin(box, pd);

    if (pd.partido && pd.partido.marcador) renderMarcador(box, pd);
    else {
      box.appendChild(el("h2", "titulo", esc(pd.titulo || "")));
      if (pd.texto) box.appendChild(el("p", "texto", esc(pd.texto)));
    }

    if (pd.tipo === "premios" && pd.datos) renderPremios(box, pd.datos);

    const ops = el("div", "opciones");
    (pd.opts || []).forEach((o, i) => {
      const b = el("button", "opcion", `<span>${esc(o.txt)}</span>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ""}`);
      b.onclick = () => paso(i);
      ops.appendChild(b);
    });
    box.appendChild(ops);

    /* Repetir la acción de la semana pasada: la carrera dura 42 semanas por
     * temporada y hay tramos en los que uno solo quiere entrenar y seguir. */
    if (pd.tipo === "accion" && s.me.accionSemana) {
      const idx = (pd.opts || []).findIndex((o) => o.accion === s.me.accionSemana);
      if (idx >= 0) {
        const auto = el("button", "chico", `↻ Repetir: ${esc(pd.opts[idx].txt)}`);
        auto.style.marginTop = "10px";
        auto.onclick = () => paso(idx);
        box.appendChild(auto);
      }
    }
  }

  function renderMarcador(box, pd) {
    const P = pd.partido, M = P.marcador;
    const mio = s.clubs[M.clubId];
    const otro = M.rivalId != null ? s.clubs[M.rivalId] : null;
    const gano = M.mios > M.rival, perdio = M.mios < M.rival;
    const local = M.local;
    const izq = local ? mio : otro, der = local ? otro : mio;
    const gIzq = local ? M.mios : M.rival, gDer = local ? M.rival : M.mios;
    const clase = (esMio) => (esMio ? (gano ? " gano" : perdio ? " perdio" : "") : (gano ? " perdio" : perdio ? " gano" : ""));
    const lado = (club, txt) => `${club ? escudo(club, "med") : ""}<span>${esc(club ? club.name : txt)}</span>`;
    box.appendChild(el("div", "marcador", `
      <div class="eq">${lado(izq, M.rivalTxt || "Rival")}</div>
      <div class="goles${clase(local)}">${gIzq}</div>
      <div class="goles${clase(!local)}">${gDer}</div>
      <div class="eq der">${lado(der, M.rivalTxt || "Rival")}</div>`));
    box.appendChild(el("p", "mini", `${esc(M.comp || "")} · ${local ? "de local" : "de visita"}`));

    if (P.minutos) {
      const chips = [];
      const ev = P.ev || {};
      for (let i = 0; i < (ev.gol || 0); i++) chips.push('<span class="chip gol">GOL</span>');
      for (let i = 0; i < (ev.asi || 0); i++) chips.push('<span class="chip asi">ASISTENCIA</span>');
      for (let i = 0; i < (ev.atajada || 0); i++) chips.push('<span class="chip">ATAJADA</span>');
      for (let i = 0; i < (ev.amarilla || 0); i++) chips.push('<span class="chip am">AMARILLA</span>');
      for (let i = 0; i < (ev.roja || 0); i++) chips.push('<span class="chip roja">ROJA</span>');
      const n = P.rating;
      box.appendChild(el("div", "nota-caja", `
        <span class="nota${n >= 7.5 ? " buena" : n < 5.5 ? " mala" : ""}">${n.toFixed(1)}</span>
        <span class="mini">${P.minutos} minutos en cancha</span>${chips.join("")}`));
    } else if (pd.texto) {
      box.appendChild(el("p", "texto", esc(pd.texto)));
    }
    for (const nar of P.narracion || []) {
      if (!nar.txt) continue;
      box.appendChild(el("div", "narra" + (nar.ok ? "" : " mal"), `<b>${nar.min}'</b><span>${esc(nar.txt)}</span>`));
    }
  }

  function renderPremios(box, d) {
    let h = `<div class="kv"><span>Balón de Oro</span><b>${esc(d.balon)}</b></div>
             <div class="kv"><span>Goleador del mundo</span><b>${esc(d.goleador)}</b></div>
             <div class="kv"><span>Tu puesto en la votación</span><b>#${d.tuPuesto}</b></div>
             <div class="kv"><span>Tu temporada</span><b>${d.tus.pj} PJ · ${d.tus.g} G · ${d.tus.a} A</b></div>`;
    box.appendChild(el("div", null, h));
    if (d.lineas && d.lineas.length) {
      const ul = el("div", null, "<div class='sep'></div>");
      for (const l of d.lineas) ul.appendChild(el("p", "mini", esc(l)));
      box.appendChild(ul);
    }
  }

  function renderFin(box, pd) {
    const d = pd.datos;
    box.classList.add("fin");
    box.innerHTML = `<div class="grande">${esc(pd.titulo)}</div>
      <p class="texto">${esc(pd.texto)}</p>
      <div class="grid2">
        <div class="kv"><span>Partidos</span><b>${d.pj}</b></div>
        <div class="kv"><span>Goles</span><b>${d.g}</b></div>
        <div class="kv"><span>Asistencias</span><b>${d.a}</b></div>
        <div class="kv"><span>Figura del partido</span><b>${d.mvp}</b></div>
        <div class="kv"><span>Nota promedio</span><b>${d.rating}</b></div>
        <div class="kv"><span>Balones de Oro</span><b>${d.balones}</b></div>
        <div class="kv"><span>Ligas</span><b>${d.titulos.liga}</b></div>
        <div class="kv"><span>Copas nacionales</span><b>${d.titulos.copa}</b></div>
        <div class="kv"><span>Copas internacionales</span><b>${d.titulos.cont}</b></div>
        <div class="kv"><span>Títulos con la selección</span><b>${d.titulos.sel}</b></div>
        <div class="kv"><span>Selección</span><b>${d.caps} PJ (${d.golesSel} G)</b></div>
        <div class="kv"><span>Patrimonio final</span><b>${dinero(d.patrimonio)}</b></div>
      </div>
      ${d.dt ? `<div class="sep"></div><div class="grid2">
        <div class="kv"><span>Temporadas como DT</span><b>${d.dt.temporadas}</b></div>
        <div class="kv"><span>Títulos como DT</span><b>${d.dt.titulos}</b></div>
        <div class="kv"><span>Prestigio final</span><b>${d.dt.rep}</b></div></div>` : ""}
      <div class="sep"></div>
      <p class="mini">Clubes: ${d.clubes.map(esc).join(" · ")}</p>`;
    const b = el("button", "pri", "Otra carrera");
    b.style.marginTop = "12px";
    b.onclick = () => { store.del(); s = null; render(); };
    box.appendChild(b);
  }

  function paso(i) {
    C.resolver(s, i);
    guardar();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------- feed */
  function renderFeed() {
    const box = $("feed");
    box.innerHTML = '<h2 class="titulito">Lo que pasó</h2>';
    for (const f of s.feed.slice(0, 40)) {
      box.appendChild(el("div", "it", `<span class="t">${esc(f.t)}</span><span class="${f.tipo}">${esc(f.txt)}</span>`));
    }
  }

  /* ---------------------------------------------------------------- paneles */
  function renderTabs() {
    const dirige = s.fase === "dt" && s.dt;
    const lista = dirige
      ? [["tactica", "Pizarrón"], ["plantel", "Plantel"], ["tabla", "Tabla"], ["plata", "Plata"], ["carrera", "Carrera"], ["mundo", "Mundo"]]
      : [["yo", "Yo"], ["plantel", "Plantel"], ["tabla", "Tabla"], ["plata", "Plata"], ["carrera", "Carrera"], ["mundo", "Mundo"]];
    if (!lista.some(([k]) => k === tab)) tab = lista[0][0];
    const nav = $("tabs");
    nav.innerHTML = "";
    for (const [k, n] of lista) {
      const b = el("button", "tab" + (k === tab ? " on" : ""), n);
      b.onclick = () => { tab = k; try { localStorage.setItem(TAB_KEY, k); } catch { /* sin disco, igual anda */ } renderTabs(); };
      nav.appendChild(b);
    }
    const panel = $("panel");
    panel.innerHTML = "";
    panel.scrollTop = 0;
    ({ yo: panelYo, tactica: panelTactica, plantel: panelPlantel, tabla: panelTabla, plata: panelPlata, carrera: panelCarrera, mundo: panelMundo })[tab](panel);
  }

  const ATTRS = [["rit", "Ritmo"], ["tir", "Tiro"], ["pas", "Pase"], ["reg", "Regate"], ["def", "Defensa"], ["fis", "Físico"], ["men", "Mentalidad"]];

  function panelYo(box) {
    const p = C.yo(s), me = s.me;
    box.appendChild(el("h2", "titulito", `Atributos · media ${E.media(p)} · ${D.POSITIONS[p.pos].name}`));
    const g = el("div", "barras");
    for (const [k, n] of ATTRS) {
      const d = el("div");
      d.innerHTML = barra(n, p.attrs[k], 99, true);
      /* Con la carrera terminada los puntos ya no se gastan: el panel queda de
       * museo. */
      if (me.puntos > 0 && p.attrs[k] < 99 && s.fase !== "fin") {
        const b = el("button", "chico", "+1");
        b.style.marginTop = "6px";
        b.onclick = () => { C.gastarPunto(s, k); guardar(); render(); };
        d.appendChild(b);
      }
      g.appendChild(d);
    }
    box.appendChild(g);
    const est = Math.round((p.pot + ((s.seed % 9) - 4)) / 5) * 5;
    box.appendChild(el("div", "sep"));
    box.appendChild(el("div", "grid2", `
      <div class="kv"><span>Techo que le ve el ojeador</span><b>~${est}</b></div>
      <div class="kv"><span>Profesionalismo</span><b>${(me.prof * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>Idiomas</span><b>${Math.round(me.idioma)}/100</b></div>
      <div class="kv"><span>Adaptación al país</span><b>${Math.round(me.adaptacion)}/100</b></div>
      <div class="kv"><span>Nivel</span><b>${me.nivel} (${me.puntos} pts)</b></div>
      <div class="kv"><span>Ojo táctico (para ser DT)</span><b>${Math.round(me.dtxp)}</b></div>
      <div class="kv"><span>Contrato</span><b>${dinero(p.wage)}/sem · ${p.years} año${p.years === 1 ? "" : "s"}</b></div>
      <div class="kv"><span>Valor de mercado</span><b>${dinero(C.valueOf(p))}</b></div>`));
    box.appendChild(el("p", "mini", "El techo de verdad está escondido: el ojeador se equivoca. Los puntos de talento sí son tuyos para siempre."));
  }

  function panelTactica(box) {
    const dt = s.dt;
    const grupo = (campo, opciones, actual) => {
      const f = el("div", "fila");
      for (const [val, txt] of opciones) {
        const b = el("button", "chico" + (val === actual ? " on" : ""), txt);
        b.onclick = () => { C.setTactica(s, campo, val); guardar(); render(); };
        f.appendChild(b);
      }
      return f;
    };
    box.appendChild(el("h2", "titulito", "Formación"));
    box.appendChild(grupo("formacion", Object.keys(D.FORMATIONS).map((k) => [k, k]), dt.formacion));
    box.appendChild(el("h2", "titulito", "Estilo"));
    box.appendChild(grupo("estilo", Object.keys(D.STYLES).map((k) => [k, D.STYLES[k].name]), dt.estilo));
    box.appendChild(el("h2", "titulito", "Mentalidad"));
    box.appendChild(grupo("mentalidad", D.MENTALITIES.map((m) => [m.id, m.name]), dt.mentalidad));
    const st = D.STYLES[dt.estilo];
    box.appendChild(el("p", "mini", `${esc(st.desc)}${st.gana ? ` Le gana a ${D.STYLES[st.gana].name.toLowerCase()}; pierde contra ${D.STYLES[st.pierde].name.toLowerCase()}.` : ""}`));
    box.appendChild(el("div", "sep"));
    const f = C.fuerzaDT(s, dt.clubId, dt.xi);
    box.appendChild(el("div", "barras", `
      ${barra("Ataque", f.atk, 100, true)}
      ${barra("Defensa", f.def, 100, true)}
      ${barra("Total", f.total, 100, true)}`));
    const b = el("button", "chico", "Rearmar el once con los mejores");
    b.style.marginTop = "10px";
    b.onclick = () => { C.autoXI(s); guardar(); render(); };
    box.appendChild(b);
    box.appendChild(el("div", "sep"));
    box.appendChild(el("h2", "titulito", "Once inicial"));
    let h = "<table><tr><th>Pos</th><th>Jugador</th><th class='num'>Med</th><th class='num'>Ed</th><th class='num'>Fís</th></tr>";
    for (const id of dt.xi || []) {
      const p = s.players[id];
      if (!p) continue;
      h += `<tr><td>${p.pos}</td><td>${esc(p.name)}</td><td class="num">${E.media(p)}</td><td class="num">${p.age}</td><td class="num">${Math.round(p.fit)}</td></tr>`;
    }
    box.appendChild(el("div", null, h + "</table>"));
  }

  function panelPlantel(box) {
    const clubId = s.fase === "dt" && s.dt ? s.dt.clubId : C.yo(s).clubId;
    const club = s.clubs[clubId];
    box.appendChild(el("h2", "titulito", `${escudo(club, "chico")}${esc(club.name)} · plantel`));
    let h = "<table><tr><th>Pos</th><th>Jugador</th><th class='num'>Ed</th><th class='num'>Med</th><th class='num'>PJ</th><th class='num'>G</th><th class='num'>Sueldo</th></tr>";
    const ps = club.squad.map((id) => s.players[id]).filter(Boolean).sort((a, b) => E.media(b) - E.media(a));
    for (const p of ps) {
      h += `<tr class="${p.id === 0 ? "yo" : ""}"><td>${p.pos}</td>
        <td>${esc(p.name)}${p.inj ? ` <span class="mini" style="color:var(--rojo)">(${p.inj.weeks}s)</span>` : ""}</td>
        <td class="num">${p.age}</td><td class="num">${E.media(p)}</td>
        <td class="num">${p.st.pj}</td><td class="num">${p.st.g}</td><td class="num">${dinero(p.wage)}</td></tr>`;
    }
    box.appendChild(el("div", null, h + "</table>"));
  }

  /* Tabla de posiciones con las zonas de ascenso y descenso marcadas al margen:
   * la pirámide es la mitad del juego, así que tiene que verse desde acá. */
  function tablaHTML(ligaId, resaltar) {
    const L = s.comp.ligas[ligaId], info = liga(ligaId);
    const filas = E.sortTable(L.tabla);
    let h = "<table><tr><th>#</th><th>Club</th><th class='num'>PJ</th><th class='num'>G</th><th class='num'>E</th><th class='num'>P</th><th class='num'>GF:GC</th><th class='num'>Pts</th></tr>";
    filas.forEach((r, i) => {
      const zona = info.sube && i < 2 ? " sube" : info.baja && i >= filas.length - 2 ? " baja" : "";
      const club = s.clubs[r.clubId];
      h += `<tr class="${r.clubId === resaltar ? "yo" : ""}${zona}"><td>${i + 1}</td>
        <td>${escudo(club, "chico")}${esc(club.name)}</td>
        <td class="num">${r.pj}</td><td class="num">${r.g}</td><td class="num">${r.e}</td><td class="num">${r.p}</td>
        <td class="num">${r.gf}:${r.gc}</td><td class="num"><b>${r.pts}</b></td></tr>`;
    });
    h += "</table>";
    const notas = [];
    if (info.sube) notas.push(`<span style="color:var(--verde)">▌</span> suben a ${liga(info.sube).name}`);
    if (info.baja) notas.push(`<span style="color:var(--rojo)">▌</span> bajan a ${liga(info.baja).name}`);
    if (notas.length) h += `<p class="mini" style="margin-top:8px">${notas.join(" · ")}</p>`;
    return h;
  }

  function panelTabla(box) {
    const clubId = s.fase === "dt" && s.dt ? s.dt.clubId : C.yo(s).clubId;
    const club = s.clubs[clubId];
    const L = liga(club.leagueId);
    box.appendChild(el("h2", "titulito", L.name));
    box.appendChild(el("div", null, tablaHTML(L.id, clubId)));
    box.appendChild(el("div", "sep"));

    const CP = s.comp.copa[L.id];
    box.appendChild(el("h2", "titulito", L.cup));
    const ronda = CP.llaves.rondas[CP.ronda];
    if (CP.campeon != null) box.appendChild(el("p", "mini", `Campeón: ${esc(s.clubs[CP.campeon].name)}`));
    else if (ronda) box.appendChild(el("p", "mini", ronda.map(([h, a]) => `${s.clubs[h].name} vs ${s.clubs[a].name}`).join(" · ")));
    else box.appendChild(el("p", "mini", "Todavía no arranca."));

    if (!L.cont) return;
    box.appendChild(el("div", "sep"));
    const K = s.comp.cont[L.cont];
    box.appendChild(el("h2", "titulito", L.cont === "condor" ? "Copa Cóndor" : "Copa de Europa"));
    if (K.campeon != null) box.appendChild(el("p", "mini", `Campeón: ${esc(s.clubs[K.campeon].name)}`));
    else if (K.fase === "grupos") {
      K.tablas.forEach((tb, i) => {
        let h = `<p class="mini" style="margin:8px 0 2px">Grupo ${String.fromCharCode(65 + i)}</p><table>`;
        E.sortTable(tb).forEach((r) => {
          h += `<tr class="${r.clubId === clubId ? "yo" : ""}"><td>${escudo(s.clubs[r.clubId], "chico")}${esc(s.clubs[r.clubId].name)}</td>
            <td class="num">${r.pj}</td><td class="num">${r.pts}</td></tr>`;
        });
        box.appendChild(el("div", null, h + "</table>"));
      });
    } else if (K.fase === "semis" && K.semis) {
      box.appendChild(el("p", "mini", "Semis: " + K.semis.map(([h, a]) => `${s.clubs[h].name} vs ${s.clubs[a].name}`).join(" · ")));
    } else if (K.final) {
      box.appendChild(el("p", "mini", `Final: ${s.clubs[K.final[0]].name} vs ${s.clubs[K.final[1]].name}`));
    }
  }

  function panelPlata(box) {
    const p = C.yo(s), me = s.me;
    const dirige = s.fase === "dt" && s.dt;
    const L = liga(s.clubs[dirige ? s.dt.clubId : p.clubId].leagueId);
    const sponsors = me.sponsors.reduce((a, x) => a + x.pago, 0);
    const sueldo = dirige ? s.dt.sueldo : p.wage;
    const bruto = sueldo + sponsors;
    const vida = D.LIFESTYLE[me.estilo].cost * sueldo + 180;
    const agente = dirige ? 0 : p.wage * me.agente.comision;
    box.appendChild(el("h2", "titulito", "Por semana"));
    box.appendChild(el("div", null, `
      <div class="kv"><span>Sueldo del club</span><b>${dinero(sueldo)}</b></div>
      <div class="kv"><span>Sponsors</span><b>${dinero(sponsors)}</b></div>
      <div class="kv"><span>Impuestos (${Math.round(L.tax * 100)}%)</span><b style="color:var(--rojo)">-${dinero(bruto * L.tax)}</b></div>
      <div class="kv"><span>Representante (${Math.round(me.agente.comision * 100)}%)</span><b style="color:var(--rojo)">-${dinero(agente)}</b></div>
      <div class="kv"><span>Nivel de vida</span><b style="color:var(--rojo)">-${dinero(vida)}</b></div>
      <div class="kv"><span><b style="color:var(--texto)">Neto semanal</b></span><b style="color:var(--verde)">${dinero(bruto - bruto * L.tax - agente - vida)}</b></div>
      <div class="kv"><span>Efectivo</span><b>${dinero(me.plata)}</b></div>
      <div class="kv"><span>Patrimonio</span><b>${dinero(C.patrimonio(s))}</b></div>`));

    box.appendChild(el("div", "sep"));
    box.appendChild(el("h2", "titulito", "Nivel de vida"));
    const f = el("div", "fila");
    D.LIFESTYLE.forEach((l, i) => {
      const b = el("button", "chico" + (i === me.estilo ? " on" : ""), l.name);
      b.onclick = () => { C.setEstilo(s, i); guardar(); render(); };
      f.appendChild(b);
    });
    box.appendChild(f);
    box.appendChild(el("p", "mini", "Vivir bien sube el ánimo y la fama; vivir de escándalo también te la puede costar."));

    if (me.sponsors.length) {
      box.appendChild(el("div", "sep"));
      box.appendChild(el("h2", "titulito", "Sponsors"));
      for (const sp of me.sponsors) box.appendChild(el("div", "kv", `<span>${esc(sp.marca)}</span><b>${dinero(sp.pago)}/sem</b>`));
    }

    box.appendChild(el("div", "sep"));
    box.appendChild(el("h2", "titulito", "Negocios"));
    for (const d of D.INVESTMENTS) {
      const mine = me.inv.find((x) => x.id === d.id);
      const row = el("div");
      row.style.marginBottom = "12px";
      row.innerHTML = `<div class="kv"><span><b style="color:var(--texto)">${esc(d.name)}</b><br><span class="mini">${esc(d.desc)}</span></span>
        <b>${mine ? dinero(mine.value) : "—"}${mine ? `<br><span class="mini" style="color:${mine.last >= 0 ? "var(--verde)" : "var(--rojo)"}">${(mine.last * 100).toFixed(2)}% sem</span>` : ""}</b></div>`;
      const acc = el("div", "fila");
      acc.style.marginTop = "6px";
      const inp = el("input");
      inp.value = String(d.min); inp.style.width = "120px"; inp.inputMode = "numeric";
      const bi = el("button", "chico", "Invertir");
      bi.onclick = () => {
        if (!C.invertir(s, d.id, parseInt(inp.value, 10))) alert(`Mínimo ${dinero(d.min)} y tienes que tener la plata en efectivo.`);
        guardar(); render();
      };
      acc.appendChild(inp); acc.appendChild(bi);
      if (mine) {
        const bs = el("button", "chico", "Retirar todo");
        bs.onclick = () => { C.retirarInv(s, d.id); guardar(); render(); };
        acc.appendChild(bs);
      }
      row.appendChild(acc);
      box.appendChild(row);
    }
  }

  function panelCarrera(box) {
    const me = s.me, c = me.carrera;
    box.appendChild(el("h2", "titulito", "Palmarés"));
    box.appendChild(el("div", "grid2", `
      <div class="kv"><span>Partidos</span><b>${c.pj}</b></div>
      <div class="kv"><span>Goles</span><b>${c.g}</b></div>
      <div class="kv"><span>Asistencias</span><b>${c.a}</b></div>
      <div class="kv"><span>Figura</span><b>${c.mvp}</b></div>
      <div class="kv"><span>Ligas</span><b>${c.titulos.liga}</b></div>
      <div class="kv"><span>Copas</span><b>${c.titulos.copa}</b></div>
      <div class="kv"><span>Internacionales</span><b>${c.titulos.cont}</b></div>
      <div class="kv"><span>Balones de Oro</span><b>${c.balones}</b></div>
      <div class="kv"><span>Selección</span><b>${me.caps} PJ · ${me.golesSel} G</b></div>
      <div class="kv"><span>Nota promedio</span><b>${c.pj ? (c.ratSum / c.pj).toFixed(2) : "—"}</b></div>`));
    box.appendChild(el("div", "sep"));
    box.appendChild(el("h2", "titulito", "Temporada a temporada"));
    let h = "<table><tr><th>Año</th><th>Club</th><th class='num'>Ed</th><th class='num'>Med</th><th class='num'>PJ</th><th class='num'>G</th><th class='num'>A</th><th class='num'>Nota</th><th class='num'>Pos</th></tr>";
    for (const x of s.me.hist.slice().reverse()) {
      h += x.dt
        ? `<tr><td>${x.anio}</td><td>DT ${esc(x.club)}</td><td class="num">—</td><td class="num">—</td><td class="num">${x.pj}</td><td class="num" colspan="2">${x.g}G ${x.e}E ${x.p}P</td><td class="num">—</td><td class="num">rep ${x.rep}</td></tr>`
        : `<tr><td>${x.anio}</td><td>${esc(x.club)}</td><td class="num">${x.edad}</td><td class="num">${x.media}</td><td class="num">${x.pj}</td><td class="num">${x.g}</td><td class="num">${x.a}</td><td class="num">${x.rat}</td><td class="num">${x.pos}º</td></tr>`;
    }
    box.appendChild(el("div", null, h + "</table>"));
  }

  function panelMundo(box) {
    box.appendChild(el("h2", "titulito", "La pirámide"));
    const f = el("div", "fila");
    for (const l of D.LEAGUES) {
      const b = el("button", "chico" + (l.id === ligaVista ? " on" : ""), l.short);
      b.onclick = () => { ligaVista = l.id; renderTabs(); };
      f.appendChild(b);
    }
    box.appendChild(f);
    box.appendChild(el("div", null, "<div style='height:10px'></div>" + tablaHTML(ligaVista, s.fase === "dt" && s.dt ? s.dt.clubId : C.yo(s).clubId)));
    box.appendChild(el("div", "sep"));
    box.appendChild(el("h2", "titulito", "Goleadores del mundo"));
    const tops = s.players.filter(Boolean).sort((a, b) => b.st.g - a.st.g).slice(0, 12);
    let h = "<table><tr><th>Jugador</th><th>Club</th><th class='num'>G</th><th class='num'>A</th></tr>";
    for (const p of tops) {
      h += `<tr class="${p.id === 0 ? "yo" : ""}"><td>${esc(p.name)}</td>
        <td>${escudo(s.clubs[p.clubId], "chico")}${esc(s.clubs[p.clubId].name)}</td>
        <td class="num">${p.st.g}</td><td class="num">${p.st.a}</td></tr>`;
    }
    box.appendChild(el("div", null, h + "</table>"));
  }

  /* ================================================================ arranque */
  $("logo").innerHTML = ESC.logo(["#f7e04b", "#f7e04b", "#2fe07a", "#f7e04b", "#f7e04b", "#4fd8f0", "#f7e04b"]);
  const guardado = C.cargar(store.get());
  if (guardado) s = guardado;
  render();
  if (!store.persistente) {
    const av = el("p", "mini", "Ojo: este navegador no deja guardar en disco desde file://. La carrera vive en memoria hasta que recargues; usa Exportar si quieres conservarla.");
    av.style.color = "var(--amar)";
    document.querySelector(".marco").appendChild(av);
  }
})();
