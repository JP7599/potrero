"use strict";
/* POTRERO — momentos de partido escritos por Claude.
 *
 * La regla de esta capa: **Claude escribe la ficción, el motor se queda con la
 * matemática**. El modelo devuelve la situación y las opciones en texto, pero
 * las consecuencias son un enum cerrado y las probabilidades salen de una
 * tabla de acá — no de lo que se le ocurra al modelo. Así el partido sigue
 * siendo el mismo juego balanceado de siempre y lo único que cambia es que
 * dejan de repetirse el árbitro y el compañero que no la pasa.
 *
 * La API key vive en el localStorage del navegador de quien juega y no sale de
 * ahí salvo a api.anthropic.com. */
(function (global) {
  const MODELO = "claude-opus-5";

  /* Consecuencias posibles. El modelo elige una de estas etiquetas y el motor
   * decide cuánto pesa: si el modelo pudiera poner números, se rompería el
   * balance en dos partidos. */
  const EFECTOS = {
    gol:              { gol: 1, mor: 6, conf: 6, fama: 1.5 },
    asistencia:       { asi: 1, mor: 4, conf: 4 },
    atajada:          { atajada: 1, conf: 9, mor: 8, fama: 2 },
    gol_en_contra:    { conGol: 1, conf: -7, mor: -5 },
    amarilla:         { amarilla: 1, mor: -3 },
    roja:             { roja: 1, conf: -14, mor: -14 },
    lesion:           { lesion: 4, conf: -3, mor: -10 },
    salir_cambiado:   { salir: 1, conf: -2 },
    nada:             {},
    animo_arriba:     { mor: 6, conf: 2 },
    animo_abajo:      { mor: -6, conf: -3 },
    confianza_arriba: { conf: 6 },
    confianza_abajo:  { conf: -8 },
    fama:             { fama: 3, mor: 2 },
    vestuario_bien:   { quimica: 5, mor: 3 },
    vestuario_mal:    { quimica: -6, mor: -4 },
  };
  const NOMBRES_EFECTO = Object.keys(EFECTOS);

  /* Dificultad declarada → probabilidad base. El atributo del jugador la
   * corrige después, igual que en los momentos escritos a mano. */
  const DIFICULTAD = { segura: 1, facil: 0.68, media: 0.5, dificil: 0.3 };
  const ATRIBUTOS = ["rit", "tir", "pas", "reg", "def", "fis", "men", "ninguno"];

  /* Esquema de salida. La API lo hace cumplir: no hay que parsear a mano ni
   * rezar para que el modelo devuelva JSON válido. */
  const ESQUEMA = {
    type: "object",
    additionalProperties: false,
    required: ["jugadas"],
    properties: {
      jugadas: {
        type: "array",
        description: "Una entrada por cada minuto que te pido, en el mismo orden.",
        items: {
    type: "object",
    additionalProperties: false,
    required: ["texto", "opciones"],
    properties: {
      texto: { type: "string", description: "La situación, en segunda persona, dos frases como máximo." },
      opciones: {
        type: "array",
        description: "Entre dos y tres opciones distintas entre sí.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["txt", "atributo", "dificultad", "bien", "mal"],
          properties: {
            txt: { type: "string", description: "Qué hace el jugador. Frase corta, en infinitivo." },
            atributo: { type: "string", enum: ATRIBUTOS, description: "Qué atributo decide si sale bien. 'ninguno' si no depende de él." },
            dificultad: { type: "string", enum: Object.keys(DIFICULTAD) },
            bien: {
              type: "object", additionalProperties: false, required: ["txt", "efecto"],
              properties: {
                txt: { type: "string", description: "Qué pasa si sale bien, una frase." },
                efecto: { type: "string", enum: NOMBRES_EFECTO },
              },
            },
            mal: {
              type: "object", additionalProperties: false, required: ["txt", "efecto"],
              properties: {
                txt: { type: "string", description: "Qué pasa si sale mal, una frase." },
                efecto: { type: "string", enum: NOMBRES_EFECTO },
              },
            },
          },
        },
      },
    },
        },
      },
    },
  };

  const SISTEMA = `Escribes los momentos de un juego de modo carrera de fútbol.

Te doy el contexto real de un partido y devuelves las situaciones que lo van a
parar, una por cada minuto que te pido.

Voz: español peruano, tuteo, segunda persona ("te queda el rebote", "el central
te vio venir"). Directo y con calle, sin floro ni épica de relator. Nada de
argentinismos (nada de "vos", "tenés", "pibe").

Reglas:
- La situación tiene que salir del contexto que te doy: el minuto, el marcador,
  el rival, tu puesto, la competencia y tu momento personal. Un empate agónico
  en la final no se juega igual que un 4-0 en la fecha 3.
- Dos o tres opciones que sean decisiones de verdad distintas, no la misma con
  otras palabras. Al menos una tiene que poder salir mal.
- El atributo que eliges tiene que ser el que de verdad decide esa jugada.
- No repitas las situaciones que te paso en "evitar": ya salieron y aburren.
- Un portero no cabecea al área rival y un central no define de zurda al ángulo:
  respeta el puesto.
- Sin markdown, sin comillas decorativas, sin emojis.

Te pido varias jugadas de un mismo partido y las escribes como una secuencia:
la segunda pasa después de la primera y el partido ya avanzó.

Sobre el minuto y el marcador:
- No escribas el número del minuto en el texto: la pantalla ya lo muestra arriba.
- Si te paso un marcador, es el de antes de estas jugadas y puede cambiar. Úsalo
  para el clima del partido, no como un dato fijo ("vienen abajo y hay que ir a
  buscarlo" sí; "van 1-0" no).`;

  /* ------------------------------------------------------------- la llamada */
  async function pedir(ctx, key, fetchImpl) {
    if (!key) throw new Error("Falta la API key de Anthropic.");
    const doFetch = fetchImpl || global.fetch;
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        /* Sin esta cabecera el navegador no puede hablar con la API. */
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        /* Sin razonamiento y con esfuerzo bajo: esto tiene que llegar mientras
         * el jugador todavía está mirando la pantalla, no dentro de un minuto. */
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
        system: SISTEMA,
        messages: [{ role: "user", content: JSON.stringify(ctx) }],
      }),
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      throw new Error(mensajeDeError(res.status, cuerpo));
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("El modelo no quiso responder a esta jugada.");
    const bloque = (data.content || []).find((b) => b.type === "text");
    if (!bloque) throw new Error("La respuesta vino vacía.");
    const bruto = JSON.parse(bloque.text);
    return (bruto.jugadas || []).map(normalizar);
  }

  function mensajeDeError(status, cuerpo) {
    if (status === 401) return "La API key no es válida. Revísala en Más → Momentos con IA.";
    if (status === 429) return "Te pasaste del límite de la API por ahora. Espera un momento.";
    if (status === 400 && /credit|billing/i.test(cuerpo)) return "La cuenta de Anthropic no tiene saldo.";
    if (status >= 500) return "La API de Anthropic está caída o saturada.";
    return `La API respondió ${status}.`;
  }

  /* Lo que llega del modelo se traduce a la forma que el motor ya sabe
   * resolver, y todo lo que no esté en la lista se descarta. */
  function normalizar(bruto) {
    const opciones = (bruto.opciones || []).slice(0, 3).map((o) => ({
      txt: String(o.txt || "").slice(0, 90),
      key: o.atributo && o.atributo !== "ninguno" && ATRIBUTOS.includes(o.atributo) ? o.atributo : null,
      base: DIFICULTAD[o.dificultad] != null ? DIFICULTAD[o.dificultad] : 0.5,
      w: 0.42,
      ok: efecto(o.bien),
      mal: efecto(o.mal),
    }));
    if (opciones.length < 2) throw new Error("El modelo devolvió una jugada con menos de dos opciones.");
    /* Una opción "segura" no puede fallar: si el modelo le puso consecuencia
     * mala, se ignora, porque el motor nunca va a tirar el dado. */
    for (const o of opciones) if (o.base >= 1) o.mal = { txt: "", ...EFECTOS.nada };
    return { texto: String(bruto.texto || "").slice(0, 260), opts: opciones, ia: true };
  }

  function efecto(rama) {
    const nombre = rama && NOMBRES_EFECTO.includes(rama.efecto) ? rama.efecto : "nada";
    return { txt: String((rama && rama.txt) || "").slice(0, 140), ...EFECTOS[nombre] };
  }

  global.PotreroMomentos = { pedir, normalizar, ESQUEMA, EFECTOS, DIFICULTAD, MODELO };
  if (typeof module !== "undefined" && module.exports) module.exports = global.PotreroMomentos;
})(typeof window !== "undefined" ? window : globalThis);
