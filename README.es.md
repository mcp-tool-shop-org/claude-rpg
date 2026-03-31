<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

Un juego de rol basado en la simulación, donde Claude crea la historia, el motor garantiza la veracidad, y los mundos evolucionan a través de rumores, presión, facciones, relaciones, economía y sistemas de arcos narrativos, llegando a conclusiones significativas. Juega o construye sobre él.

## ¿Qué es Claude RPG?

Claude RPG se basa en el [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), un entorno de simulación determinista con 29 módulos que cubren combate, cognición, percepción, facciones, rumores, origen de las creencias, autonomía de los personajes no jugables (PNJs), compañeros, influencia del jugador, mapas estratégicos, reconocimiento de objetos, origen del equipo, oportunidades emergentes, detección de arcos narrativos y desencadenantes del final del juego. La función de Claude es interpretar, narrar y hablar. La función del motor es garantizar la veracidad.

La regla de oro: **Claude propone, el motor decide.**

Los jugadores escriben texto libre. Claude interpreta la intención, el motor resuelve las acciones de forma determinista, los filtros de percepción deciden lo que el jugador realmente ve, y luego Claude narra solo lo que el personaje percibió, con voz, efectos de sonido y audio ambiental, todo gestionado por el motor de inmersión.

Los PNJs no recitan guiones. Hablan basándose en sus creencias, recuerdos, lealtad a una facción y rumores. Mienten por razones. Están inseguros por razones. Se niegan por razones. El modo de director te permite inspeccionar exactamente por qué.

## Crea tu propio juego

Claude RPG no es solo un juego, sino una implementación de referencia para el ecosistema del AI RPG Engine. Úsalo como punto de partida para tus propias experiencias narrativas basadas en la simulación.

| ¿Quieres...? | Usar |
|------------|-----|
| **Play right now** | `npx claude-rpg play` (selección interactiva del mundo y del personaje) |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge): estudio de creación 2D con editor de mapas, constructor de PNJs y validación. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive): validación de esquemas, pruebas de guiones gráficos y flujos de exportación. |
| **Build a custom runtime** | Importa paquetes de [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) directamente: reemplaza a Claude con cualquier modelo de lenguaje, agrega tu propia interfaz de usuario. |
| **Add new game modules** | Crea una bifurcación del motor, agrega módulos a la cadena de resolución y regístralos. |

El motor es independiente de los modelos de lenguaje. Claude RPG utiliza modelos de Anthropic, pero el motor central no tiene ninguna dependencia de modelos de lenguaje; puedes conectarlo a cualquier modelo o incluso ejecutarlo de forma completamente determinista sin narración.

## Instalar

```bash
npm install claude-rpg
```

O ejecútalo directamente:

```bash
npx claude-rpg play
```

## Guía rápida

```bash
# Play — interactive world and character selection
npx claude-rpg play

# Accelerated campaign pacing
npx claude-rpg play --fast

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Configura tu clave de API de Anthropic (solo es necesaria para la narración de Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Novedades en la versión 1.5.0

La versión 1.5 es una versión optimizada para entornos distribuidos: 67 correcciones de errores, 22 mejoras de seguridad proactivas y tres grupos de funciones que hacen que el juego parezca más vivo.

| Función | Significado |
|---------|--------------|
| **API retry with backoff** | Los fallos transitorios de la API de Claude se reintentan automáticamente con un retraso exponencial y aleatorio. |
| **Periodic autosave** | El estado del juego se guarda en intervalos configurables. Ya no perderá progreso debido a fallos o desconexiones. |
| **Fast-path inventory** | Los comandos comunes (usar, equipar, dejar caer, examinar) se resuelven instantáneamente sin necesidad de una comunicación con el modelo de lenguaje. |
| **Terminal colors + spinner** | Colores ANSI para el daño, la curación y los nombres de los personajes no jugables (PNJ). Animación durante las llamadas al modelo de lenguaje. |
| **Tab completion** | Autocompletado para comandos, nombres de PNJ, objetos y ubicaciones. |
| **NPC voice archetypes** | Patrones de habla distintos para cada tipo de PNJ: erudito, tosco, comerciante, noble, y más. |
| **NPC conversation memory** | Los PNJ recuerdan lo que le dijo y hacen referencia a conversaciones anteriores en diálogos futuros. |
| **Token/cost tracking** | Uso de tokens por turno y acumulativo, con un costo estimado, que se muestra bajo demanda. |
| **Turn history compaction** | Los turnos anteriores se resumen para mantener eficientes las ventanas de contexto sin perder el hilo narrativo. |
| **Sistema de misiones + PNJ ambientales** | Los objetivos de las misiones se rastrean en el contexto de la narración. Los PNJ de fondo comentan según el estado del distrito. |
| **625 pruebas** | Aumentado de 209 a 625 pruebas en 53 archivos de prueba. Correcciones de errores, contención de errores, degradación controlada y mejoras de seguridad, todo validado por pruebas internas. |

## ¿Qué lo hace diferente?

| ¿Qué? | ¿Cómo? |
|------|-----|
| **Veracidad de la simulación separada de la narración** | El motor resuelve el combate, el movimiento y el diálogo; Claude solo narra el resultado. No hay resultados inventados. |
| **Diálogo de los PNJs basado en la cognición** | Cada línea del diálogo de un PNJ se construye a partir de sus creencias, recuerdos, moral, sospechas, facción y rumores. |
| **Presentación consciente de la percepción** | Claude solo recibe lo que el personaje del jugador percibió. Las entidades de baja claridad aparecen como figuras sombrías, no como objetivos nombrados. |
| **Motor de inmersión de audio/voz** | Los planes de narración estructurados impulsan la síntesis de voz, los efectos de sonido, las capas ambientales y la música a través de voice-soundboard. |
| **Visibilidad del director sobre la verdad oculta** | `/inspect pilgrim` muestra las creencias. `/trace` muestra el origen. `/divergences` muestra lo que creías que había sucedido frente a lo que realmente sucedió. |
| **Autonomía de los PNJs con cadenas de consecuencias** | Los PNJs actúan según sus objetivos, rastrean sus obligaciones y se vengan cuando los puntos de inflexión de la lealtad cambian. `/npc` y `/people` muestran los puntos de inflexión, los ángulos de influencia y las cadenas de consecuencias activas. |
| **Living districts** | Los distritos tienen aspectos como el comercio, la moral y la seguridad que cambian según las acciones del jugador, los movimientos de las facciones y las consecuencias de los personajes no jugables (PNJ). El estado de ánimo influye en la narración y afecta la jugabilidad. Los comandos `/distritos` y `/distrito` permiten analizar el estado del vecindario. |
| **Compañeros con riesgo de abandono** | Los miembros del grupo tienen moral, lealtad y factores que pueden provocar su abandono. Si los presionas demasiado, se irán, y el sistema registra las razones. |
| **Influencia del jugador y acciones políticas** | Utiliza influencia, favores e información para realizar acciones sociales, difundir rumores, llevar a cabo negociaciones y sabotajes. El comando `/leverage` muestra tu capital político. |
| **Origen y reliquias de los objetos** | Los objetos tienen una historia. Una espada que causa suficientes muertes se convierte en una reliquia con un título. Los PNJ reconocen los objetos equipados y reaccionan ante ellos. El comando `/item` permite conocer el origen y la historia de los objetos. |
| **Emergent opportunities** | Los contratos, recompensas, favores, misiones de suministro e investigaciones surgen de las condiciones del mundo: presión, escasez, objetivos de los PNJ, obligaciones. Puedes aceptar, rechazar, abandonar o traicionar. Los comandos `/jobs` y `/accepted` rastrean las tareas disponibles y las activas. |
| **Arcos de campaña y finales** | El sistema detecta 10 tipos de arcos narrativos (ascenso al poder, perseguido, artífice de reyes, resistencia, etc.) y 8 clases de resolución final (victoria, exilio, derrocamiento, martirio, etc.) a partir del estado acumulado. El comando `/arcs` muestra la trayectoria. El comando `/conclude` genera un epílogo estructurado con una narración opcional generada por un modelo de lenguaje. |

## Arquitectura

```
Player types freeform text
    |
[1] ACTION INTERPRETATION (Claude)
    Input: player text + verbs + entities + exits
    Output: { verb, targetIds, confidence }
    |
[2] ENGINE RESOLUTION (deterministic)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] PERCEPTION FILTERING (deterministic)
    presentForObserver() -> what the player saw
    |
[4] HOOKS: pre-narration
    Zone ambient, combat alerts, death effects
    |
[5] NARRATION PLAN (Claude)
    Input: filtered scene + presentation state
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] AUDIO DIRECTOR
    Priority, ducking, cooldowns -> AudioCommand[]
    |
[7] PRESENTATION
    Voice synthesis + SFX + ambient via voice-soundboard
    Text rendering to terminal
    |
[8] NPC DIALOGUE (Claude, if speaking)
    Grounded in cognition: beliefs, memories, faction, rumors
    Voice-cast per NPC
```

## Entorno de ejecución de inmersión (v0.2)

El narrador no genera texto sin formato; en cambio, produce un **Plan de Narración**: una receta estructurada que describe texto, efectos de sonido, capas ambientales, indicaciones musicales y parámetros de voz.

| Módulo | Propósito |
|--------|---------|
| **Máquina de estados de presentación** | Realiza un seguimiento de la exploración, el diálogo, el combate y las consecuencias, y controla la selección de la capa de audio. |
| **Hook Lifecycle** | `entrar-en-habitación`, `inicio-de-combate`, `fin-de-combate`, `muerte`, `pNJ-hablando`: inyecta audio contextual. |
| **Voice Caster** | Asigna automáticamente PNJ a voces del [panel de sonido](https://github.com/mcp-tool-shop-org/original_voice-soundboard) según el tipo, el género y la facción. |
| **Audio Director** | Programa indicaciones con prioridad, supresión, enfriamiento y prevención de spam. |
| **Sound Registry** | Entradas de audio direccionables por contenido: consulta por etiquetas, estado de ánimo e intensidad. |
| **MCP Bridge** | Traduce los comandos de audio a llamadas de herramientas del panel de sonido. |

## Tres modos

| Modo | Lo que hace |
|------|-------------|
| **Play** | RPG narrativo inmersivo. Claude narra, los PNJ hablan según sus creencias, y las acciones se resuelven a través del sistema. |
| **Director** | Examina la verdad oculta: `/inspect <pNJ>`, `/facción <id>`, `/trace <creencia>`, `/divergencias`, `/pNJ <nombre>`, `/personas`, `/distritos`, `/distrito <id>`, `/objeto <nombre>`, `/leverage`, `/movimientos`, `/trabajos`, `/aceptados`. |
| **Replay** | Visualiza la línea de tiempo de los eventos, mostrando la verdad objetiva frente a la percepción del jugador, lado a lado. |

## Ecosistema

Claude RPG es una parte de un conjunto de herramientas más amplio para crear juegos narrativos basados en simulaciones:

| Proyecto | Lo que hace |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Entorno de ejecución de simulación determinista: 29 módulos, sin dependencias de modelos de lenguaje. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Estudio de creación de mundos 2D: editor de mapas, creador de PNJ, renderizador, exportación. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validación de esquemas, pruebas de guiones gráficos, flujos de trabajo de exportación de RPG con IA. |
| **Claude RPG** (this repo) | Entorno de referencia: narración de Claude, audio de inmersión, herramientas de dirección. |

## Paquetes del motor

Claude RPG depende de estos paquetes de [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Paquete | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, acciones, eventos, reglas, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 módulos: combate, cognición, percepción, facciones, rumores, agencia de PNJ, compañeros, influencia, mapa estratégico, reconocimiento de objetos, oportunidades emergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progresión del personaje, lesiones, reputación. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipamiento, origen de los objetos, crecimiento de los artefactos, crónicas. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria entre sesiones, efectos de las relaciones. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema de NarraciónPlan, contratos de renderizado. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Programación de señales de audio, prioridad, atenuación. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de paquetes de sonido + paquete principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validación del contenido del mundo. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mundo inicial "Chapel Threshold". |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mundo inicial "Neon Lockbox". |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mundo inicial "Gaslight Detective". |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mundo inicial "Black Flag Requiem". |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mundo inicial "Ashfall Dead". |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mundo inicial "Dust Devil's Bargain". |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mundo inicial "Signal Loss". |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Mundo inicial "Iron Colosseum". |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Mundo inicial "Jade Veil". |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Mundo inicial "Crimson Court". |

## Garantías de ejecución (versión 1.5.0)

| Garantía | Cumplimiento |
|-----------|------------|
| **El motor resuelve antes de la narración** | Entorno de integración del bucle de turnos con 15 pruebas deterministas. |
| **Los archivos de guardado sobreviven a los cambios de versión** | Proceso de migración ordenado, pruebas históricas, escrituras atómicas con recuperación mediante archivos .bak. |
| **Los fallos de Claude se convierten en mensajes seguros para el jugador** | Adaptador `NarrationError` con 9 pruebas de rutas de error, bandera `--debug` para diagnóstico. |
| **La transmisión no puede corromper el estado** | El estado canónico se finaliza antes de que el texto transmitido sea relevante; 6 pruebas específicas para la transmisión. |
| **Cobertura mínima en rutas críticas** | El sistema de integración continua (CI) impone umbrales por módulo para la sesión, el narrador, el bucle de turnos y el adaptador del modelo de lenguaje. |

## Presupuesto de tokens

| Paso. | Entrada. | Salida. |
|------|-------|--------|
| Interpretación de la acción. | ~800 tokens. | ~100 tokens. |
| Narración de la escena (NarraciónPlan). | ~1400 tokens. | ~300 tokens. |
| Diálogo de personajes no jugables (PNJs). | ~1400 tokens. | ~100 tokens. |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Modelo predeterminado: `claude-sonnet-4-20250514`. La generación de mundos utiliza Opus para mejorar la calidad.

## Seguridad

Claude RPG es una aplicación de línea de comandos local que realiza llamadas de API salientes a Anthropic.

- **Datos accedidos:** archivos de guardado del jugador en `~/.claude-rpg/saves/`, API de Anthropic (solo HTTPS saliente).
- **Datos NO accedidos:** no hay telemetría, ni análisis, ni acceso al sistema de archivos fuera del directorio de guardado.
- **Clave de API:** se lee de la variable de entorno `ANTHROPIC_API_KEY` — nunca se almacena, se registra ni se transmite más allá de la API de Anthropic.
- **No hay secretos en el código fuente:** no hay tokens, credenciales ni claves de API incrustados.

Consulte [SECURITY.md](SECURITY.md) para obtener la política de seguridad completa y el informe de vulnerabilidades.

## Licencia

MIT.

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
