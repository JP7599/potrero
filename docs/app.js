"use strict";
/* POTRERO — interfaz.
 *
 * Todo el estado del juego vive en career.js: acá solo se pinta y se escuchan
 * toques. Una pantalla a la vez, la decisión siempre arriba del todo, y la
 * navegación abajo donde llega el pulgar.
 *
 * El ritmo de carrera también vive acá y no en el motor: "saltar" es resolver
 * automáticamente las pantallas que no te interesan, no simular distinto. Así
 * una carrera en Exprés y la misma en Intenso dan exactamente lo mismo. */
(function () {
  const D = window.PotreroData, E = window.PotreroEngine, C = window.PotreroCareer,
        K = window.PotreroCamisetas, M = window.PotreroMomentos;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dinero = C.dinero;
  const liga = (id) => D.LEAGUES.find((l) => l.id === id);
  const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const camiseta = (club, clase) => (club ? K.svg(club, "camiseta " + (clase || "")) : "");

  /* Bandera por código de país. Inglaterra y Escocia no son países ISO, así
   * que llevan su secuencia propia. */
  const BANDERA = {
    eng: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    sco: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  };
  const bandera = (cod) => BANDERA[cod] ||
    cod.slice(0, 2).toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

  /* localStorage explota en file:// y en modo incógnito: sin este colchón la
   * partida muere antes de pintar la primera pantalla. */
  const KEY = "potrero.v2";
  const store = (() => {
    let ok = true;
    try { localStorage.setItem("potrero.probe", "1"); localStorage.removeItem("potrero.probe"); } catch { ok = false; }
    let mem = {};
    return {
      persistente: ok,
      get: (k) => { try { return ok ? localStorage.getItem(k) : mem[k]; } catch { return mem[k]; } },
      set: (k, v) => { try { ok ? localStorage.setItem(k, v) : (mem[k] = v); } catch { ok = false; mem[k] = v; } },
      del: (k) => { try { ok ? localStorage.removeItem(k) : delete mem[k]; } catch { delete mem[k]; } },
    };
  })();

  /* ---------------------------------------------------------------- ritmo */
  const RITMOS = [
    ["intenso", "Intenso", "Decides cada semana. El modo largo, con todo el detalle."],
    ["normal", "Normal", "Se saltan los entrenamientos repetidos y los partidos que no jugaste."],
    ["expres", "Exprés", "Solo paras en momentos de partido, fichajes y decisiones grandes."],
  ];
  const ritmoActual = () => store.get("potrero.ritmo") || "normal";

  /* ¿Esta pantalla merece que el jugador se detenga? */
  function paraAca(pd, ritmo) {
    if (!pd) return true;
    if (ritmo === "intenso") return true;
    if (pd.tipo === "accion") return false;               // repite la última acción
    if (pd.tipo === "resumen") {
      if (ritmo === "expres") return false;
      return !!(pd.partido && pd.partido.minutos);        // solo los que jugaste
    }
    return true;
  }
  /* Qué elige el piloto automático en una pantalla que se salta. */
  function eleccionAuto(pd) {
    if (pd.tipo === "accion" && s.me.accionSemana) {
      const i = (pd.opts || []).findIndex((o) => o.accion === s.me.accionSemana);
      if (i >= 0) return i;
    }
    return 0;
  }

  let s = null;
  let tab = "jugar";
  let saltadas = 0;
  /* Los momentos de partido los escribe Claude: mientras llega la respuesta la
   * pantalla espera, y si la llamada falla se dice por qué en vez de dejar la
   * partida colgada a mitad del partido. */
  const KEY_IA = "potrero.key";
  const laKey = () => store.get(KEY_IA) || "";
  let generando = false, errorIA = "";
  /* Las jugadas de un partido se piden todas juntas mientras miras la previa,
   * que es lo que hace que después no esperes nada. */
  /* Cola de partidos ya pedidos. Generar tarda más de lo que tardas en jugar una
   * semana, así que se van pidiendo varios por delante: cuando llega el partido
   * la jugada ya está escrita y no esperas nada. */
  const cola = [];
  /* Una sola petición en vuelo: medido, tres en paralelo se estorban entre sí y
   * la espera sube de 12s a 17s. */
  const EN_VUELO = 1;
  const nuevo = { pais: "pe", pos: "DC", perfil: "crack", ritmo: "normal" };

  /* =============================================================== arranque */
  function guardar() { try { store.set(KEY, C.guardar(s)); } catch { /* si no entra, seguimos en memoria */ } }

  function paso(i) {
    C.resolver(s, i);
    avanzar();
    guardar();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Resuelve solo lo que el ritmo elegido considera trámite. */
  function avanzar() {
    const ritmo = ritmoActual();
    saltadas = 0;
    for (let n = 0; n < 600; n++) {
      if (!s || !s.pendiente) break;
      /* Aunque la pantalla se salte por el ritmo, si trae contexto de partido
       * hay que arrancar la petición igual: es el único aviso anticipado que
       * da el motor de que en un rato va a haber una jugada. */
      quizasPrecargar(s.pendiente);
      if (paraAca(s.pendiente, ritmo)) break;
      C.resolver(s, eleccionAuto(s.pendiente));
      saltadas++;
    }
  }

  function encolar(ctx) {
    if (!ctx || !laKey() || cola.some((c) => c.rival === ctx.rival)) return;
    const entrada = { rival: ctx.rival, promesa: M.pedir(ctx, laKey()) };
    entrada.promesa.catch(() => {});   // el error se maneja al consumirla
    cola.push(entrada);
  }
  let ultimoCtx = null;
  function quizasPrecargar(pd) { if (pd && pd.ctxIA) { ultimoCtx = pd.ctxIA; encolar(pd.ctxIA); } }

  /* El calendario ya está sorteado desde el arranque de temporada, así que se
   * piden varios partidos por delante y la cola siempre va ganando. */
  function precargarProximos() {
    if (!s || !laKey() || cola.length >= EN_VUELO) return;
    for (const ctx of C.proximosPartidos(s, EN_VUELO)) {
      if (cola.length >= EN_VUELO) break;
      encolar(ctx);
    }
  }
  /* Saca de la cola la precarga de este rival; si no está, pide una ahora. */
  function tomarDeLaCola(ctx) {
    const i = cola.findIndex((c) => c.rival === (ctx && ctx.rival));
    if (i >= 0) return cola.splice(i, 1)[0].promesa;
    return M.pedir(ctx || {}, laKey());
  }

  /* ================================================================= pintar */
  function render() {
    if (!s) { $("top").hidden = true; $("nav").hidden = true; return pantallaInicio(); }
    $("top").hidden = false; $("nav").hidden = false;
    pintarTop();
    pintarNav();
    const vistas = { jugar: vistaJugar, equipo: vistaEquipo, tabla: vistaTabla, carrera: vistaCarrera, mas: vistaMas };
    $("pantalla").innerHTML = (vistas[tab] || vistaJugar)();
    conectar();
    pedirMomentoSiHaceFalta();
    precargarProximos();
  }

  /* Los botones se cablean después de pintar: el HTML se arma como texto y
   * acá se le engancha el comportamiento por data-* */
  function conectar() {
    document.querySelectorAll("[data-op]").forEach((b) => { b.onclick = () => paso(+b.dataset.op); });
    document.querySelectorAll("[data-accion]").forEach((b) => { b.onclick = () => ACCIONES[b.dataset.accion](b); });
  }

  function pintarTop() {
    const p = C.yo(s), dirige = s.fase === "dt" && s.dt;
    const club = s.clubs[dirige ? s.dt.clubId : p.clubId];
    const L = liga(club.leagueId);
    const t = C.tipoSemana(s);
    const NOMBRE = { pretemporada: "Pretemporada", liga: "Fecha de liga", copa: "Copa", cont: "Copa internacional",
      libre: "Semana libre", premios: "Premios", mercado: "Mercado de pases", seleccion: "Selección", vacaciones: "Vacaciones" };
    $("top").innerHTML = `
      <div class="fila">
        ${camiseta(club)}
        <div class="quien">
          <div class="club">${esc(club.name)}</div>
          <div class="liga">${dirige ? "DT · " : ""}${esc(L ? L.name : "")}</div>
        </div>
        <div class="plata">${dinero(C.patrimonio(s))}</div>
      </div>
      <div class="barra-temp"><i style="width:${(s.semana / C.SEMANAS) * 100}%"></i></div>
      <div class="semana">
        <span>Temporada ${s.temporada} · ${s.anio}</span>
        <span>${esc(NOMBRE[t] || "")} · sem ${s.semana}/${C.SEMANAS}</span>
      </div>`;
  }

  const TABS = [
    ["jugar", "Jugar", "▶"], ["equipo", "Equipo", "👥"], ["tabla", "Tabla", "☰"],
    ["carrera", "Carrera", "★"], ["mas", "Más", "⚙"],
  ];
  function pintarNav() {
    $("nav").querySelector(".interior").innerHTML = TABS.map(([k, n, i]) =>
      `<button data-accion="tab" data-tab="${k}" class="${k === tab ? "on" : ""}">
        <span class="ico">${i}</span><span>${n}</span></button>`).join("");
  }

  /* En la previa se dispara la petición y se guarda la promesa; en el momento
   * se espera esa misma promesa en vez de empezar de cero. */
  function pedirMomentoSiHaceFalta() {
    const pd = s && s.pendiente;
    if (!pd || generando || errorIA) return;
    if (pd.ctxIA) { quizasPrecargar(pd); return; }
    if (!pd.esperandoIA) return;
    if (!laKey()) { errorIA = "sin-key"; return render(); }
    generando = true;
    const promesa = tomarDeLaCola(pd.ctxIA || ultimoCtx);
    promesa
      .then((gen) => { generando = false; C.aplicarMomento(s, gen); guardar(); render(); })
      .catch((e) => { generando = false; errorIA = String(e.message || e); render(); });
  }

  function vistaEsperandoIA() {
    if (errorIA === "sin-key") {
      return `<div class="card">
        <h1>Falta tu API key</h1>
        <p class="texto">Los momentos de partido los escribe Claude con lo que está pasando en este partido. Para eso necesitas una API key de Anthropic — se guarda solo en este navegador.</p>
        </div>
        <button class="btn primario" data-accion="tab" data-tab="mas">Ponerla en Más</button>`;
    }
    if (errorIA) {
      return `<div class="card">
        <h1>No llegó la jugada</h1>
        <p class="texto">${esc(errorIA)}</p>
        </div>
        <button class="btn primario" data-accion="reintentar-ia">Reintentar</button>
        <button class="btn" data-accion="saltar-ia">Seguir sin este momento<span class="sub">Se resuelve con una jugada del banco de siempre.</span></button>`;
    }
    return `<div class="card">
      <h1>${esc(s.pendiente.titulo || "El partido")}</h1>
      <p class="texto tenue">Escribiendo la jugada…</p>
    </div>`;
  }

  /* ---------------------------------------------------------------- inicio */
  function pantallaInicio() {
    const paises = D.PAISES.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    $("pantalla").innerHTML = `
      <div class="marca">POTRE<span>RO</span></div>
      <p class="lead">Eliges tu país, empiezas a los 16 en la última categoría y llegas hasta donde te dé el fútbol. Después, si quieres, diriges.</p>

      <div class="card">
        <label for="nom">Tu nombre</label>
        <input id="nom" maxlength="24" placeholder="Ponte un nombre">

        <label>¿De dónde eres?</label>
        <div class="paises" id="paises">
          ${paises.map((p) => `<button class="pais ${p.cod === nuevo.pais ? "on" : ""}" data-accion="pais" data-pais="${p.cod}">
            <span class="bandera">${bandera(p.cod)}</span><span>${esc(p.nombre)}</span></button>`).join("")}
        </div>

        <label>Puesto</label>
        <div class="pills">${D.POS_LIST.map((k) =>
          `<button class="pill ${k === nuevo.pos ? "on" : ""}" data-accion="pos" data-pos="${k}" title="${esc(D.POSITIONS[k].name)}">${k}</button>`).join("")}</div>

        <label>Qué tipo de jugador eres</label>
        <div>${Object.keys(C.PERFILES).map((k) =>
          `<button class="btn ${k === nuevo.perfil ? "" : "plano"}" data-accion="perfil" data-perfil="${k}"
             style="${k === nuevo.perfil ? "border-color:var(--verde);background:var(--verde-suave)" : ""}">
            ${esc(C.PERFILES[k].name)}<span class="sub">${esc(C.PERFILES[k].desc)}</span></button>`).join("")}</div>

        <label>Ritmo de la carrera</label>
        <div>${RITMOS.map(([k, n, d]) =>
          `<button class="btn" data-accion="ritmo-nuevo" data-ritmo="${k}"
             style="${k === nuevo.ritmo ? "border-color:var(--verde);background:var(--verde-suave)" : ""}">
            ${n}<span class="sub">${d}</span></button>`).join("")}</div>
        <p class="tenue" style="font-size:13px;margin:10px 0 0">Lo puedes cambiar cuando quieras. La carrera es la misma; solo cambia en qué te detienes.</p>
      </div>

      <button class="btn primario" data-accion="empezar">Empezar</button>
      <p class="tenue" style="font-size:12.5px;text-align:center">Se guarda solo en este navegador. Sin cuenta, sin servidor.</p>`;
    conectar();
  }

  /* ----------------------------------------------------------------- jugar */
  function vistaJugar() {
    const pd = s.pendiente;
    if (!pd) return `<div class="card">…</div>`;
    if (pd.tipo === "fin") return vistaFin(pd);
    if (pd.esperandoIA) return vistaEsperandoIA();
    if (pd.tipo === "previa") return vistaPrevia(pd);

    let h = "";
    if (saltadas > 3) h += `<p class="tenue" style="font-size:13px;margin:12px 0 0">↓ Se resolvieron ${saltadas} pantallas de trámite.</p>`;
    h += `<div class="card">`;
    if (pd.partido && pd.partido.marcador) h += marcadorHTML(pd);
    else {
      h += `<h1>${esc(pd.titulo)}</h1>`;
      if (pd.texto) h += `<p class="texto">${esc(pd.texto)}</p>`;
    }
    if (pd.tipo === "premios" && pd.datos) h += premiosHTML(pd.datos);
    h += `</div>`;

    h += (pd.opts || []).map((o, i) => {
      const prob = o.sub && /^\d+%/.test(o.sub) ? `<span class="prob">${esc(o.sub.split(" ")[0])}</span>` : "";
      const sub = o.sub && !prob ? `<span class="sub">${esc(o.sub)}</span>` : (o.sub ? `<span class="sub">${esc(o.sub.replace(/^\d+% /, ""))}</span>` : "");
      return `<button class="btn opcion" data-op="${i}">${prob}${esc(o.txt)}${sub}</button>`;
    }).join("");

    const ult = s.feed.slice(0, 6);
    if (ult.length) {
      h += `<div class="card feed"><h2>Lo que viene pasando</h2>` +
        ult.map((f) => `<div class="it"><span class="t">${esc(f.t)}</span><span class="${f.tipo}">${esc(f.txt)}</span></div>`).join("") +
        `</div>`;
    }
    return h;
  }

  /* Previa: quién, dónde y qué se juega. Ocupa los segundos que Claude tarda
   * en escribir las jugadas del partido. */
  function vistaPrevia(pd) {
    const M2 = pd.marcador, mio = s.clubs[M2.clubId], otro = M2.rivalId != null ? s.clubs[M2.rivalId] : null;
    const izq = M2.local ? mio : otro, der = M2.local ? otro : mio;
    const lado = (c) => `<div class="lado">${c ? camiseta(c, "grande") : ""}
      <div class="nom">${esc(c ? c.name : "Rival")}</div></div>`;
    return `<div class="card">
        <div class="marcador">${lado(izq)}<div class="vs">vs</div>${lado(der)}</div>
        <h1 style="text-align:center;font-size:19px">${esc(pd.titulo)}</h1>
        <p class="tenue" style="text-align:center;font-size:13.5px;margin:0">${esc(pd.texto)} ${M2.local ? "En tu cancha." : "De visita."}</p>
      </div>
      <button class="btn primario" data-op="0">Salir a la cancha</button>`;
  }

  function marcadorHTML(pd) {
    const P = pd.partido, M = P.marcador;
    const mio = s.clubs[M.clubId], otro = M.rivalId != null ? s.clubs[M.rivalId] : null;
    const gano = M.mios > M.rival, perdio = M.mios < M.rival;
    const izq = M.local ? mio : otro, der = M.local ? otro : mio;
    const gIzq = M.local ? M.mios : M.rival, gDer = M.local ? M.rival : M.mios;
    const cls = (esMio) => (esMio ? (gano ? "gano" : perdio ? "perdio" : "") : (gano ? "perdio" : perdio ? "gano" : ""));
    const lado = (club, goles, esMio) => `<div class="lado">
        ${club ? camiseta(club, "grande") : ""}
        <div class="nom">${esc(club ? club.name : (M.rivalTxt || "Rival"))}</div>
        <div class="goles ${cls(esMio)}">${goles}</div></div>`;

    let h = `<div class="marcador">
        ${lado(izq, gIzq, M.local)}
        <div class="vs">–</div>
        ${lado(der, gDer, !M.local)}
      </div>
      <p class="tenue" style="font-size:13px;text-align:center;margin-bottom:14px">${esc(M.comp || "")} · ${M.local ? "de local" : "de visita"}</p>`;

    if (P.minutos) {
      const ev = P.ev || {}, chips = [];
      for (let i = 0; i < (ev.gol || 0); i++) chips.push('<span class="chip gol">Gol</span>');
      for (let i = 0; i < (ev.asi || 0); i++) chips.push('<span class="chip gol">Asistencia</span>');
      for (let i = 0; i < (ev.atajada || 0); i++) chips.push('<span class="chip">Atajada</span>');
      for (let i = 0; i < (ev.amarilla || 0); i++) chips.push('<span class="chip am">Amarilla</span>');
      for (let i = 0; i < (ev.roja || 0); i++) chips.push('<span class="chip roja">Roja</span>');
      const n = P.rating;
      h += `<div class="nota"><b class="${n >= 7.5 ? "buena" : n < 5.5 ? "mala" : ""}">${n.toFixed(1)}</b>
        <span class="tenue" style="font-size:13.5px">${P.minutos} min en cancha</span>${chips.join("")}</div>`;
    } else if (pd.texto) {
      h += `<p class="texto">${esc(pd.texto)}</p>`;
    }
    for (const nar of P.narracion || []) {
      if (nar.txt) h += `<div class="min"><b>${nar.min}'</b><span>${esc(nar.txt)}</span></div>`;
    }
    return h;
  }

  function premiosHTML(d) {
    return `<div class="sep"></div>
      <div class="kv"><span>Balón de Oro</span><b>${esc(d.balon)}</b></div>
      <div class="kv"><span>Goleador del mundo</span><b>${esc(d.goleador)}</b></div>
      <div class="kv"><span>Tu puesto en la votación</span><b>#${d.tuPuesto}</b></div>
      <div class="kv"><span>Tu temporada</span><b>${d.tus.pj} PJ · ${d.tus.g} G · ${d.tus.a} A</b></div>`;
  }

  function vistaFin(pd) {
    const d = pd.datos;
    return `<div class="card">
      <div class="fin-grande">${esc(pd.titulo)}</div>
      <p class="texto">${esc(pd.texto)}</p>
      <div class="sep"></div>
      <div class="kv"><span>Partidos</span><b>${d.pj}</b></div>
      <div class="kv"><span>Goles</span><b>${d.g}</b></div>
      <div class="kv"><span>Asistencias</span><b>${d.a}</b></div>
      <div class="kv"><span>Nota promedio</span><b>${d.rating}</b></div>
      <div class="kv"><span>Ligas</span><b>${d.titulos.liga}</b></div>
      <div class="kv"><span>Copas nacionales</span><b>${d.titulos.copa}</b></div>
      <div class="kv"><span>Copas internacionales</span><b>${d.titulos.cont}</b></div>
      <div class="kv"><span>Balones de Oro</span><b>${d.balones}</b></div>
      <div class="kv"><span>Selección</span><b>${d.caps} PJ · ${d.golesSel} G</b></div>
      <div class="kv"><span>Patrimonio final</span><b>${dinero(d.patrimonio)}</b></div>
      ${d.dt ? `<div class="kv"><span>Temporadas como DT</span><b>${d.dt.temporadas}</b></div>
      <div class="kv"><span>Títulos como DT</span><b>${d.dt.titulos}</b></div>` : ""}
      <div class="sep"></div>
      <p class="tenue" style="font-size:13.5px">Clubes: ${d.clubes.map(esc).join(" · ")}</p>
    </div>
    <button class="btn primario" data-accion="reiniciar">Otra carrera</button>`;
  }

  /* ---------------------------------------------------------------- equipo */
  function barra(lab, val, max, neutra) {
    const pct = Math.max(0, Math.min(100, (val / max) * 100));
    const cls = neutra ? "" : pct < 33 ? " mal" : pct < 60 ? " medio" : "";
    return `<div class="barra${cls}"><div class="lab"><span>${esc(lab)}</span><b>${Math.round(val)}</b></div>
      <div class="riel"><i style="width:${pct}%"></i></div></div>`;
  }

  const ATTRS = [["rit", "Ritmo"], ["tir", "Tiro"], ["pas", "Pase"], ["reg", "Regate"], ["def", "Defensa"], ["fis", "Físico"], ["men", "Mentalidad"]];

  function vistaEquipo() {
    return (s.fase === "dt" && s.dt) ? vistaPizarron() : vistaJugador();
  }

  function vistaJugador() {
    const p = C.yo(s), me = s.me;
    let h = `<div class="card">
      <h2>Tu estado</h2>
      ${barra("Físico", p.fit, 100)}${barra("Ánimo", p.mor, 100)}
      ${barra("Confianza del técnico", me.confianza, 100)}${barra("Forma", (p.form + 3) * 16.6, 100)}
      ${barra("Fama", me.fama, 100)}${barra("Reputación", me.rep, 100)}
      <p class="tenue" style="font-size:13.5px;margin:4px 0 0">Esta temporada: ${p.st.pj} PJ · ${p.st.g} goles · ${p.st.a} asistencias · nota ${p.st.pj ? (p.st.rat / p.st.pj).toFixed(2) : "—"}</p>
      ${p.inj ? `<p style="color:var(--rojo);font-size:13.5px;margin:6px 0 0"><b>Lesionado:</b> ${esc(p.inj.name)}, ${p.inj.weeks} semanas.</p>` : ""}
    </div>`;

    h += `<div class="card"><h2>Atributos · media ${E.media(p)} · ${esc(D.POSITIONS[p.pos].name)}</h2>`;
    if (me.puntos > 0 && s.fase !== "fin") {
      h += `<p style="font-size:14px;margin-bottom:12px"><b>${me.puntos} punto${me.puntos > 1 ? "s" : ""} de talento</b> sin usar. Repártelos donde quieras.</p>`;
    }
    for (const [k, n] of ATTRS) {
      h += `<div style="display:flex;align-items:flex-end;gap:10px">
        <div style="flex:1">${barra(n, p.attrs[k], 99, true)}</div>
        ${me.puntos > 0 && p.attrs[k] < 99 && s.fase !== "fin"
          ? `<button class="btn chico" data-accion="punto" data-attr="${k}" style="margin-bottom:12px">+1</button>` : ""}
      </div>`;
    }
    const est = Math.round((p.pot + ((s.seed % 9) - 4)) / 5) * 5;
    h += `<div class="sep"></div>
      <div class="kv"><span>Techo que le ve el ojeador</span><b>~${est}</b></div>
      <div class="kv"><span>Contrato</span><b>${dinero(p.wage)}/sem · ${p.years} año${p.years === 1 ? "" : "s"}</b></div>
      <div class="kv"><span>Valor de mercado</span><b>${dinero(C.valueOf(p))}</b></div>
      <div class="kv"><span>Ojo táctico (para dirigir)</span><b>${Math.round(me.dtxp)}</b></div>
      <p class="tenue" style="font-size:13px;margin:10px 0 0">El techo de verdad está escondido: el ojeador se equivoca.</p>
      </div>`;

    return h + plantelHTML(p.clubId);
  }

  function plantelHTML(clubId) {
    const club = s.clubs[clubId];
    const ps = club.squad.map((id) => s.players[id]).filter(Boolean).sort((a, b) => E.media(b) - E.media(a));
    if (!ps.length) return "";
    return `<div class="card"><h2>Plantel de ${esc(club.name)}</h2>` + ps.map((p) =>
      `<div class="fila-lista ${p.id === 0 ? "yo" : ""}">
        <span class="pos">${esc(p.pos)}</span>
        <span class="nom">${esc(p.name)}${p.inj ? ` <span style="color:var(--rojo);font-size:12px">(${p.inj.weeks}s)</span>` : ""}</span>
        <span class="dato">${p.age} a</span>
        <span class="dato fuerte">${E.media(p)}</span>
      </div>`).join("") + `</div>`;
  }

  function vistaPizarron() {
    const dt = s.dt, plantel = C.plantelDT(s);
    const grupo = (campo, ops, actual) => `<div class="pills" style="margin-bottom:14px">` + ops.map(([v, t]) =>
      `<button class="pill ${v === actual ? "on" : ""}" data-accion="tactica" data-campo="${campo}" data-valor="${v}">${esc(t)}</button>`).join("") + `</div>`;
    const f = C.fuerzaDT(s, dt.clubId, dt.xi);
    let h = `<div class="card">
      <h2>El banco</h2>
      ${barra("Paciencia de la dirigencia", dt.paciencia, 100)}
      ${barra("Tu prestigio", s.me.repDT || 0, 100)}
      ${barra("Ánimo del plantel", prom(plantel.map((x) => x.mor)), 100)}
      ${barra("Físico del plantel", prom(plantel.map((x) => x.fit)), 100)}
      <p class="tenue" style="font-size:13.5px;margin:2px 0 0">Objetivo: ${esc(dt.objetivo.txt)} · ${dt.record.g}G ${dt.record.e}E ${dt.record.p}P</p>
    </div>
    <div class="card">
      <h2>Formación</h2>${grupo("formacion", Object.keys(D.FORMATIONS).map((k) => [k, k]), dt.formacion)}
      <h2>Estilo</h2>${grupo("estilo", Object.keys(D.STYLES).map((k) => [k, D.STYLES[k].name]), dt.estilo)}
      <h2>Mentalidad</h2>${grupo("mentalidad", D.MENTALITIES.map((m) => [m.id, m.name]), dt.mentalidad)}
      <p class="tenue" style="font-size:13.5px">${esc(D.STYLES[dt.estilo].desc)}</p>
      <div class="sep"></div>
      ${barra("Ataque", f.atk, 100, true)}${barra("Defensa", f.def, 100, true)}
      <button class="btn chico" data-accion="autoxi">Rearmar el once con los mejores</button>
    </div>`;
    const xi = (dt.xi || []).map((id) => s.players[id]).filter(Boolean);
    if (xi.length) {
      h += `<div class="card"><h2>Once inicial</h2>` + xi.map((p) =>
        `<div class="fila-lista"><span class="pos">${esc(p.pos)}</span>
          <span class="nom">${esc(p.name)}</span><span class="dato">${p.age} a</span>
          <span class="dato fuerte">${E.media(p)}</span></div>`).join("") + `</div>`;
    }
    return h + plantelHTML(dt.clubId);
  }

  /* ----------------------------------------------------------------- tabla */
  function tablaHTML(ligaId, resaltar) {
    const L = s.comp.ligas[ligaId], info = liga(ligaId);
    if (!L) return `<p class="tenue">Esta categoría no se juega en esta carrera.</p>`;
    const filas = E.sortTable(L.tabla);
    let h = filas.map((r, i) => {
      const club = s.clubs[r.clubId];
      const zona = info.sube && i < 2 ? "sube" : info.baja && i >= filas.length - 2 ? "baja" : "";
      return `<div class="fila-lista ${r.clubId === resaltar ? "yo" : ""}">
        <span class="zona ${zona}"></span>
        <span class="pos">${i + 1}</span>
        ${camiseta(club, "mini")}
        <span class="nom">${esc(club.name)}</span>
        <span class="dato">${r.pj}</span>
        <span class="dato">${r.gf - r.gc > 0 ? "+" : ""}${r.gf - r.gc}</span>
        <span class="dato fuerte">${r.pts}</span>
      </div>`;
    }).join("");
    const notas = [];
    if (info.sube) notas.push(`<span style="color:var(--verde)">▌</span> suben a ${esc(liga(info.sube).name)}`);
    if (info.baja && s.comp.ligas[info.baja]) notas.push(`<span style="color:var(--rojo)">▌</span> bajan a ${esc(liga(info.baja).name)}`);
    if (notas.length) h += `<p class="tenue" style="font-size:12.5px;margin:10px 0 0">${notas.join(" · ")}</p>`;
    return h;
  }

  function vistaTabla() {
    const clubId = s.fase === "dt" && s.dt ? s.dt.clubId : C.yo(s).clubId;
    const club = s.clubs[clubId], L = liga(club.leagueId);
    let h = `<div class="card"><h2>${esc(L.name)}</h2>${tablaHTML(L.id, clubId)}</div>`;

    const CP = s.comp.copa[L.id];
    if (CP) {
      const ronda = CP.llaves.rondas[CP.ronda];
      h += `<div class="card"><h2>${esc(L.cup)}</h2>`;
      if (CP.campeon != null) h += `<p>Campeón: <b>${esc(s.clubs[CP.campeon].name)}</b></p>`;
      else if (ronda) h += ronda.map(([a, b]) => `<div class="fila-lista"><span class="nom">${esc(s.clubs[a].name)}</span>
        <span class="tenue" style="font-size:12px">vs</span><span class="nom" style="text-align:right">${esc(s.clubs[b].name)}</span></div>`).join("");
      else h += `<p class="tenue">Todavía no arranca.</p>`;
      h += `</div>`;
    }

    if (L.cont && s.comp.cont[L.cont]) {
      const Kc = s.comp.cont[L.cont];
      h += `<div class="card"><h2>${esc(D.CONTINENTALES[L.cont])}</h2>`;
      if (Kc.campeon != null) h += `<p>Campeón: <b>${esc(s.clubs[Kc.campeon].name)}</b></p>`;
      else if (Kc.fase === "grupos") {
        Kc.tablas.forEach((tb, i) => {
          h += `<p class="tenue" style="font-size:12.5px;margin:10px 0 2px">Grupo ${String.fromCharCode(65 + i)}</p>`;
          h += E.sortTable(tb).map((r) => `<div class="fila-lista ${r.clubId === clubId ? "yo" : ""}">
            ${camiseta(s.clubs[r.clubId], "mini")}<span class="nom">${esc(s.clubs[r.clubId].name)}</span>
            <span class="dato">${r.pj}</span><span class="dato fuerte">${r.pts}</span></div>`).join("");
        });
      } else if (Kc.fase === "semis" && Kc.semis) {
        h += Kc.semis.map(([a, b]) => `<div class="fila-lista"><span class="nom">${esc(s.clubs[a].name)}</span>
          <span class="tenue" style="font-size:12px">vs</span><span class="nom" style="text-align:right">${esc(s.clubs[b].name)}</span></div>`).join("");
      } else if (Kc.final) {
        h += `<p>Final: <b>${esc(s.clubs[Kc.final[0]].name)}</b> vs <b>${esc(s.clubs[Kc.final[1]].name)}</b></p>`;
      }
      h += `</div>`;
    }
    return h;
  }

  /* --------------------------------------------------------------- carrera */
  function vistaCarrera() {
    const me = s.me, c = me.carrera;
    let h = `<div class="card"><h2>Palmarés</h2>
      <div class="kv"><span>Partidos</span><b>${c.pj}</b></div>
      <div class="kv"><span>Goles</span><b>${c.g}</b></div>
      <div class="kv"><span>Asistencias</span><b>${c.a}</b></div>
      <div class="kv"><span>Figura del partido</span><b>${c.mvp}</b></div>
      <div class="kv"><span>Nota promedio</span><b>${c.pj ? (c.ratSum / c.pj).toFixed(2) : "—"}</b></div>
      <div class="kv"><span>Ligas</span><b>${c.titulos.liga}</b></div>
      <div class="kv"><span>Copas nacionales</span><b>${c.titulos.copa}</b></div>
      <div class="kv"><span>Copas internacionales</span><b>${c.titulos.cont}</b></div>
      <div class="kv"><span>Balones de Oro</span><b>${c.balones}</b></div>
      <div class="kv"><span>Selección</span><b>${me.caps} PJ · ${me.golesSel} G</b></div>
    </div>`;
    if (me.hist.length) {
      h += `<div class="card"><h2>Temporada a temporada</h2>` + me.hist.slice().reverse().map((x) =>
        x.dt
          ? `<div class="fila-lista"><span class="pos">${x.anio}</span><span class="nom">DT · ${esc(x.club)}</span>
             <span class="dato">${x.g}G ${x.e}E ${x.p}P</span></div>`
          : `<div class="fila-lista"><span class="pos">${x.anio}</span><span class="nom">${esc(x.club)}</span>
             <span class="dato">${x.pj} PJ</span><span class="dato">${x.g} G</span><span class="dato fuerte">${x.rat}</span></div>`
      ).join("") + `</div>`;
    }
    h += `<div class="card feed"><h2>Historial</h2>` + s.feed.slice(0, 40).map((f) =>
      `<div class="it"><span class="t">${esc(f.t)}</span><span class="${f.tipo}">${esc(f.txt)}</span></div>`).join("") + `</div>`;
    return h;
  }

  /* ------------------------------------------------------------------- más */
  function vistaMas() {
    const p = C.yo(s), me = s.me, dirige = s.fase === "dt" && s.dt;
    const L = liga(s.clubs[dirige ? s.dt.clubId : p.clubId].leagueId);
    const sponsors = me.sponsors.reduce((a, x) => a + x.pago, 0);
    const sueldo = dirige ? s.dt.sueldo : p.wage;
    const bruto = sueldo + sponsors;
    const vida = D.LIFESTYLE[me.estilo].cost * sueldo + 180;
    const agente = dirige ? 0 : p.wage * me.agente.comision;
    const ritmo = ritmoActual();

    const key = laKey();
    let h = `<div class="card"><h2>Momentos con IA</h2>
      <p class="texto" style="font-size:14.5px">Las jugadas que te paran el partido las escribe Claude con lo que está pasando: el minuto, el marcador, el rival y cómo vienes tú. Por eso no se repiten.</p>
      <label for="apikey">API key de Anthropic</label>
      <input id="apikey" type="password" autocomplete="off" placeholder="${key ? "guardada · pega otra para cambiarla" : "sk-ant-…"}">
      <p class="tenue" style="font-size:13px;margin:8px 0 12px">${key
        ? `Guardada en este navegador (termina en ${esc(key.slice(-4))}). No sale de aquí salvo a api.anthropic.com.`
        : "Se guarda solo en este navegador. El costo de la API corre por tu cuenta."}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn chico" data-accion="guardar-key">Guardar</button>
        ${key ? `<button class="btn chico" data-accion="borrar-key" style="color:var(--rojo)">Borrar</button>` : ""}
      </div>
    </div>`;

    h += `<div class="card"><h2>Ritmo de la carrera</h2>` + RITMOS.map(([k, n, d]) =>
      `<button class="btn" data-accion="ritmo" data-ritmo="${k}"
        style="${k === ritmo ? "border-color:var(--verde);background:var(--verde-suave)" : ""}">${n}<span class="sub">${d}</span></button>`).join("") + `</div>`;

    h += `<div class="card"><h2>Tu semana en plata</h2>
      <div class="kv"><span>Sueldo</span><b>${dinero(sueldo)}</b></div>
      <div class="kv"><span>Sponsors</span><b>${dinero(sponsors)}</b></div>
      <div class="kv"><span>Impuestos (${Math.round(L.tax * 100)}%)</span><b style="color:var(--rojo)">−${dinero(bruto * L.tax)}</b></div>
      <div class="kv"><span>Representante</span><b style="color:var(--rojo)">−${dinero(agente)}</b></div>
      <div class="kv"><span>Nivel de vida</span><b style="color:var(--rojo)">−${dinero(vida)}</b></div>
      <div class="kv"><span><b style="color:var(--texto)">Neto</b></span><b style="color:var(--verde)">${dinero(bruto - bruto * L.tax - agente - vida)}</b></div>
      <div class="kv"><span>Efectivo</span><b>${dinero(me.plata)}</b></div>
      <div class="sep"></div>
      <h2>Cómo vives</h2>
      <div class="pills">${D.LIFESTYLE.map((l, i) =>
        `<button class="pill ${i === me.estilo ? "on" : ""}" data-accion="estilo" data-i="${i}">${esc(l.name)}</button>`).join("")}</div>
    </div>`;

    h += `<div class="card"><h2>Negocios</h2>`;
    for (const d of D.INVESTMENTS) {
      const mine = me.inv.find((x) => x.id === d.id);
      h += `<div style="padding:10px 0;border-top:1px solid var(--linea)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
          <b style="font-size:14.5px">${esc(d.name)}</b>
          <b class="num" style="font-size:14px">${mine ? dinero(mine.value) : "—"}</b></div>
        <p class="tenue" style="font-size:13px;margin:2px 0 8px">${esc(d.desc)}
          ${mine ? `· <span style="color:${mine.last >= 0 ? "var(--verde)" : "var(--rojo)"}">${(mine.last * 100).toFixed(2)}%/sem</span>` : ""}</p>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="num" id="inv-${d.id}" value="${d.min}" inputmode="numeric" style="flex:1;padding:9px 11px">
          <button class="btn chico" data-accion="invertir" data-id="${d.id}">Invertir</button>
          ${mine ? `<button class="btn chico" data-accion="retirar" data-id="${d.id}">Retirar</button>` : ""}
        </div></div>`;
    }
    h += `</div>`;

    h += `<div class="card"><h2>Tu carrera</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn chico" data-accion="exportar">Exportar</button>
        <button class="btn chico" data-accion="importar">Importar</button>
        <button class="btn chico" data-accion="reiniciar" style="color:var(--rojo)">Empezar otra</button>
      </div>
      ${store.persistente ? "" : `<p class="tenue" style="font-size:13px;margin:12px 0 0">Este navegador no deja guardar en disco: la carrera vive en memoria hasta que recargues. Usa Exportar.</p>`}
    </div>`;
    return h;
  }

  /* ------------------------------------------------------------- acciones */
  const ACCIONES = {
    tab: (b) => { tab = b.dataset.tab; render(); window.scrollTo({ top: 0 }); },
    pais: (b) => { nuevo.pais = b.dataset.pais; pantallaInicio(); },
    pos: (b) => { nuevo.pos = b.dataset.pos; pantallaInicio(); },
    perfil: (b) => { nuevo.perfil = b.dataset.perfil; pantallaInicio(); },
    "ritmo-nuevo": (b) => { nuevo.ritmo = b.dataset.ritmo; pantallaInicio(); },
    ritmo: (b) => { store.set("potrero.ritmo", b.dataset.ritmo); render(); },
    empezar: () => {
      const nom = ($("nom").value || "").trim();
      store.set("potrero.ritmo", nuevo.ritmo);
      s = C.nuevaPartida({ nombre: nom || "Chibolo del Potrero", pos: nuevo.pos, perfil: nuevo.perfil, pais: nuevo.pais });
      tab = "jugar";
      avanzar(); guardar(); render();
    },
    punto: (b) => { C.gastarPunto(s, b.dataset.attr); guardar(); render(); },
    tactica: (b) => { C.setTactica(s, b.dataset.campo, b.dataset.valor); guardar(); render(); },
    autoxi: () => { C.autoXI(s); guardar(); render(); },
    estilo: (b) => { C.setEstilo(s, +b.dataset.i); guardar(); render(); },
    invertir: (b) => {
      const monto = parseInt(($("inv-" + b.dataset.id) || {}).value, 10);
      const d = D.INVESTMENTS.find((x) => x.id === b.dataset.id);
      if (!C.invertir(s, b.dataset.id, monto)) alert(`Mínimo ${dinero(d.min)} y tienes que tener la plata en efectivo.`);
      guardar(); render();
    },
    retirar: (b) => { C.retirarInv(s, b.dataset.id); guardar(); render(); },
    exportar: () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([C.guardar(s)], { type: "application/json" }));
      a.download = `potrero-${s.seed}-T${s.temporada}.json`; a.click();
    },
    importar: () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json";
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const o = C.cargar(rd.result);
          if (o) { s = o; tab = "jugar"; guardar(); render(); }
          else alert("Ese archivo no es una carrera de POTRERO (o es de una versión vieja).");
        };
        rd.readAsText(f);
      };
      inp.click();
    },
    "reintentar-ia": () => { errorIA = ""; render(); },
    "saltar-ia": () => { errorIA = ""; paso(0); },
    "guardar-key": () => {
      const v = ($("apikey").value || "").trim();
      if (v) store.set(KEY_IA, v); else store.del(KEY_IA);
      $("apikey").value = "";
      errorIA = ""; render();
    },
    "borrar-key": () => { store.del(KEY_IA); errorIA = ""; render(); },
    reiniciar: () => {
      if (s && !confirm("¿Empezar otra carrera? La de ahora se borra.")) return;
      store.del(KEY); s = null; tab = "jugar"; render();
    },
  };

  /* =============================================================== arranque */
  const guardado = C.cargar(store.get(KEY));
  if (guardado) { s = guardado; avanzar(); }
  render();
})();
