# POTRERO

[![ci](https://github.com/JP7599/potrero/actions/workflows/ci.yml/badge.svg)](https://github.com/JP7599/potrero/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)

Un modo carrera de fútbol que empieza a los 16 años en la peor cancha de la
Copa Perú y termina, si aguantas, contigo sentado en un banco de suplentes
dirigiendo a otros.

Es la idea del modo carrera de siempre —creas un jugador, entrenas, juegas, te
transfieres— pero con todo lo que esos juegos dejan afuera: el sueldo real
después de impuestos, el representante que se lleva su tajada, los sponsors que
aparecen recién cuando eres famoso, la plata que se te va en vivir como crack,
los negocios donde metes lo que ganaste, la lesión que te comes por querer
aguantar los últimos diez minutos, y el día que cuelgas los chimpunes y tienes
que decidir si pagas el curso de entrenador con lo que juntaste.

![POTRERO](docs/screenshot.png)

## Jugar

Abre `docs/index.html`. No hay build, no hay servidor, no hay dependencias.

Eliges nombre, puesto y perfil (crack de barrio, obrero, cerebro, killer del
área) y arrancas desde abajo del todo. A partir de ahí cada semana es una
decisión, y hay 42 semanas por temporada.

## Qué hay adentro

**Una pirámide de seis categorías y 72 clubes.** Copa Perú, Segunda, Primera,
Liga Sudamericana, Liga Continental y La Élite, con ascensos y descensos de
verdad: los dos últimos bajan, los dos primeros suben, tu club incluido. Nadie
te regala el salto de categoría; hay que ganárselo o esperar a que te compren.

**Dos formas de empezar.** Firmar en un club de la Copa Perú y jugar desde el
primer fin de semana en canchas de tierra, o entrar a la cantera de un club de
Primera: sueldo de mentira y reserva todos los sábados, pero entrenas el doble
y si rindes te suben al primer equipo. Si a los 20 no subiste, te dan la carta
de libertad y vuelves a empezar más abajo.

**Cada club con su escudo.** Los 72 escudos son pixel art generado por código
—forma, patrón, colores e iniciales salen del nombre del club—, así que no hay
ni una imagen en el repositorio y el mismo club siempre tiene el mismo escudo.

**El mundo entero juega.** Todas las categorías corren su liga de ida y vuelta,
su copa nacional por eliminación y, las de arriba, la copa internacional con
fase de grupos, semis y final. El mundo sigue girando juegues o no.

**La semana.** Entrenas técnica, gimnasio o video, descansas, haces
fisioterapia, sales en la prensa, sales de noche, ves a tu familia, estudias
idiomas o revisas tus negocios. Cada opción tiene costo: la fiesta sube el
ánimo y baja todo lo demás, la prensa te da fama y te puede regalar un
escándalo.

**El partido.** Los minutos no te los regala nadie: dependen de tu media contra
la de tus compañeros de puesto, de la confianza del técnico y de tu forma. Si
entras, el partido te para una o dos veces y te hace elegir: el penal en el
minuto 88, el mano a mano, el último hombre contra el delantero que se va solo.
Cada opción muestra su probabilidad real calculada con tus atributos, y la
panenka fallada te va a perseguir.

**La plata.** Sueldo semanal escalado al nivel de cada liga (de $50 por semana
en la Copa Perú a seis cifras en la élite), impuestos según el país, comisión
del representante, costo de vida según cómo elijas vivir, primas por gol y por
firmar. Lo que sobra lo puedes meter en bonos, ladrillo, una pollería con tu
nombre (rinde si eres famoso, quiebra si te olvidan), una academia de menores
que paga poco y te suma galones de DT, o una cripto que puede hacerte rico o
meme.

**La carrera.** Creces hacia un potencial que no ves —solo tienes la estimación
de un ojeador que se equivoca—, te llaman de la selección si rindes, ganas
títulos, te votan el Balón de Oro o se lo dan a otro, y a partir de los 30 el
juego te empieza a preguntar si sigues.

**El banco.** Cuando te retiras, pagas el curso de entrenador con tu propia
plata (más barato si te pasaste la carrera viendo video en vez de saliendo).
Después diriges: formación, estilo —posesión le gana al contragolpe, el
contragolpe a la presión alta, la presión alta a la posesión—, mentalidad, once
inicial, entrenamiento semanal, fichajes con presupuesto, ruedas de prensa
donde puedes defender al plantel o mandar al frente a la dirigencia, y una
barra de paciencia de los dirigentes que baja con cada derrota hasta que te
botan.

## Honestidad sobre la simulación

Los partidos son Poisson con lambdas que salen de la diferencia de fuerza entre
los equipos, más localía. La fuerza de un equipo son sus once mejores más un
plus por infraestructura. Tu rendimiento personal es una normal alrededor de tu
media, corregida por forma, ánimo, físico, localía y qué tan difícil es el
rival; de ahí salen la nota, los goles y las asistencias. Nada de esto pretende
ser un modelo del fútbol real: pretende que las decisiones que tomas se noten
en el resultado y que no puedas romper el juego eligiendo siempre lo mismo.

Todo es determinista a partir de una semilla. Si pones la misma semilla y tomas
las mismas decisiones, sale exactamente la misma carrera.

## Tests

```bash
node tests.mjs
```

Verifican lo que se puede verificar: que el round robin sea un round robin de
verdad (todos contra todos, once de local y once de visitante), que en cada
liga los goles a favor sumen igual que los goles en contra, que partir un
partido en dos tiempos dé los mismos goles esperados que jugarlo entero (si eso
se rompe, el modo DT queda desbalanceado y pierdes partidos por un bug), que el
equipo que diriges se mida en la misma escala que el rival, que después de
treinta temporadas ningún plantel apunte a un jugador que no existe y nadie
esté en dos clubes a la vez, que retirar un negocio no cree ni destruya
patrimonio, y que una carrera entera —de los 16 al último banco— se pueda jugar
de principio a fin sin romperse.

## Notas

Todo lo del juego es inventado: los clubes, las ligas, los nombres, las marcas.
Cualquier parecido con la realidad es culpa del fútbol.

La partida se guarda sola en el navegador. Como `localStorage` no siempre
funciona abriendo el archivo directo desde el disco, hay botones de Exportar e
Importar para llevarte la carrera en un archivo.

MIT. Sin dependencias, sin build, sin assets: cinco archivos de JavaScript y un
HTML.
