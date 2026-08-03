"use strict";
/* POTRERO — identidad de los clubes.
 *
 * En vez de un escudo (que es marca registrada de cada club y no se puede
 * reproducir), cada equipo se reconoce por su camiseta: colores y patrón
 * reales, dibujados como SVG vectorial suave. Un hincha reconoce las rayas
 * blaugrana o la banda amarilla mucho antes que un monograma, y la camiseta
 * escala igual de bien a 18px en una tabla que a 80px en la ficha.
 *
 * El kit de cada club es un dato autoral (`kit` en data.js), no un hash: los
 * colores son los de verdad. */
(function (global) {
  /* Silueta de camiseta: hombros, mangas, cuerpo apenas entallado y ruedo. */
  const CAMISA =
    "M18 9 L26.5 5.5 Q32 11.5 37.5 5.5 L46 9 L60.5 20.5 L51.5 31.5 L49.6 27.8 " +
    "L51 58 Q32 61.5 13 58 L14.4 27.8 L12.5 31.5 L3.5 20.5 Z";
  /* Solo las mangas, para los clubes que las llevan de otro color. */
  const MANGA_IZQ = "M18 9 L14.4 27.8 L12.5 31.5 L3.5 20.5 Z";
  const MANGA_DER = "M46 9 L49.6 27.8 L51.5 31.5 L60.5 20.5 Z";
  const W = 64, H = 64;

  const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const hex = (a) => "#" + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  const lum = (c) => { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const mezcla = (a, b, t) => {
    const A = rgb(a), B = rgb(b);
    return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  };

  /* El relleno según el patrón. Todo se recorta contra la silueta. */
  function relleno(kit, id) {
    const c1 = kit.c1, c2 = kit.c2 || kit.c1;
    const p = [];
    const fondo = (c) => p.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${c}"/>`);
    switch (kit.pat) {
      case "rayas": {                       /* rayas verticales, tipo Juventus */
        const n = kit.n || 7, w = W / n;
        fondo(c1);
        for (let i = 1; i < n; i += 2) p.push(`<rect x="${i * w}" y="0" width="${w}" height="${H}" fill="${c2}"/>`);
        break;
      }
      case "aros": {                        /* aros horizontales, tipo Flamengo */
        const h = kit.h || 9;
        fondo(c1);
        for (let y = h; y < H; y += h * 2) p.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${c2}"/>`);
        break;
      }
      case "banda":                         /* franja horizontal en el pecho, tipo Boca */
        fondo(c1);
        p.push(`<rect x="0" y="${kit.y || 26}" width="${W}" height="${kit.h || 12}" fill="${c2}"/>`);
        break;
      case "sash":                          /* banda cruzada, tipo River */
        fondo(c1);
        p.push(`<rect x="${32 - (kit.h || 13) / 2}" y="-45" width="${kit.h || 13}" height="155" fill="${c2}" transform="rotate(${kit.ang || -35} 32 32)"/>`);
        break;
      case "centro":                        /* franja vertical al medio, tipo Ajax */
        fondo(c1);
        p.push(`<rect x="${32 - (kit.h || 15) / 2}" y="0" width="${kit.h || 15}" height="${H}" fill="${c2}"/>`);
        break;
      case "mitades":                       /* mitad y mitad, tipo Feyenoord */
        fondo(c1);
        p.push(`<rect x="32" y="0" width="32" height="${H}" fill="${c2}"/>`);
        break;
      default:                              /* liso */
        fondo(c1);
    }
    return `<g clip-path="url(#c${id})">${p.join("")}</g>`;
  }

  const cache = new Map();
  let seq = 0;

  /* svg(club, clase) → la camiseta del club lista para inyectar. */
  function svg(club, clase) {
    const kit = club.kit || { pat: "liso", c1: (club.colors && club.colors[0]) || "#888", c2: (club.colors && club.colors[1]) || "#fff" };
    const k = JSON.stringify(kit) + "|" + (clase || "");
    if (cache.has(k)) return cache.get(k);
    const id = ++seq;
    /* Contorno: una versión oscurecida del color dominante, salvo que la
     * camiseta ya sea oscura; así la silueta se recorta sobre cualquier fondo. */
    const base = kit.c1;
    const borde = lum(base) < 0.22 ? mezcla(base, "#ffffff", 0.28) : mezcla(base, "#000000", 0.42);
    const trim = kit.trim || borde;
    const mangas = kit.mangas
      ? `<path d="${MANGA_IZQ}" fill="${kit.mangas}"/><path d="${MANGA_DER}" fill="${kit.mangas}"/>`
      : "";
    const out =
      `<svg viewBox="0 0 ${W} ${H}" class="camiseta ${clase || ""}" role="img" ` +
      `aria-label="Camiseta de ${String(club.name).replace(/"/g, "")}">` +
      `<defs><clipPath id="c${id}"><path d="${CAMISA}"/></clipPath></defs>` +
      relleno(kit, id) + mangas +
      /* Cuello y puños en el color de detalle, y el contorno por encima. */
      `<path d="M26.5 5.5 Q32 11.5 37.5 5.5" fill="none" stroke="${trim}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="${CAMISA}" fill="none" stroke="${borde}" stroke-width="2" stroke-linejoin="round"/>` +
      `</svg>`;
    cache.set(k, out);
    return out;
  }

  global.PotreroCamisetas = { svg };
})(typeof window !== "undefined" ? window : globalThis);
