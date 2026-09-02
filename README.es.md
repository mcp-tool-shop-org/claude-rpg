<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/claude-rpg/main/site/public/banner.jpg" width="800" alt="Ten glowing world-gates in a dark gallery — a lone traveler with a lantern chooses between them">
</p>

<p align="center"><em>Twelve worlds. One narrator. The engine keeps the truth.</em></p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/claude-rpg"><img src="https://img.shields.io/npm/v/%40mcptoolshop%2Fclaude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

Un juego de rol de campaña basado en simulaciones, donde Claude crea la historia, el motor preserva la verdad y los mundos evolucionan a través de rumores, presiones, facciones, relaciones, economía y sistemas de arcos narrativos, para llegar a conclusiones significativas. Juega o construye sobre él.


## ¿Qué es Claude RPG?

Claude RPG se basa en el [Motor de juegos de rol con IA](https://github.com/mcp-tool-shop-org/ai-rpg-engine), un entorno de simulación determinista con 29 módulos que cubren combate, cognición, percepción, facciones, rumores, origen de las creencias, autonomía de los NPC, compañeros, influencia del jugador, mapas estratégicos, reconocimiento de objetos, origen del equipo, oportunidades emergentes, detección de arcos narrativos de la campaña y desencadenantes del final del juego. El trabajo de Claude es interpretar, narrar y hablar. El trabajo del motor es mantener la verdad.

La regla de oro: **Claude propone, el motor decide.**

Los jugadores escriben texto libremente. Claude interpreta la intención, el motor resuelve las acciones de forma determinista, los filtros de percepción deciden lo que realmente vio el jugador y luego Claude narra solo lo que percibió el personaje, con voz, efectos de sonido y audio ambiental creados por el entorno de inmersión.

Los NPC no recitan guiones. Hablan basándose en sus creencias, recuerdos, lealtad a la facción y rumores. Mienten por razones. Están inseguros por razones. Se niegan por razones. El modo Director te permite inspeccionar exactamente por qué.

## Crea tu propio juego

Claude RPG no es solo un juego, sino una implementación de referencia para el ecosistema del Motor de juegos de rol con IA. Úsalo como punto de partida para tus propias experiencias narrativas basadas en simulaciones.

| ¿Quieres...? | Usar |
|------------|-----|
| **Play right now** | `npx @mcptoolshop/claude-rpg play` (selección interactiva del mundo y el personaje) |
| **Create a new world** | `npx @mcptoolshop/claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge): estudio de creación 2D con editor de mapas, creador de NPC y validación. |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive): validación de esquemas, pruebas de guiones gráficos, canales de exportación. |
| **Build a custom runtime** | Importa paquetes [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) directamente: reemplaza a Claude por cualquier LLM, agrega tu propia interfaz de usuario. |
| **Add new game modules** | Crea una bifurcación del motor, agrega módulos al canal de resolución y regístralos. |

El motor es agnóstico en cuanto a LLM. Claude RPG utiliza modelos de Anthropic, pero el motor principal no tiene dependencias de LLM; puedes conectarlo a cualquier modelo o incluso ejecutarlo completamente de forma determinista sin narración.

## Instalar

```bash
npm install @mcptoolshop/claude-rpg
```

O ejecutar directamente:

```bash
npx @mcptoolshop/claude-rpg play
```

## Comenzar rápidamente

```bash
# Play — interactive world and character selection (twelve worlds, grouped by difficulty)
npx @mcptoolshop/claude-rpg play

# Jump straight into a named world
npx @mcptoolshop/claude-rpg play --world gladiator

# Accelerated campaign pacing
npx @mcptoolshop/claude-rpg play --fast

# Generate a new world from a prompt
npx @mcptoolshop/claude-rpg new "A flooded gothic trade city ruled by three merchant houses"

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Establece tu clave API de Anthropic (solo es necesaria para la narración de Claude):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Novedades en la versión 2.0.0

La versión 2.0 es la versión del mundo dinámico: el mundo funciona con el propio ciclo del motor, la calle reacciona a lo que haces y cada partida que hayas guardado sigue cargándose.

| Función | Qué significa |
|---------|--------------|
| **El mundo avanza por sí solo** | Los mundos generados incluyen toda la familia de módulos, al mismo nivel que los paquetes iniciales; el propio ciclo del motor impulsa las presiones, las oportunidades, los encuentros y las acciones de las facciones, y cada partida guardada es una visión de la realidad del mundo. |
| **Enemies act** | Un enemigo consciente anuncia su ataque en la ronda anterior a que lo realice; un canal de combate reservado, situado por encima de la narración, indica tu resultado, las muertes, los golpes acertados y lo que sucederá a continuación. |
| **Asks and recognition** | Los solicitantes que necesitan ayuda y los estafadores que se parecen exactamente a ellos: se plantan pistas, y la revelación se produce más adelante, a cambio de un precio. Ayuda a uno real y, en la misma ronda, se dice; si te quedas quieto, se propaga un rumor, se expresa gratitud que se recompensa más adelante y se recibe un reconocimiento. |
| **The street answers you** | Las órdenes desconocidas se responden de inmediato sin consumir un turno; una frase escrita en el NPC que acaba de hablar es un diálogo; un simple nombre habla y una simple salida mueve; `/go <exit>` y `/rumors` funcionan en modo de juego; un precio de mercado citado se muestra en el bloque de ubicación. |
| **Rumors with a stance** | Los NPC escuchan rumores como oyentes que creen o dudan, y los rumores se propagan a los distritos adyacentes, ambos ajustados en una hoja medida. |
| **A tuning surface** | Cada elemento del mundo dinámico tiene un valor predeterminado medido, `/tuning` para leerlo y una matriz determinista de 30 rondas en los trece mundos. El daño de los enemigos se ajustó a 0,5 en esa hoja. |
| **Save schema v3** | El motor de rumores se basa en la partida guardada, cada partida de la versión 1.x se migra con pruebas de fidelidad completa y un mundo generado reanuda donde se detuvo. |
| **Jugado por cinco familias de modelos** | Cuatro pruebas de juego de familias de IA (Mistral, Qwen, Llama, DeepSeek, Gemini, cuarenta turnos cada una) reemplazaron la evaluación humana y dieron forma a las dos últimas oleadas. |
| **2.495 pruebas** | A partir de 1.870 pruebas en 121 archivos, cada oleada se realizó a través de un jurado diverso y un umbral determinista. |

## Por qué es diferente

| Qué | Cómo |
|------|-----|
| **La verdad de la simulación separada de la narración** | El motor resuelve el combate, el movimiento, el diálogo; Claude solo narra el resultado. No hay resultados alucinados. |
| **El diálogo de los NPC se basa en la cognición** | Cada línea del discurso de los NPC se construye a partir de sus creencias, recuerdos, moral, sospechas, facción y rumores. |
| **Presentación consciente de la percepción** | Claude solo recibe lo que percibió el personaje jugador. Las entidades de baja claridad aparecen como figuras sombrías, no como objetivos con nombre. |
| **Entorno de inmersión de audio/voz** | Los planes de narración estructurados impulsan la síntesis de voz, los efectos de sonido, las capas ambientales y la música a través de voice-soundboard. |
| **Visibilidad del director sobre la verdad oculta** | `/inspect pilgrim` muestra las creencias. `/trace` muestra el origen. `/divergences` muestra lo que pensaste que sucedió frente a lo que realmente sucedió. |
| **Autonomía de los NPC con cadenas de consecuencias** | Los NPC actúan según sus objetivos, hacen un seguimiento de las obligaciones y se toman la revancha cuando cambian los puntos de inflexión de la lealtad. `/npc` y `/people` muestran los puntos de inflexión, los ángulos de influencia y las cadenas de consecuencias activas. |
| **Living districts** | Los distritos tienen comercio, moral y seguridad que cambian según las acciones del jugador, los movimientos de las facciones y las consecuencias de los personajes no jugables (PNJ). El estado de ánimo influye en la narración y escala el juego. `/districts` e `/district` examinan el pulso del vecindario. |
| **Compañeros con riesgo de partida** | Los miembros del grupo tienen moral, lealtad y factores desencadenantes de la partida. Si los presionas demasiado, se irán, por razones que el motor registra. |
| **Influencia del jugador y acciones políticas** | Gasta influencia, favores e información en acciones sociales, rumores, diplomacia y sabotaje. `/leverage` muestra tu capital político. |
| **Origen de los objetos y reliquias** | Los objetos tienen una historia. Una espada que mata a suficientes enemigos se convierte en una reliquia con un epíteto. Los PNJ reconocen los objetos equipados y reaccionan. `/item` examina el origen y registra la historia. |
| **Emergent opportunities** | Los contratos, las recompensas, los favores, las misiones de suministro y las investigaciones surgen de las condiciones del mundo: presión, escasez, objetivos de los PNJ, obligaciones. Acepta, rechaza, abandona o traiciona. `/jobs` e `/accepted` rastrean el trabajo disponible y en curso. |
| **Arcos narrativos y finales del juego** | El motor detecta 10 tipos de arcos narrativos (ascenso al poder, perseguido, creador de reyes, resistencia, etc.) y 8 clases de resolución final (victoria, exilio, derrocamiento, martirio, etc.) a partir del estado acumulado. `/arcs` muestra la trayectoria. `/conclude` genera un epílogo estructurado con narración opcional mediante LLM. |

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

## Entorno de ejecución inmersivo (v0.2)

El narrador no produce prosa sin procesar, sino que genera un **PlanNarrativo**: una receta estructurada que describe el texto, los efectos de sonido, las capas ambientales, las indicaciones musicales y los parámetros de voz.

| Módulo | Propósito |
|--------|---------|
| **Máquina de estados de presentación** | Rastrea la exploración / diálogo / combate / secuelas, y controla la selección de capas de audio. |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking`: inyecta audio con conocimiento del contexto. |
| **Voice Caster** | Asigna automáticamente los PNJ a las voces de [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) por tipo, género y facción. |
| **Audio Director** | Programa indicaciones con prioridad, atenuación y tiempo de espera para evitar el spam. |
| **Sound Registry** | Entradas de audio direccionables por contenido: consulta por etiquetas, estado de ánimo e intensidad. |
| **MCP Bridge** | Traduce los comandos de audio a llamadas de la herramienta voice-soundboard. |

## Tres modos

| Modo | Qué hace |
|------|-------------|
| **Play** | RPG narrativo inmersivo. Claude narra, los PNJ hablan según sus creencias y las acciones se resuelven a través del motor. |
| **Director** | Examina la verdad oculta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Recorre la línea de tiempo de los eventos mostrando la verdad objetiva frente a la percepción del jugador. |

## Ecosistema

Claude RPG es una pieza de una cadena de herramientas más grande para construir juegos narrativos basados en simulaciones:

| Proyecto | Qué hace |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Tiempo de ejecución de simulación determinista: pila completa de módulos del mundo dinámico, cero dependencias de LLM. |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | Estudio de creación de mundos 2D: editor de mapas, constructor de PNJ, renderizador, exportación. |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Validación de esquemas, pruebas de guiones gráficos y flujos de trabajo de exportación de RPG con IA. |
| **Claude RPG** (this repo) | Entorno de ejecución de referencia: narración de Claude, audio inmersivo, herramientas del director. |

## Paquetes del motor

Claude RPG depende de estos paquetes [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Paquete | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, acciones, eventos, reglas, RNG. |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 módulos: combate, cognición, percepción, facciones, rumores, agencia de PNJ, compañeros, influencia, mapa estratégico, reconocimiento de objetos, oportunidades emergentes. |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progresión del personaje, lesiones, reputación. |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipo, origen de los objetos, crecimiento de las reliquias, crónicas. |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria entre sesiones, efectos de relación. |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema de PlanNarrativo, contratos de renderizado. |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Programación de indicaciones de audio, prioridad, atenuación. |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de paquetes de sonido + paquete principal. |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validación del contenido del mundo. |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold: mundo inicial. |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox: mundo inicial. |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective: mundo inicial. |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem: mundo inicial. |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead: mundo inicial. |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain: mundo inicial. |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss: mundo inicial. |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum: mundo inicial. |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil: mundo inicial. |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court: mundo inicial. |

## Garantías del entorno de ejecución (v1.6.0)

| Garantía | Aplicación |
|-----------|------------|
| **El motor resuelve antes de la narración** | Arnés de integración del ciclo de turnos con 15 pruebas deterministas. |
| **Los archivos guardados sobreviven a los cambios de versión** | Flujo de migración ordenado, pruebas de artefactos históricos, escrituras atómicas con recuperación .bak. |
| **Los fallos de Claude se convierten en mensajes seguros para el jugador** | Adaptador tipificado `NarrationError` con 9 pruebas de ruta de error, indicador `--debug` para diagnósticos. |
| **La transmisión no puede corromper el estado** | El estado canónico se finaliza antes de que el texto transmitido tenga importancia; 6 pruebas específicas de la transmisión. |
| **Cobertura mínima en los caminos críticos** | CI aplica umbrales por módulo en sesión, narrador, ciclo de turnos y adaptador LLM. |

## Presupuesto de tokens

| Paso | Entrada | Salida |
|------|-------|--------|
| Interpretación de la acción | ~800 tokens | ~100 tokens |
| Narración de la escena (PlanNarrativo) | ~1400 tokens | ~300 tokens |
| Diálogo del PNJ | ~1400 tokens | ~100 tokens |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Modelo predeterminado: `claude-sonnet-4-20250514`. La generación del mundo utiliza Opus para obtener calidad.

## Seguridad

Claude RPG es una aplicación CLI local que realiza llamadas a la API de Anthropic.

- **Datos afectados:** archivos de guardado del jugador en `~/.claude-rpg/saves/`, API de Anthropic (solo conexiones HTTPS salientes)
- **Datos NO afectados:** no se recopilan datos de telemetría ni analíticos, no se accede a ningún sistema de archivos fuera del directorio de guardado.
- **Clave de la API:** se lee desde la variable de entorno `ANTHROPIC_API_KEY`; nunca se almacena, registra ni transmite más allá de la API de Anthropic.
- **No hay secretos en el código fuente:** no hay tokens, credenciales ni claves de API incrustadas.

Consulte [SECURITY.md](SECURITY.md) para obtener la política de seguridad completa e información sobre cómo informar sobre vulnerabilidades.

## Licencia

MIT

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
