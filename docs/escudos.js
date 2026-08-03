"use strict";
/* POTRERO — escudos.
 *
 * Cada club tiene su escudo de pixel art sobre una grilla de 16x18, armado a
 * partir del nombre y de los dos colores del club. Mismo club, mismo escudo,
 * siempre: no hay azar de partida acá, solo un hash del nombre.
 *
 * Todo se dibuja con rects de 1 pixel de alto (los horizontales seguidos se
 * fusionan), así que el SVG escala sin perder el borde duro. Sin imágenes,
 * sin red, sin fuentes externas. */
(function (global) {
  const W = 16, H = 18;

  /* Tipografía de 3x5 para las iniciales del club. M, N y W no entran en tres
   * pixeles sin confundirse entre ellas, así que esas tres son de cuatro: el
   * ancho de cada letra se lee de la propia grilla. */
  const F3 = {
    M: "1001,1111,1111,1001,1001", N: "1001,1101,1011,1001,1001", W: "1001,1001,1111,1111,0110",
    A: "010,101,111,101,101", B: "110,101,110,101,110", C: "011,100,100,100,011",
    D: "110,101,101,101,110", E: "111,100,110,100,111", F: "111,100,110,100,100",
    G: "011,100,101,101,011", H: "101,101,111,101,101", I: "111,010,010,010,111",
    J: "001,001,001,101,010", K: "101,101,110,101,101", L: "100,100,100,100,111",
    O: "010,101,101,101,010",
    P: "110,101,110,100,100", Q: "010,101,101,111,011", R: "110,101,110,101,101",
    S: "011,100,010,001,110", T: "111,010,010,010,010", U: "101,101,101,101,011",
    V: "101,101,101,101,010", X: "101,101,010,101,101",
    Y: "101,101,010,010,010", Z: "111,001,010,100,111",
    "0": "111,101,101,101,111", "1": "010,110,010,010,111", "2": "110,001,010,100,111",
    "3": "110,001,010,001,110", "4": "101,101,111,001,001", "5": "111,100,110,001,110",
    "6": "011,100,111,101,111", "7": "111,001,010,010,010", "8": "111,101,111,101,111",
    "9": "111,101,111,001,110",
  };

  /* Tipografía de 5x7 para el logotipo: solo las letras de POTRERO. */
  const F5 = {
    P: "11110,10001,10001,11110,10000,10000,10000",
    O: "01110,10001,10001,10001,10001,10001,01110",
    T: "11111,00100,00100,00100,00100,00100,00100",
    R: "11110,10001,10001,11110,10100,10010,10001",
    E: "11111,10000,10000,11110,10000,10000,11111",
    A: "01110,10001,10001,11111,10001,10001,10001",
    D: "11110,10001,10001,10001,10001,10001,11110",
    C: "01110,10001,10000,10000,10000,10001,01110",
    N: "10001,11001,10101,10101,10011,10001,10001",
    S: "01111,10000,10000,01110,00001,00001,11110",
  };

  /* ------------------------------------------------------------- utilidades */
  const hash = (t) => {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const hex = ([r, g, b]) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  const lum = (c) => { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const mezcla = (a, b, t) => {
    const A = rgb(a), B = rgb(b);
    return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  };
  const TINTA = "#0a0d14", PAPEL = "#eef3ff";
  /* El color que más contraste contra el de fondo: negro sobre camiseta clara,
   * blanco sobre camiseta oscura. */
  const contra = (c) => (lum(c) > 0.55 ? TINTA : PAPEL);
  /* Dos colores demasiado parecidos hacen ilegibles las iniciales. */
  const separados = (a, b) => Math.abs(lum(a) - lum(b)) > 0.28;

  /* Iniciales: una por palabra grande, o las dos primeras letras si es una sola. */
  const CHICAS = new Set(["de", "del", "la", "las", "los", "el", "y", "fc", "cd", "ac"]);
  function iniciales(nombre) {
    const limpio = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const palabras = limpio.split(/[^A-Z0-9]+/).filter((p) => p && !CHICAS.has(p.toLowerCase()));
    if (!palabras.length) return "FC";
    if (palabras.length === 1) return palabras[0].slice(0, 2);
    return palabras.slice(0, 3).map((p) => p[0]).join("");
  }

  /* -------------------------------------------------------------- la forma */
  function mascara(forma) {
    const m = [];
    for (let y = 0; y < H; y++) {
      let ins = 0;
      if (forma === 0) {               /* escudo clásico: recto arriba, punta redonda */
        const h0 = 11;
        ins = y < h0 ? 0 : Math.round(Math.pow((y - h0 + 1) / (H - h0), 1.5) * 7);
      } else if (forma === 1) {        /* redondo */
        const cy = (H - 1) / 2, ry = H / 2, rx = W / 2;
        const d = 1 - Math.pow((y - cy) / ry, 2);
        ins = Math.round(rx - rx * Math.sqrt(Math.max(0, d)));
      } else if (forma === 2) {        /* punta larga, tipo escudo italiano */
        const h0 = 8;
        ins = y < h0 ? 0 : Math.round(((y - h0 + 1) / (H - h0)) * 7.5);
      } else {                         /* banderín hexagonal */
        ins = y < 2 ? 2 - y : y > H - 4 ? (y - (H - 4)) * 2 : 0;
      }
      ins = Math.max(0, Math.min(7, ins));
      m.push([ins, W - 1 - ins]);
    }
    return m;
  }

  /* ------------------------------------------------------------- el relleno */
  function patron(pat, x, y, c1, c2) {
    switch (pat) {
      case 1: return Math.floor(x / 3) % 2 ? c2 : c1;                  /* bandas verticales */
      case 2: return x < W / 2 ? c1 : c2;                              /* mitades */
      case 3: return (x + y) % 9 < 4 ? c2 : c1;                        /* banda diagonal */
      case 4: return Math.floor(y / 3) % 2 ? c2 : c1;                  /* aros */
      case 5: return (x < W / 2) !== (y < H / 2) ? c2 : c1;            /* cuartos */
      case 6: return Math.abs(x - (W - 1) / 2) > y - 1 ? c2 : c1;      /* punta */
      default: return c1;                                              /* liso */
    }
  }

  /* --------------------------------------------------------------- dibujo */
  function grilla(nombre, c1, c2) {
    const h = hash(nombre);
    const forma = h % 4;
    const pat = (h >> 3) % 7;
    const emblema = (h >> 7) % 2;
    const m = mascara(forma);
    const g = [];
    for (let y = 0; y < H; y++) {
      const fila = new Array(W).fill(null);
      const [a, b] = m[y];
      for (let x = a; x <= b; x++) fila[x] = patron(pat, x, y, c1, c2);
      g.push(fila);
    }

    /* Iniciales, siempre sobre un fondo que las deje leer. */
    const txt = iniciales(nombre);
    const glifos = txt.split("").map((ch) => (F3[ch] || F3.O).split(","));
    const anchos = glifos.map((gl) => gl[0].length);
    const ancho = anchos.reduce((a, b) => a + b, 0) + glifos.length - 1;
    const x0 = Math.round((W - ancho) / 2);
    const y0 = 6;
    const fondo = contra(c1);
    const letra = separados(c1, fondo) ? c1 : separados(c2, fondo) ? c2 : mezcla(c1, TINTA, 0.5);

    if (emblema === 0) {
      /* Banda horizontal de lado a lado. */
      for (let y = y0 - 1; y <= y0 + 5; y++) {
        const [a, b] = m[y];
        for (let x = a; x <= b; x++) g[y][x] = fondo;
      }
    } else {
      /* Bloque justo detrás de las letras. */
      for (let y = y0 - 1; y <= y0 + 5; y++) {
        for (let x = x0 - 1; x < x0 + ancho + 1; x++) {
          const [a, b] = m[y];
          if (x >= a && x <= b) g[y][x] = fondo;
        }
      }
    }
    let cx = x0;
    glifos.forEach((gl, i) => {
      for (let fy = 0; fy < 5; fy++) {
        for (let fx = 0; fx < anchos[i]; fx++) {
          if (gl[fy][fx] === "1") {
            const x = cx + fx, y = y0 + fy;
            if (x >= 0 && x < W && g[y][x] != null) g[y][x] = letra;
          }
        }
      }
      cx += anchos[i] + 1;
    });

    /* Contorno: tinta si el escudo es claro, papel si es oscuro. Así la silueta
     * se recorta igual contra el fondo oscuro de la pantalla. */
    const borde = lum(c1) < 0.35 ? mezcla(PAPEL, c1, 0.35) : TINTA;
    const dentro = (x, y) => x >= 0 && x < W && y >= 0 && y < H && g[y][x] != null;
    const orig = g.map((f) => f.slice());
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (orig[y][x] == null) continue;
        if (!dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1)) g[y][x] = borde;
      }
    }
    return g;
  }

  /* Fusiona los pixeles seguidos del mismo color en un solo rect. */
  function aSvg(g, ancho, alto, extra) {
    let d = "";
    for (let y = 0; y < g.length; y++) {
      let x = 0;
      while (x < g[y].length) {
        const c = g[y][x];
        if (c == null) { x++; continue; }
        let n = 1;
        while (x + n < g[y].length && g[y][x + n] === c) n++;
        d += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
        x += n;
      }
    }
    return `<svg viewBox="0 0 ${ancho} ${alto}" shape-rendering="crispEdges" ${extra || ""}>${d}</svg>`;
  }

  const cache = new Map();
  /* svg(club) → escudo del club listo para inyectar. */
  function svg(club, clase) {
    const k = club.name + "|" + club.colors[0] + "|" + club.colors[1] + "|" + (clase || "");
    if (cache.has(k)) return cache.get(k);
    const out = aSvg(grilla(club.name, club.colors[0], club.colors[1]), W, H,
      `class="escudo ${clase || ""}" role="img" aria-label="Escudo de ${club.name.replace(/"/g, "")}"`);
    cache.set(k, out);
    return out;
  }

  /* Logotipo POTRERO en pixeles de 5x7, del mismo taller que los escudos. */
  function texto5(txt, colores) {
    const glifos = txt.split("").map((ch) => (F5[ch] || F5.O).split(","));
    const ancho = glifos.length * 6 - 1, alto = 7;
    const g = [];
    for (let y = 0; y < alto; y++) g.push(new Array(ancho).fill(null));
    glifos.forEach((gl, i) => {
      for (let y = 0; y < alto; y++) {
        for (let x = 0; x < 5; x++) {
          if (gl[y][x] === "1") g[y][i * 6 + x] = colores[i % colores.length];
        }
      }
    });
    return { g, ancho, alto };
  }
  function logo(colores) {
    const { g, ancho, alto } = texto5("POTRERO", colores || ["#f7e04b"]);
    /* Sombra dura un pixel abajo a la derecha, como los títulos de arcade. */
    const som = [];
    for (let y = 0; y < alto + 1; y++) som.push(new Array(ancho + 1).fill(null));
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (g[y][x]) som[y + 1][x + 1] = "#111827";
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (g[y][x]) som[y][x] = g[y][x];
    return aSvg(som, ancho + 1, alto + 1, 'class="logo-svg" role="img" aria-label="POTRERO"');
  }

  global.PotreroEscudos = { svg, logo, iniciales, grilla };
})(typeof window !== "undefined" ? window : globalThis);
