#!/usr/bin/env python3
"""Convierte openfootball/clubs (CC0) en la base de clubes de POTRERO.

Saca de cada archivo `*.clubs.txt` el nombre canónico y la ciudad, ignorando
los alias (las líneas que empiezan con `|`) y los encabezados de región.
La salida es un JSON por país, listo para que el generador del mundo lo
reparta en divisiones.
"""
import json, os, re, sys, unicodedata

BASE = sys.argv[1] if len(sys.argv) > 1 else "clubs"
SALIDA = sys.argv[2] if len(sys.argv) > 2 else "clubes.json"

# Los países que el juego modela, con su código y confederación. El resto del
# dataset queda disponible pero no entra a la v0.2.
PAISES = {
    # Conmebol: todos, es lo que pidió JP
    "argentina": ("ar", "Argentina", "conmebol"), "bolivia": ("bo", "Bolivia", "conmebol"),
    "brazil": ("br", "Brasil", "conmebol"), "chile": ("cl", "Chile", "conmebol"),
    "colombia": ("co", "Colombia", "conmebol"), "ecuador": ("ec", "Ecuador", "conmebol"),
    "paraguay": ("py", "Paraguay", "conmebol"), "peru": ("pe", "Perú", "conmebol"),
    "uruguay": ("uy", "Uruguay", "conmebol"), "venezuela": ("ve", "Venezuela", "conmebol"),
    # Concacaf
    "mexico": ("mx", "México", "concacaf"), "united-states": ("us", "Estados Unidos", "concacaf"),
    "canada": ("ca", "Canadá", "concacaf"), "costa-rica": ("cr", "Costa Rica", "concacaf"),
    # Uefa: las más futboleras
    "spain": ("es", "España", "uefa"), "england": ("eng", "Inglaterra", "uefa"),
    "italy": ("it", "Italia", "uefa"), "germany": ("de", "Alemania", "uefa"),
    "france": ("fr", "Francia", "uefa"), "portugal": ("pt", "Portugal", "uefa"),
    "netherlands": ("nl", "Países Bajos", "uefa"), "belgium": ("be", "Bélgica", "uefa"),
    "turkey": ("tr", "Turquía", "uefa"), "scotland": ("sco", "Escocia", "uefa"),
    "greece": ("gr", "Grecia", "uefa"), "russia": ("ru", "Rusia", "uefa"),
    "ukraine": ("ua", "Ucrania", "uefa"), "croatia": ("hr", "Croacia", "uefa"),
    "serbia": ("rs", "Serbia", "uefa"), "austria": ("at", "Austria", "uefa"),
    "switzerland": ("ch", "Suiza", "uefa"), "denmark": ("dk", "Dinamarca", "uefa"),
    "sweden": ("se", "Suecia", "uefa"), "norway": ("no", "Noruega", "uefa"),
    "poland": ("pl", "Polonia", "uefa"), "czech-republic": ("cz", "Chequia", "uefa"),
}

RUIDO = re.compile(r"^\s*(\||=|#|-{3,})")


def limpiar(t):
    # El dataset mete en el mismo campo el estadio («Ciudad @ Estadio»), la
    # provincia («La Plata › Buenos Aires») y notas del editor («# note: ...»).
    t = t.split("@")[0].split("#")[0].split("›")[0]
    return re.sub(r"\s+", " ", t).strip(" ,\t")


ANIO = re.compile(r"^\d{4}$")


def leer(path):
    """Devuelve [(nombre, ciudad, [alias])] del archivo de clubes de un país.

    Los alias (las líneas sangradas que empiezan con `|`) sirven después para
    no meter dos veces al mismo club: el dataset lo llama «Club Universitario
    de Deportes» y la lista curada, «Universitario»."""
    fuera = []
    for linea in open(path, encoding="utf-8", errors="ignore"):
        s = linea.rstrip("\n")
        if not s.strip():
            continue
        if s.lstrip().startswith("|"):
            if fuera:
                for a in s.lstrip()[1:].split("|"):
                    a = limpiar(a)
                    if a:
                        fuera[-1][2].append(a)
            continue
        if RUIDO.match(s) or s[0].isspace():
            continue
        partes = [limpiar(x) for x in s.split(",")]
        nombre = re.sub(r"\s*\([^)]*\)\s*$", "", partes[0])
        # El formato mezcla «Club, Ciudad», «Club, Año» y «Club, Ciudad, Año».
        ciudad = ""
        for campo in partes[1:]:
            if campo and not ANIO.match(campo):
                ciudad = campo
                break
        if len(nombre) < 3 or len(nombre) > 42:
            continue
        fuera.append((nombre, ciudad, []))
    return fuera


def clave(nombre):
    n = unicodedata.normalize("NFD", nombre.lower())
    return "".join(c for c in n if unicodedata.category(c) != "Mn")


def main():
    mundo = {}
    for carpeta, (cod, nombre, conf) in PAISES.items():
        encontrado = None
        for root, _, files in os.walk(BASE):
            if os.path.basename(root) != carpeta:
                continue
            for f in files:
                if f.endswith("clubs.txt") and ".lang." not in f:
                    encontrado = os.path.join(root, f)
        if not encontrado:
            print(f"  sin datos: {nombre}")
            continue
        clubes, vistos = [], set()
        for n, c, alias in leer(encontrado):
            k = clave(n)
            if k in vistos:
                continue
            vistos.add(k)
            clubes.append({"n": n, "c": c, "a": alias})
        mundo[cod] = {"nombre": nombre, "conf": conf, "clubes": clubes}
        print(f"  {nombre:16} {len(clubes):4} clubes")
    json.dump(mundo, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    total = sum(len(v["clubes"]) for v in mundo.values())
    print(f"\n{total} clubes en {len(mundo)} países → {SALIDA}")


main()
