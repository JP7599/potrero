"use strict";
/* POTRERO — el mundo del juego.
 *
 * Todo inventado a propósito: ligas, clubes, marcas y nombres son ficticios
 * (cualquier parecido con la realidad es culpa del fútbol). Este archivo es
 * data pura, sin lógica: el motor lo consume, los tests lo verifican.
 */
(function (global) {
  /* ---------------------------------------------------------------- mundo
   * Las ligas y los clubes ya no viven acá: los trae mundo.js, generado desde
   * openfootball (dominio público, CC0) más las primeras divisiones curadas a
   * mano. Este archivo se queda con lo que es puramente de juego: puestos,
   * acciones de la semana, momentos de partido y eventos de vida. */
  if (typeof require !== "undefined" && !global.PotreroMundo) require("./mundo.js");
  const M = global.PotreroMundo;
  const PAISES = M.PAISES;

  /* Impuesto sobre el sueldo, por país; lo que falta usa el de su
   * confederación. No es una tabla fiscal: es una perilla de juego que hace
   * que irse a Inglaterra por el doble no sea automáticamente el doble. */
  const TAX_CONF = { conmebol: 0.28, concacaf: 0.32, uefa: 0.40 };
  const TAX = {
    pe: 0.30, ar: 0.35, br: 0.27, cl: 0.30, co: 0.33, uy: 0.30, ec: 0.25,
    py: 0.10, bo: 0.13, ve: 0.34, mx: 0.30, us: 0.37, ca: 0.33, cr: 0.25,
    es: 0.45, eng: 0.45, it: 0.43, de: 0.42, fr: 0.45, pt: 0.28, nl: 0.49,
    be: 0.50, tr: 0.35, sco: 0.45, gr: 0.44, ru: 0.13, ua: 0.19, hr: 0.30,
    rs: 0.20, at: 0.48, ch: 0.25, dk: 0.52, se: 0.52, no: 0.47, pl: 0.32, cz: 0.23,
  };
  const NOMBRE_PAIS = {};
  PAISES.forEach((p) => { NOMBRE_PAIS[p.cod] = p.nombre; });

  const LEAGUES = M.LIGAS.map((l) => ({
    id: l.id, name: l.name, pais: l.pais, div: l.div,
    short: (NOMBRE_PAIS[l.pais] + " " + l.div).toUpperCase(),
    region: l.region, tier: l.tier,
    tax: TAX[l.pais] != null ? TAX[l.pais] : TAX_CONF[l.region],
    cup: l.cup, cont: l.cont, sube: l.sube, baja: l.baja,
  }));
  /* [liga, nombre, ciudad, prestigio, patrón, color1, color2, ...extras] */
  const CLUBS = M.CLUBS;
  const CONTINENTALES = M.CONTINENTALES;

  /* --------------------------------------------------------- posiciones */
  /* Pesos con los que cada puesto convierte atributos en media. */
  const POSITIONS = {
    POR: { name: "Portero",       line: "por", w: { rit: 0.05, tir: 0.02, pas: 0.13, reg: 0.02, def: 0.48, fis: 0.18, men: 0.12 } },
    DFC: { name: "Central",       line: "def", w: { rit: 0.10, tir: 0.02, pas: 0.12, reg: 0.04, def: 0.42, fis: 0.20, men: 0.10 } },
    LAT: { name: "Lateral",       line: "def", w: { rit: 0.22, tir: 0.04, pas: 0.18, reg: 0.12, def: 0.24, fis: 0.14, men: 0.06 } },
    MCD: { name: "Volante de marca", line: "med", w: { rit: 0.10, tir: 0.05, pas: 0.24, reg: 0.10, def: 0.28, fis: 0.15, men: 0.08 } },
    MC:  { name: "Mediocampista", line: "med", w: { rit: 0.10, tir: 0.10, pas: 0.30, reg: 0.16, def: 0.14, fis: 0.12, men: 0.08 } },
    MCO: { name: "Enganche",      line: "med", w: { rit: 0.12, tir: 0.16, pas: 0.28, reg: 0.24, def: 0.04, fis: 0.08, men: 0.08 } },
    EXT: { name: "Extremo",       line: "atk", w: { rit: 0.26, tir: 0.16, pas: 0.14, reg: 0.28, def: 0.04, fis: 0.06, men: 0.06 } },
    DC:  { name: "Delantero",     line: "atk", w: { rit: 0.18, tir: 0.34, pas: 0.08, reg: 0.16, def: 0.02, fis: 0.14, men: 0.08 } },
  };
  const POS_LIST = Object.keys(POSITIONS);

  /* Cuánto del gol/asistencia del equipo pasa por ti, por puesto. */
  const SHARE = {
    POR: { gol: 0.00, asi: 0.01 }, DFC: { gol: 0.05, asi: 0.03 }, LAT: { gol: 0.05, asi: 0.14 },
    MCD: { gol: 0.06, asi: 0.10 }, MC: { gol: 0.11, asi: 0.20 },  MCO: { gol: 0.18, asi: 0.30 },
    EXT: { gol: 0.22, asi: 0.26 }, DC: { gol: 0.38, asi: 0.13 },
  };

  /* Plantilla ideal: cuántos de cada puesto genera un club. */
  const SQUAD_SHAPE = ["POR", "POR", "DFC", "DFC", "DFC", "LAT", "LAT", "MCD", "MCD", "MC", "MC", "MCO", "EXT", "EXT", "DC", "DC", "MC", "DFC"];

  /* ------------------------------------------------------------- nombres */
  const NAMES = {
    sud: {
      first: ["Luis", "Jefferson", "Piero", "Renato", "Yoshimar", "André", "Wilder", "Alexander", "Bryan", "Kevin", "Joao", "Diego", "Santiago", "Facundo", "Matías", "Thiago", "Rodrigo", "Emiliano", "Lautaro", "Gonzalo", "Franco", "Julián", "Alan", "Óscar", "Rubén", "Marcelo", "Iván", "Nahuel", "Brahian", "Jhamir", "Cristhian", "Erick", "Maykol", "Anderson", "Fabricio"],
      last: ["Quispe", "Mamani", "Chávez", "Ramos", "Flores", "Zambrano", "Ríos", "Salazar", "Villanueva", "Paredes", "Ortiz", "Bazán", "Huamán", "Peralta", "Aguirre", "Molina", "Fuentes", "Cárdenas", "Loayza", "Sosa", "Barreto", "Vega", "Rojas", "Tello", "Ocampo", "Villar", "Reyna", "Zeballos", "Ayala", "Cabrera", "Espinoza", "Gamarra", "Del Solar", "Ñahui", "Cueto", "Arriola", "Benavente", "Mendieta"],
      solo: ["Juninho", "Rafinha", "Cacá", "Vitinho", "Dedé", "Marquinho", "Zezinho", "Wendell", "Kaio", "Talles", "Éder", "Léo", "Igor", "Douglas", "Nenê", "Betinho", "Cauã", "Rominho"],
    },
    eur: {
      first: ["Callum", "Owen", "Declan", "Finn", "Jonas", "Lukas", "Nico", "Théo", "Enzo", "Hugo", "Ilan", "Malo", "Matteo", "Lorenzo", "Nicolò", "Iker", "Aitor", "Unai", "Pau", "Marc", "Sergi", "Bram", "Sven", "Kasper", "Mateusz", "Tomás", "Andrej", "Emre", "Deniz", "Rúben", "Gonçalo", "Stefan"],
      last: ["Reeves", "Ashby", "Whitlock", "Braun", "Keller", "Vogt", "Lemoine", "Roux", "Bernier", "Rossetti", "Marchetti", "Ferraro", "Aguado", "Otxoa", "Beltrán", "Sabaté", "De Vries", "Bakker", "Nyman", "Lindqvist", "Novák", "Krúpa", "Dimitrov", "Yalçın", "Demir", "Almeida", "Carvalho", "Kovač", "Bogdan", "Lund", "Marchand"],
    },
  };

  const CITY_NICK = ["el Potrillo", "la Joya", "el Fenómeno", "el Cholo", "la Pulga", "el Toro", "el Chino", "el Loco", "el Príncipe", "el Chaval", "el Chibolo", "el Trencito", "el Puma", "el Zorro", "el Mago"];

  /* ------------------------------------------------------------ sponsors */
  /* pago semanal = base * (fama/100)^1.4 * factor; fama exigida = min. */
  const SPONSORS = [
    { id: "condor",  marca: "Zapatillas Cóndor",   min: 10, base: 900,    tag: "botines" },
    { id: "chicha",  marca: "Chicha Real",         min: 18, base: 1500,   tag: "bebida" },
    { id: "andino",  marca: "Banco Andino",        min: 30, base: 4200,   tag: "banco" },
    { id: "polleria",marca: "Pollería El Crack",   min: 22, base: 2600,   tag: "comida" },
    { id: "tigre",   marca: "Tigre Móvil",         min: 40, base: 7000,   tag: "telefonía" },
    { id: "nova",    marca: "Nova Boots",          min: 52, base: 14000,  tag: "botines" },
    { id: "andex",   marca: "Cripto Ándex",        min: 45, base: 11000,  tag: "riesgo", riesgo: true },
    { id: "aerosur", marca: "Aerolíneas Sur",      min: 60, base: 21000,  tag: "aerolínea" },
    { id: "volt",    marca: "Gaseosa Volt",        min: 72, base: 38000,  tag: "bebida" },
    { id: "reloj",   marca: "Relojes Meridiano",   min: 85, base: 70000,  tag: "lujo" },
  ];

  /* --------------------------------------------------------- inversiones */
  const INVESTMENTS = [
    { id: "bonos",    name: "Bonos soberanos",       drift: 0.0009, vol: 0.0025, min: 5000,   desc: "Aburrido. Le gana a la inflación y poco más." },
    { id: "ladrillo", name: "Departamentos en Lima", drift: 0.0016, vol: 0.0075, min: 60000,  desc: "Ladrillo. Sube lento, no te deja dormir mal." },
    { id: "polleria", name: "Pollería con tu nombre",drift: 0.0030, vol: 0.026,  min: 40000,  desc: "Rinde si eres famoso; quiebra si te olvidan.", fama: true },
    { id: "academia", name: "Academia de menores",   drift: 0.0021, vol: 0.017,  min: 80000,  desc: "Paga poco y te da galones de DT antes de colgar.", dt: true },
    { id: "gambeta",  name: "Cripto $GAMBETA",       drift: 0.0055, vol: 0.098,  min: 10000,  desc: "Puede hacerte rico. Puede hacerte meme." },
  ];

  /* -------------------------------------------------- acciones semanales */
  /* efectos se aplican en engine.applyAction; cada semana eliges una. */
  const ACTIONS = [
    { id: "tecnica",  name: "Entrenar técnica",    icon: "◎", desc: "Pase, regate y tiro. El pan de cada día.", xp: 1.0, attrs: ["pas", "reg", "tir"], fit: -6 },
    { id: "fisico",   name: "Gimnasio",            icon: "▲", desc: "Físico y ritmo. Menos lesiones a la larga.", xp: 0.9, attrs: ["fis", "rit"], fit: -9, resist: 0.6 },
    { id: "tactica",  name: "Video y táctica",     icon: "▤", desc: "Defensa y mentalidad. Suma para la carrera de DT.", xp: 0.85, attrs: ["def", "men"], fit: -3, dt: 1.4 },
    { id: "descanso", name: "Descansar",           icon: "☾", desc: "Recuperas forma física y ánimo. No mejoras nada.", xp: 0, attrs: [], fit: 22, mor: 6 },
    { id: "fisio",    name: "Fisioterapia",        icon: "✚", desc: "Acelera la recuperación de lesiones.", xp: 0, attrs: [], fit: 10, cura: 1 },
    { id: "prensa",   name: "Prensa y redes",      icon: "✦", desc: "Sube fama (y la chance de que te inventen un escándalo).", xp: 0.2, attrs: [], fit: -2, fama: 2.2, escandalo: 0.06 },
    { id: "fiesta",   name: "Salir de noche",      icon: "♪", desc: "El ánimo sube. Todo lo demás baja.", xp: 0, attrs: [], fit: -16, mor: 12, fama: 1.1, escandalo: 0.16, prof: -1.2 },
    { id: "familia",  name: "Tiempo con la gente", icon: "♥", desc: "Ánimo estable, cabeza en su sitio.", xp: 0.1, attrs: ["men"], fit: 6, mor: 9, prof: 0.5 },
    { id: "idiomas",  name: "Estudiar idiomas",    icon: "☰", desc: "Te adaptas mejor al irte a Europa. Y hablas con la prensa.", xp: 0.2, attrs: ["men"], fit: 0, idioma: 1.5, dt: 0.5 },
    { id: "negocios", name: "Ver tus negocios",    icon: "$", desc: "Mejor rendimiento de tus inversiones esta semana.", xp: 0, attrs: [], fit: 2, negocio: 1 },
  ];

  const LIFESTYLE = [
    { id: 0, name: "Como en casa",   cost: 0.04, mor: -2, fama: 0.0 },
    { id: 1, name: "Discreto",       cost: 0.10, mor: 0,  fama: 0.1 },
    { id: 2, name: "De futbolista",  cost: 0.22, mor: 3,  fama: 0.5 },
    { id: 3, name: "Crack",          cost: 0.38, mor: 6,  fama: 1.1 },
    { id: 4, name: "Escándalo",      cost: 0.60, mor: 9,  fama: 2.0, escandalo: 0.05 },
  ];

  /* ---------------------------------------------------- momentos de juego */
  /* Cada momento aparece dentro de un partido. `when` filtra por contexto.
   * Cada opción: prob = f(atributos), y consecuencias declaradas. */
  const MOMENTS = [
    {
      id: "penal", peso: 3, when: (c) => c.jugando && c.min > 60 && c.penal,
      texto: (c) => `Minuto ${c.min}. Penal a favor y ${c.marcadorTxt}. El capitán te mira: ¿la pateas tú?`,
      opts: [
        { txt: "La pateo yo", key: "tir", base: 0.62, w: 0.35, ok: { gol: 1, mor: 6, conf: 6, fama: 1.2, txt: "Cambiaste el palo. Gol." }, mal: { mor: -12, conf: -8, txt: "Le pegaste al travesaño. El estadio hizo un ruido feo." } },
        { txt: "Que la patee el especialista", key: null, base: 1, ok: { conf: 1, txt: "El nueve la mandó a guardar sin drama." } },
        { txt: "Panenka", key: "men", base: 0.42, w: 0.5, ok: { gol: 1, mor: 10, conf: 4, fama: 4.5, txt: "PANENKA. El arquero sigue buscándola." }, mal: { mor: -18, conf: -16, fama: 2.2, txt: "El arquero se quedó parado y la agarró. Vas a ver ese clip toda tu vida." } },
      ],
    },
    {
      id: "mano_a_mano", peso: 4, when: (c) => c.jugando && ["DC", "EXT", "MCO"].includes(c.pos),
      texto: (c) => `Te quedas mano a mano con el arquero. ${c.marcadorTxt}.`,
      opts: [
        { txt: "Definir cruzado", key: "tir", base: 0.55, w: 0.4, ok: { gol: 1, mor: 5, conf: 5, txt: "Al segundo palo. Golazo." }, mal: { conf: -3, txt: "Se fue apenas afuera. Te agarraste la cabeza." } },
        { txt: "Amagar y esperar", key: "reg", base: 0.48, w: 0.45, ok: { gol: 1, mor: 7, conf: 6, fama: 1.6, txt: "Lo sentaste y la empujaste. Eso va a los resúmenes." }, mal: { conf: -6, mor: -4, txt: "Te tardaste. Volvió el central y te la sacó." } },
        { txt: "Pasarla al que entra solo", key: "pas", base: 0.72, w: 0.3, ok: { asi: 1, mor: 4, conf: 4, txt: "Asistencia de manual." }, mal: { conf: -2, txt: "El pase salió largo. Se perdió la más clara." } },
      ],
    },
    {
      id: "falta_al_borde", peso: 3, when: (c) => c.jugando && c.min > 25,
      texto: () => "Falta al borde del área. La barrera se acomoda.",
      opts: [
        { txt: "Pegarle al ángulo", key: "tir", base: 0.28, w: 0.5, ok: { gol: 1, mor: 9, conf: 7, fama: 3.5, txt: "Al ángulo. No hay arquero para eso." }, mal: { txt: "Se fue por arriba. Aplauso de compromiso." } },
        { txt: "Pase al segundo palo", key: "pas", base: 0.34, w: 0.4, ok: { asi: 1, mor: 5, conf: 4, txt: "Centro medido, cabezazo, gol." }, mal: { txt: "Despejó el central." } },
        { txt: "Amagar y jugarla corta", key: "reg", base: 0.4, w: 0.35, ok: { asi: 1, conf: 3, mor: 3, txt: "La jugada ensayada salió una vez en la vida y fue hoy." }, mal: { conf: -3, txt: "Se cortó sola. El técnico renegó desde el banco." } },
      ],
    },
    {
      id: "ultimo_hombre", peso: 3, when: (c) => c.jugando && ["DFC", "LAT", "MCD", "MC"].includes(c.pos),
      texto: () => "Se te va el delantero rival y eres el último hombre.",
      opts: [
        { txt: "Barrida limpia", key: "def", base: 0.5, w: 0.45, ok: { conf: 6, mor: 4, txt: "Le sacaste la pelota y la pierna quedó entera. Ovación." }, mal: { roja: 1, conf: -14, mor: -14, txt: "Roja directa. Te fuiste al camerino mirando el piso." } },
        { txt: "Aguantarlo y esperar ayuda", key: "men", base: 0.62, w: 0.35, ok: { conf: 3, txt: "Lo llevaste a la banda hasta que llegó el central." }, mal: { conGol: 1, conf: -7, txt: "Te ganó el tiempo y la clavó. Gol en contra tuya." } },
        { txt: "Foul táctico", key: null, base: 1, ok: { amarilla: 1, conf: 2, txt: "Amarilla y de la falta no pasó nada. Oficio." } },
      ],
    },
    {
      id: "arquero_penal", peso: 4, when: (c) => c.jugando && c.pos === "POR" && c.penalContra,
      texto: () => "Penal en contra. Te toca elegir palo.",
      opts: [
        { txt: "Adivinar a la izquierda", key: "men", base: 0.3, w: 0.35, ok: { atajada: 1, conf: 10, mor: 10, fama: 3, txt: "¡ATAJADA! Te levantaste con la pelota en las manos." }, mal: { conGol: 1, txt: "Fuiste para el otro lado." } },
        { txt: "Quedarte y esperar", key: "def", base: 0.24, w: 0.4, ok: { atajada: 1, conf: 12, mor: 12, fama: 4, txt: "No te moviste y se la comieron. Atajadón de estatua." }, mal: { conGol: 1, txt: "Le pegó al medio-abajo, no llegaste." } },
        { txt: "Hacerle psicología", key: "men", base: 0.36, w: 0.45, ok: { atajada: 1, conf: 9, mor: 8, fama: 5, txt: "Le hablaste, se puso nervioso, la tiró afuera." }, mal: { conGol: 1, amarilla: 1, txt: "El árbitro te sacó amarilla por demorar. Y encima gol." } },
      ],
    },
    {
      id: "arbitro", peso: 2, when: (c) => c.jugando && c.min > 40,
      texto: () => "El árbitro te cobra una falta inexistente y el banco rival festeja.",
      opts: [
        { txt: "Reclamar de frente", key: "men", base: 0.35, w: 0.3, ok: { conf: 3, mor: 4, txt: "Le hablaste bien y hasta te pidió calma con respeto." }, mal: { amarilla: 1, mor: -4, txt: "Amarilla por protestar. Bien hecho, crack." } },
        { txt: "Tragártela", key: null, base: 1, ok: { men: 0.4, txt: "Te mordiste la lengua. Eso también se entrena." } },
        { txt: "Aplaudirle irónicamente", key: null, base: 0, mal: { amarilla: 1, fama: 1.5, mor: -2, txt: "Amarilla instantánea. El clip ya está en todos lados." } },
      ],
    },
    {
      id: "companero_egoista", peso: 2, when: (c) => c.jugando,
      texto: () => "El delantero estrella no te pasó una pelota clarísima. Otra vez.",
      opts: [
        { txt: "Encararlo en la cancha", key: "men", base: 0.4, w: 0.3, ok: { mor: 5, conf: 2, txt: "Se lo dijiste de frente y te respetó más." }, mal: { mor: -6, quimica: -6, txt: "Se armó el roche. El camerino quedó raro." } },
        { txt: "Hablarlo en el vestuario", key: "men", base: 0.65, w: 0.25, ok: { quimica: 5, mor: 3, txt: "Conversaron como gente grande. La próxima te la pasó." }, mal: { quimica: -2, txt: "Te dijo que sí y siguió igual." } },
        { txt: "Dejarlo pasar", key: null, base: 1, ok: { txt: "Ya fue. Tú a lo tuyo." } },
      ],
    },
    {
      id: "hinchada", peso: 2, when: (c) => c.jugando && c.local,
      texto: () => "La hinchada canta tu nombre por primera vez en la temporada.",
      opts: [
        { txt: "Saludar a la tribuna", key: null, base: 1, ok: { fama: 2, mor: 6, txt: "Levantaste la mano y explotó el sector norte." } },
        { txt: "Seguir concentrado", key: null, base: 1, ok: { conf: 3, men: 0.3, txt: "Ni te inmutaste. Al técnico le encantó." } },
      ],
    },
    {
      id: "lesion_leve", peso: 2, when: (c) => c.jugando && c.min > 55 && c.molestia,
      texto: () => "Sientes un pinchazo atrás del muslo. Puedes seguir, pero lo sientes.",
      opts: [
        { txt: "Pedir el cambio", key: null, base: 1, ok: { salir: 1, conf: -2, txt: "Saliste a tiempo. Nada grave." } },
        { txt: "Aguantar los últimos minutos", key: "fis", base: 0.5, w: 0.45, ok: { conf: 6, mor: 4, txt: "Aguantaste. El técnico te lo va a devolver." }, mal: { lesion: 4, conf: -3, mor: -10, txt: "Se rompió. Cuatro semanas mirando desde arriba." } },
      ],
    },
    {
      id: "clasico", peso: 3, when: (c) => c.jugando && c.clasico,
      texto: () => "Clásico. El rival te está buscando desde el primer minuto.",
      opts: [
        { txt: "Devolvérsela con juego", key: "reg", base: 0.5, w: 0.4, ok: { gol: 1, fama: 3, mor: 8, conf: 6, txt: "Lo hiciste bailar y la clavaste. Silencio en la visita." }, mal: { conf: -4, txt: "Te comieron a patadas toda la tarde." } },
        { txt: "Entrar fuerte una vez para marcar territorio", key: "fis", base: 0.55, w: 0.35, ok: { conf: 5, quimica: 6, fama: 1.5, txt: "Entrada limpia y dura. El vestuario te adoptó." }, mal: { amarilla: 1, conf: -4, txt: "Amarilla a los diez. Vas a jugar toda la tarde con miedo." } },
        { txt: "Jugar tranquilo", key: null, base: 1, ok: { conf: 1, txt: "Partido correcto, sin épica." } },
      ],
    },
  ];

  /* ------------------------------------------------------ eventos de vida */
  const EVENTOS = [
    { id: "agente", peso: 2, texto: "Tu representante quiere renegociar su comisión.", opts: [
      { txt: "Aceptar (paga más, consigue mejores ofertas)", ef: { comision: 0.03, ofertas: 0.15 }, txtRes: "Ahora se lleva más, pero mueve el teléfono como loco." },
      { txt: "Que se quede como está", ef: {}, txtRes: "Se lo tomó mal. Va a mover menos el teléfono." },
      { txt: "Cambiar de representante", ef: { comision: -0.02, ofertas: -0.1 }, txtRes: "El nuevo cobra menos y conoce a menos gente." },
    ] },
    { id: "familia", peso: 2, texto: "Tu mamá te pide ayuda para arreglar la casa del barrio.", opts: [
      { txt: "Mandar plata (te cuesta, te hace bien)", ef: { plata: -30000, mor: 12, fama: 1 }, txtRes: "La casa quedó bonita. Duermes mejor." },
      { txt: "Después veo", ef: { mor: -8 }, txtRes: "Te quedaste pensando toda la semana." },
    ] },
    { id: "barrio", peso: 1, texto: "Tu club del potrero se está por quedar sin cancha.", opts: [
      { txt: "Comprarles la cancha", ef: { plata: -80000, fama: 5, mor: 10, dt: 3 }, txtRes: "Le pusieron tu nombre. Los chibolos entrenan ahí." },
      { txt: "Mandar chimpunes y camisetas", ef: { plata: -8000, fama: 1.5, mor: 4 }, txtRes: "Menos épico, igual de real." },
      { txt: "No es tu problema", ef: { fama: -1 }, txtRes: "En el barrio hablaron." },
    ] },
    { id: "prensa_mala", peso: 2, texto: "Un programa dice que estás fuera de peso y sin ganas.", opts: [
      { txt: "Responder en redes", ef: { fama: 3, mor: -3, escandalo: 0.1 }, txtRes: "Se hizo tendencia. No sabemos si es bueno." },
      { txt: "Callarte y entrenar doble", ef: { fis: 1.2, mor: -2, prof: 0.6 }, txtRes: "El silencio también contesta." },
      { txt: "Invitarlos a entrenar contigo", ef: { fama: 4, mor: 4 }, txtRes: "El panelista duró once minutos. Video viral." },
    ] },
    { id: "seleccion_amistoso", peso: 1, texto: "La selección juega un amistoso lejos y llegas con la carga justa.", opts: [
      { txt: "Ir igual", ef: { fis: -10, caps: 1, fama: 2, mor: 5 }, txtRes: "Jugaste 60 minutos del otro lado del mundo." },
      { txt: "Pedir permiso al club", ef: { fis: 6, mor: -4, sel: -8 }, txtRes: "El técnico de la selección tomó nota." },
    ] },
    { id: "coach_pelea", peso: 2, texto: "El técnico te sacó a los 60 y saliste renegando.", opts: [
      { txt: "Pedir disculpas al día siguiente", ef: { conf: 8, mor: -2 }, txtRes: "Lo arreglaron en la oficina. Vuelves al once." },
      { txt: "Mantener la postura", ef: { conf: -12, mor: 4, fama: 1.5 }, txtRes: "El vestuario se dividió. Tú duermes tranquilo." },
    ] },
    { id: "inversion_ofrecida", peso: 2, texto: "Un excompañero te ofrece meter plata en su negocio.", opts: [
      { txt: "Poner 50 mil", ef: { plata: -50000, apuesta: 1 }, txtRes: "Firmaste sin leer. Como todos." },
      { txt: "Pedirle los números primero", ef: { men: 0.5 }, txtRes: "Nunca te los mandó. Ahí tienes tu respuesta." },
    ] },
  ];

  /* ------------------------------------------------------------ DT: táctica */
  const FORMATIONS = {
    "4-4-2":   { lines: { POR: 1, DFC: 2, LAT: 2, MCD: 1, MC: 2, MCO: 0, EXT: 1, DC: 2 }, def: 1.06, med: 1.00, atk: 0.98 },
    "4-3-3":   { lines: { POR: 1, DFC: 2, LAT: 2, MCD: 1, MC: 2, MCO: 0, EXT: 2, DC: 1 }, def: 0.98, med: 1.02, atk: 1.08 },
    "4-2-3-1": { lines: { POR: 1, DFC: 2, LAT: 2, MCD: 2, MC: 0, MCO: 1, EXT: 2, DC: 1 }, def: 1.02, med: 1.08, atk: 1.00 },
    "3-5-2":   { lines: { POR: 1, DFC: 3, LAT: 2, MCD: 1, MC: 2, MCO: 0, EXT: 0, DC: 2 }, def: 1.00, med: 1.10, atk: 1.00 },
    "5-3-2":   { lines: { POR: 1, DFC: 3, LAT: 2, MCD: 1, MC: 2, MCO: 0, EXT: 0, DC: 2 }, def: 1.14, med: 0.98, atk: 0.92 },
  };

  const STYLES = {
    posesion:   { name: "Posesión", desc: "Tocar hasta que se abra. Ahoga al contragolpe.", gana: "contra", pierde: "presion" },
    presion:    { name: "Presión alta", desc: "Robar arriba. Rompe al que juega lento.", gana: "posesion", pierde: "contra" },
    contra:     { name: "Contragolpe", desc: "Esperar y salir. Castiga a quien se adelanta.", gana: "presion", pierde: "posesion" },
    directo:    { name: "Juego directo", desc: "Pelotazo y segunda pelota. Neutro, aguanta todo.", gana: null, pierde: null },
  };

  const MENTALITIES = [
    { id: "muy_def", name: "Muy defensivo", atk: 0.80, def: 1.20 },
    { id: "def",     name: "Defensivo",     atk: 0.90, def: 1.10 },
    { id: "equil",   name: "Equilibrado",   atk: 1.00, def: 1.00 },
    { id: "ofe",     name: "Ofensivo",      atk: 1.12, def: 0.91 },
    { id: "muy_ofe", name: "Muy ofensivo",  atk: 1.25, def: 0.80 },
  ];

  /* Preguntas de rueda de prensa (fase DT). */
  const PRENSA = [
    { q: "«Tres partidos sin ganar. ¿Está en riesgo su puesto?»", opts: [
      { txt: "«Confío en el plantel, los resultados van a venir»", vest: 4, dir: -1, hin: -1 },
      { txt: "«Si hay que irse, uno se va. Pero acá se trabaja»", vest: 1, dir: 3, hin: 2 },
      { txt: "«Pregúntele a los que arman el plantel»", vest: 6, dir: -8, hin: 3 },
    ] },
    { q: "«¿Por qué no juega el ídolo de la hinchada?»", opts: [
      { txt: "«Juega el que está mejor, sin nombres»", vest: 5, dir: 2, hin: -4 },
      { txt: "«Va a tener sus minutos, es importante para nosotros»", vest: 1, dir: 1, hin: 3 },
      { txt: "«Porque no rinde. Así de simple»", vest: -6, dir: 1, hin: -2 },
    ] },
    { q: "«El rival dijo que ustedes juegan feo»", opts: [
      { txt: "«Que hablen. Nosotros competimos»", vest: 3, dir: 1, hin: 2 },
      { txt: "«Lo respeto, pero el domingo se ve en la cancha»", vest: 2, dir: 2, hin: 4 },
      { txt: "«Feo es perder en casa, como ellos»", vest: 4, dir: -2, hin: 6 },
    ] },
    { q: "«¿Le alcanza este plantel para pelear el título?»", opts: [
      { txt: "«Con estos jugadores me sobra»", vest: 7, dir: 3, hin: 3 },
      { txt: "«Faltan dos o tres nombres, la dirigencia lo sabe»", vest: 2, dir: -6, hin: 1 },
      { txt: "«Vamos partido a partido»", vest: 0, dir: 0, hin: -2 },
    ] },
  ];

  const OBJETIVOS = [
    { id: "salvarse",  txt: "No descender", pos: 10 },
    { id: "mitad",     txt: "Terminar en la mitad de arriba", pos: 6 },
    { id: "copa_int",  txt: "Clasificar a la copa internacional", pos: 4 },
    { id: "pelear",    txt: "Pelear el campeonato", pos: 2 },
    { id: "campeon",   txt: "Salir campeón", pos: 1 },
  ];

  const LESIONES = [
    { n: "Golpe en el tobillo", w: [1, 2] }, { n: "Desgarro leve", w: [2, 4] },
    { n: "Esguince de rodilla", w: [4, 8] }, { n: "Fractura de peroné", w: [10, 18] },
    { n: "Pubalgia", w: [3, 7] }, { n: "Rotura de ligamentos", w: [22, 38] },
    { n: "Sobrecarga muscular", w: [1, 2] }, { n: "Luxación de hombro", w: [5, 9] },
  ];

  const Exported = {
    LEAGUES, CLUBS, PAISES, CONTINENTALES, POSITIONS, POS_LIST, SHARE, SQUAD_SHAPE, NAMES, CITY_NICK,
    SPONSORS, INVESTMENTS, ACTIONS, LIFESTYLE, MOMENTS, EVENTOS,
    FORMATIONS, STYLES, MENTALITIES, PRENSA, OBJETIVOS, LESIONES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Exported;
  else global.PotreroData = Exported;
})(typeof window !== "undefined" ? window : globalThis);
