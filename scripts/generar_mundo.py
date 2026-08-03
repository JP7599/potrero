#!/usr/bin/env python3
"""Arma docs/mundo.js: la pirámide de cada país, con clubes reales.

Primera división: curada a mano (orden, prestigio y camiseta reales).
Segunda: el resto de los clubes reales del país que trae openfootball (CC0).
Amateur: no se guarda, la genera el juego con las ciudades de tu país cuando
eliges nacionalidad — es de donde sales y son clubes de barrio inventados.
"""
import json, re, sys, unicodedata
from curadas import CURADAS, TORNEOS, CONTINENTALES, FUERZA

CLUBES = json.load(open("clubes.json", encoding="utf-8"))
POR_LIGA = 18

# Paleta para los clubes sin camiseta autoral: colores de fútbol de verdad,
# nada de pasteles raros.
PAL = ["#c8102e", "#1b3f8f", "#0a8f4a", "#f5d200", "#111111", "#ffffff",
       "#5aa9e6", "#f5820a", "#7b1b2b", "#7a3fb5", "#0a6b3d", "#0b1f4b"]
PATS = ["liso", "liso", "liso", "rayas", "rayas", "banda", "sash", "aros", "mitades", "centro"]

# Tercera categoría: nombre real donde lo hay, genérico donde no.
AMATEUR = {"pe": "Copa Perú", "ar": "Torneo Federal", "eng": "National League",
           "es": "Primera Federación", "br": "Série C", "it": "Serie C",
           "de": "3. Liga", "fr": "National", "mx": "Liga Premier",
           "co": "Primera C", "cl": "Segunda División Profesional",
           "uy": "Segunda División Amateur", "py": "Primera B", "bo": "Copa Simón Bolívar",
           "ec": "Segunda Categoría", "ve": "Tercera División", "us": "MLS Next Pro",
           "pt": "Liga 3", "nl": "Tweede Divisie", "be": "Nationale 1",
           "tr": "2. Lig", "sco": "Scottish League One", "gr": "Gamma Ethniki",
           "at": "Regionalliga", "ch": "Promotion League", "dk": "2. Division",
           "se": "Ettan", "no": "PostNord-ligaen", "pl": "II liga", "cz": "MSFL",
           "ru": "Segunda División", "ua": "Druha Liha", "hr": "Druga NL",
           "rs": "Prva Liga Srbije", "ca": "League1 Canada", "cr": "Liga de Ascenso"}
PREFIJOS = ["Deportivo", "Unión", "Atlético", "Juventud", "Sport", "Real", "Defensor",
            "Cultural", "Racing", "Estrella", "Independiente", "Municipal"]


def h32(t):
    x = 2166136261
    for ch in t:
        x ^= ord(ch)
        x = (x * 16777619) & 0xFFFFFFFF
    return x


def kit_auto(nombre):
    """Camiseta estable derivada del nombre: mismo club, mismos colores."""
    n = h32(nombre)
    pat = PATS[n % len(PATS)]
    c1 = PAL[(n >> 4) % len(PAL)]
    c2 = PAL[(n >> 9) % len(PAL)]
    if c1 == c2:
        c2 = "#ffffff" if c1 != "#ffffff" else "#111111"
    k = [pat, c1, c2]
    if pat == "rayas":
        k.append("n=%d" % (7 + 2 * ((n >> 14) % 2)))
    if pat == "liso":
        k.append("trim=" + c2)
    return k


def parse_curada(linea):
    p = linea.split("|")
    nombre, prest, pat, c1, c2 = p[0], int(p[1]), p[2], p[3], p[4]
    return nombre, prest, [pat, c1, c2] + p[5:]


def clave(n):
    s = unicodedata.normalize("NFD", n.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\b(club|deportivo|dep|cd|ca|fc|sc|ac|fbc|atletico|asociacion|de|del|la|el|los)\b", " ", s)
    return re.sub(r"\W", "", s)


def mismo_club(k, usados):
    """El dataset y la lista curada no llaman igual al mismo club: «FBC Melgar»
    y «Melgar», «Club Universitario de Deportes» y «Universitario». Si una clave
    contiene a la otra y no es un fragmento minúsculo, es el mismo equipo."""
    if k in usados:
        return True
    for u in usados:
        if len(k) >= 5 and len(u) >= 5 and (k in u or u in k):
            return True
    return False


def prestigio_auto(nivel, i, total):
    """Prestigio para clubes sin valor autoral: banda por nivel de liga."""
    techo = 30 + nivel * 7
    piso = max(6, techo - 22)
    return round(techo - (techo - piso) * (i / max(1, total - 1)))


def main():
    ligas, clubs, paises = [], [], []
    for cod, info in CLUBES.items():
        nivel = FUERZA.get(cod, 4)
        torneos = TORNEOS.get(cod)
        if not torneos:
            continue
        primera_n, copa_n, segunda_n = torneos
        # Las ciudades del dataset traen aclaraciones entre paréntesis que
        # quedan mal dentro del nombre de un club inventado.
        ciudades = sorted({re.sub(r"\s*\([^)]*\)", "", c["c"]).strip()
                           for c in info["clubes"] if c["c"]} - {""})
        ciudad_de = {}
        for c in info["clubes"]:
            for nombre_alt in [c["n"]] + c.get("a", []):
                ciudad_de.setdefault(clave(nombre_alt), c["c"])
        usados = set()

        # --- primera división
        curada = CURADAS.get(cod)
        filas1 = []
        if curada:
            for linea in curada[:POR_LIGA]:
                n, prest, kit = parse_curada(linea)
                k = clave(n)
                usados.add(k)
                ciudad = ciudad_de.get(k, "")
                if not ciudad:
                    for kk, cc in ciudad_de.items():
                        if len(k) >= 5 and (k in kk or kk in k):
                            ciudad = cc
                            break
                filas1.append((n, ciudad, prest, kit))
        else:
            for i, c in enumerate(info["clubes"][:POR_LIGA]):
                usados.add(clave(c["n"]))
                filas1.append((c["n"], c["c"], prestigio_auto(nivel, i, POR_LIGA), kit_auto(c["n"])))

        # --- segunda: los clubes reales que sobraron, completando si faltan
        resto = []
        for c in info["clubes"]:
            claves = [clave(x) for x in [c["n"]] + c.get("a", [])]
            if any(mismo_club(k, usados) for k in claves):
                continue
            usados.add(claves[0])
            resto.append(c)
        filas2 = []
        for i, c in enumerate(resto[:POR_LIGA]):
            filas2.append((c["n"], c["c"], prestigio_auto(nivel - 2, i, POR_LIGA), kit_auto(c["n"])))
        j = 0
        # El corte por intentos evita que un país con pocas ciudades deje el
        # generador dando vueltas para siempre buscando nombres nuevos.
        while len(filas2) < POR_LIGA and ciudades and j < 4000:
            ciudad = ciudades[j % len(ciudades)]
            # 7 y 12 son coprimos: el prefijo cambia en cada club en vez de
            # dejar una fila entera de «Independiente Tal».
            pref = PREFIJOS[(j * 7 + h32(cod)) % len(PREFIJOS)]
            sufijo = "" if j < len(ciudades) * len(PREFIJOS) else " %d" % (j // 40)
            nombre = "%s %s%s" % (pref, ciudad, sufijo)
            j += 1
            if clave(nombre) in usados:
                continue
            usados.add(clave(nombre))
            filas2.append((nombre, ciudad, prestigio_auto(nivel - 2, len(filas2), POR_LIGA), kit_auto(nombre)))

        id1, id2, id3 = cod + "1", cod + "2", cod + "3"
        cont = CONTINENTALES.get(info["conf"])
        base = {"pais": cod, "tax": None, "region": info["conf"]}
        ligas.append(dict(base, id=id1, name=primera_n, tier=nivel, cup=copa_n, cont=info["conf"], sube=None, baja=id2, div=1))
        ligas.append(dict(base, id=id2, name=segunda_n, tier=max(0, nivel - 2), cup=copa_n, cont=None, sube=id1, baja=id3, div=2))
        ligas.append(dict(base, id=id3, name=AMATEUR.get(cod, "Liga Regional"), tier=max(0, nivel - 4), cup=None, cont=None, sube=id2, baja=None, div=3))

        for n, ciu, pr, kit in filas1:
            clubs.append([id1, n, ciu, pr] + kit)
        for n, ciu, pr, kit in filas2:
            clubs.append([id2, n, ciu, pr] + kit)

        paises.append({"cod": cod, "nombre": info["nombre"], "conf": info["conf"],
                       "fuerza": nivel, "ciudades": ciudades[:40], "cont": cont})

    js = ["\"use strict\";",
          "/* POTRERO — el mundo.",
          " *",
          " * Generado por scripts/generar_mundo.py a partir de openfootball/clubs",
          " * (dominio público, CC0) más las primeras divisiones curadas a mano.",
          " * Los clubes de la tercera categoría no viven acá: los arma el juego con",
          " * las ciudades de tu país cuando eliges nacionalidad, porque son de barrio",
          " * y cambian en cada carrera. */",
          "(function (global) {",
          "  const PAISES = " + json.dumps(paises, ensure_ascii=False) + ";",
          "  const LIGAS = " + json.dumps(ligas, ensure_ascii=False) + ";",
          "  /* [liga, nombre, ciudad, prestigio, patrón, color1, color2, ...extras] */",
          "  const CLUBS = ["]
    for c in clubs:
        js.append("    " + json.dumps(c, ensure_ascii=False) + ",")
    js += ["  ];",
           "  const CONTINENTALES = " + json.dumps(CONTINENTALES, ensure_ascii=False) + ";",
           "  global.PotreroMundo = { PAISES, LIGAS, CLUBS, CONTINENTALES };",
           "})(typeof window !== \"undefined\" ? window : globalThis);",
           ""]
    open(sys.argv[1], "w", encoding="utf-8").write("\n".join(js))
    print(f"{len(paises)} países · {len(ligas)} ligas · {len(clubs)} clubes → {sys.argv[1]}")
    faltan = [p["nombre"] for p in paises if p["cod"] not in CURADAS]
    print("primeras divisiones sin curar (kit y orden automáticos):", ", ".join(faltan))


main()
