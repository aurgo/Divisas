# 💱 Divisas

Conversor de divisas para el móvil, instalable como aplicación (PWA) y que
funciona **sin conexión** con los últimos tipos descargados.

**👉 https://aurgo.github.io/Divisas/**

El diseño reproduce el de [Kuranz](https://kuranz.com/app/): panel superior
con el importe que se teclea, el resultado debajo y un teclado redondo. Encima
se añaden fuentes de tipos oficiales, temas de color y el modo sin conexión.

## Instalarla

| Teléfono | Cómo |
|---|---|
| Android (Chrome) | Abrir el enlace → menú ☰ de la app → **Instalar la app** (o el menú ⋮ de Chrome → *Instalar aplicación*) |
| iPhone (Safari) | Abrir el enlace → botón **Compartir** → **Añadir a pantalla de inicio** |

Una vez instalada abre a pantalla completa, con su icono, y no necesita
internet: la app entera y los tipos quedan guardados en el teléfono. Sólo
hace falta conexión para traer tipos nuevos y para el botón de ubicación.

## De dónde salen los tipos

Todos los tipos se guardan **en unidades por 1 euro**: el euro hace de
comodín, y cualquier par sale de dos tipos (TWD → EUR → USD). Por orden de
preferencia:

1. **Tipos de referencia del BCE** (unas 30 monedas: USD, JPY, GBP, CHF,
   CNY, HKD, SGD, KRW…). El BCE los publica hacia las 16:00 de Fráncfort y el
   **Banco de España** los reproduce en su tabla *tc_1_1*, normalmente un día
   después. Se consultan las dos y se usa la más reciente: las cifras son las
   mismas.
2. **Dólar taiwanés.** Ni el BCE ni el Banco de España cotizan el TWD (sus
   tablas mensuales del FMI tampoco lo traen). Lo publica a diario el
   **Banco Central de Taiwán**: el cierre NTD/USD del mercado interbancario a
   las 16:00 de Taipéi. Se cruza por el dólar:
   `TWD por EUR = (NTD por USD) × (USD por EUR del BCE)`.
3. **El resto** (AED, VND, THB fuera del BCE…), unas 135 monedas que no
   publica ninguna de las anteriores, sale de un agregador gratuito
   ([ExchangeRate-API](https://www.exchangerate-api.com/docs/free), con
   [currency-api](https://github.com/fawazahmed0/exchange-api) de reserva).

En el menú ☰ se ve, para el par que estás mirando, de qué fuente sale cada
tipo y de qué día es.

### Cómo llegan a la app

Las webs del Banco Central de Taiwán y del Banco de España no se pueden leer
desde el navegador (no permiten peticiones de otras webs), así que la descarga
la hace GitHub: el workflow [`publicar.yml`](.github/workflows/publicar.yml)
ejecuta [`tools/update-rates.mjs`](tools/update-rates.mjs) dos veces cada día
laborable —después del cierre de Taipéi y después de la publicación del BCE—,
guarda el resultado en [`rates.json`](rates.json) y publica la web. La app
sólo pide ese fichero, a su propia web.

Si una fuente falla, se conservan sus tipos anteriores (con su fecha real)
durante una semana; pasado ese tiempo, esas monedas pasan al agregador. Si
fallan todas, `rates.json` no se toca y la ejecución sale en rojo, con aviso
por correo de GitHub. La lectura de la web de Taiwán se descarta si se aleja
más de un 5 % del agregador: sería un error al leer la página, no un tipo.

## Sin conexión

- El *service worker* ([`sw.js`](sw.js)) guarda al instalarse la app
  completa: HTML, estilos, código, tipografías, iconos, las 161 banderas y
  `rates.json`.
- `rates.json` se pide siempre primero a la red (5 s como mucho); si no hay
  conexión, se usa la última copia. La app la guarda además en el teléfono.
- Si sin conexión los tipos del par tienen más de tres días, la app avisa de
  su fecha al abrirse.

## Uso

- **Teclado**: escribe en el importe de arriba; **C** borra todo. Deslizar el
  dedo sobre el importe borra la última cifra.
- **Monedas**: tocar `TWD ⌄` o `EUR ⌄` abre el buscador. Sin escribir nada
  enseña las diez últimas usadas; buscando encuentra por código, por nombre
  en español o en inglés, o por país (*japón*, *taiwan*, *dírham*).
- **⟳** (a la izquierda, en el borde del panel) intercambia las dos monedas.
- **⌖** (arriba a la izquierda) pone arriba la moneda del país en el que estás:
  GPS si das permiso y, si no, la IP.
- **Tocar el resultado** lo copia.
- **Menú ☰**: actualizar tipos, **tema**, instalar, copiar, intercambiar,
  ubicación, y el tipo del par con su fuente y fecha.
- **Temas**: verde (el original), azul, morado, granate, turquesa, grafito,
  claro, y automático (claro u oscuro según el sistema).
- El idioma sigue al del teléfono: español si está en español, inglés en
  cualquier otro caso. Los números usan el formato local (7.444.122,50).

## Estructura

| Fichero | Qué hace |
|---|---|
| `index.html`, `styles.css` | La pantalla. Las medidas están en unidades `u` = 1 px de la captura de referencia (1008 × 2003), así el diseño se ve igual en cualquier móvil |
| `app.js` | Interfaz: teclado, buscador, menú, temas, instalación, ubicación |
| `core.js` | Lógica pura (tecleo, formato, conversión, búsqueda): la prueban los tests |
| `i18n.js`, `currencies.js` | Textos en español e inglés y nombres de las 166 monedas |
| `sw.js`, `manifest.webmanifest` | La PWA: modo sin conexión e instalación |
| `rates.json` | Los tipos; lo escribe el workflow, no se edita a mano |
| `tools/update-rates.mjs` | Descarga y combina las fuentes |
| `tools/build-site.mjs` | Prepara `_site/` para publicar y pone la versión al service worker |
| `tools/make-icons.cjs` | Regenera los PNG de `icons/` desde `icons/icono.svg` (necesita Playwright) |

## Desarrollo

```bash
node --test test/*.test.mjs        # pruebas (no necesitan red)
node tools/update-rates.mjs        # descarga los tipos ahora mismo
node tools/build-site.mjs          # genera _site/
cd _site && python3 -m http.server # http://localhost:8000
```

El service worker sólo funciona por `https` o `localhost`; abriendo
`index.html` con doble clic la app va, pero sin modo sin conexión ni
instalación.

## Licencias

- Tipografías [Exo 2](https://github.com/googlefonts/Exo-2.0) y
  [Roboto Mono](https://github.com/googlefonts/robotomono): SIL Open Font
  License (`fonts/`).
- Banderas [circle-flags](https://github.com/HatScripts/circle-flags): MIT
  (`flags/LICENSE`).
