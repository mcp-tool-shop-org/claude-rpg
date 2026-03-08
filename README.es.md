<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
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

Un RPG de terminal basado en simulacion donde Claude narra, el motor preserva la verdad, y el runtime de inmersion coordina voz, sonido y presentacion.

## Que es Claude RPG?

Claude RPG se construye sobre el [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — un runtime de simulacion determinista con 29 modulos que cubren combate, cognicion, percepcion, facciones, rumores, procedencia de creencias, agencia de NPCs, companeros, influencia del jugador, mapas estrategicos, reconocimiento de objetos, procedencia de equipamiento, oportunidades emergentes, deteccion de arcos de campana, y disparadores de final. El trabajo de Claude es interpretar, narrar y hablar. El trabajo del motor es poseer la verdad.

La regla de oro: **Claude propone, el motor dispone.**

Los jugadores escriben texto libre. Claude interpreta la intencion, el motor resuelve las acciones de forma determinista, los filtros de percepcion deciden lo que el jugador realmente vio, y entonces Claude narra solo lo que el personaje percibio — con voz, efectos de sonido y audio ambiental coordinados por el runtime de inmersion.

Los NPCs no recitan guiones. Hablan desde creencias, recuerdos, lealtad de faccion y rumores. Mienten por razones. Dudan por razones. Se niegan por razones. El modo Director te permite inspeccionar exactamente por que.

## Instalacion

```bash
npm install claude-rpg
```

O ejecutar directamente:

```bash
npx claude-rpg play --world fantasy
```

## Inicio Rapido

```bash
# Jugar el escenario incluido Chapel Threshold
npx claude-rpg play --world fantasy

# Generar un nuevo mundo a partir de un prompt
npx claude-rpg new "Una ciudad comercial gotica inundada gobernada por tres casas mercantes"
```

Configura tu clave de API de Anthropic:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Por Que Es Diferente

| Que | Como |
|-----|------|
| **Verdad de simulacion separada de la narracion** | El motor resuelve combate, movimiento, dialogo — Claude solo narra el resultado. Sin desenlaces alucinados. |
| **Dialogo de NPCs fundamentado en cognicion** | Cada linea de dialogo de un NPC se construye a partir de sus creencias, recuerdos, moral, sospecha, faccion y rumores. |
| **Presentacion consciente de la percepcion** | Claude recibe solo lo que el personaje del jugador percibio. Las entidades de baja claridad aparecen como figuras sombrias, no como objetivos identificados. |
| **Runtime de inmersion con audio y voz** | Los planes de narracion estructurados impulsan la sintesis de voz, efectos de sonido, capas ambientales y musica a traves de voice-soundboard. |
| **Visibilidad del Director sobre la verdad oculta** | `/inspect pilgrim` muestra creencias. `/trace` muestra procedencia. `/divergences` muestra lo que creias que paso vs lo que realmente ocurrio. |
| **Agencia de NPCs con cadenas de consecuencias** | Los NPCs actuan segun objetivos, rastrean obligaciones y toman represalias cuando los puntos de quiebre de lealtad cambian. `/npc` y `/people` muestran puntos de quiebre, angulos de influencia y cadenas de consecuencias activas. |
| **Distritos vivientes** | Los distritos tienen comercio, moral y seguridad que cambian por las acciones del jugador, movimientos de facciones y cadenas de consecuencias de NPCs. El estado de animo fluye hacia la narracion y escala la jugabilidad. `/districts` y `/district` inspeccionan el pulso del vecindario. |
| **Companeros con riesgo de abandono** | Los miembros del grupo tienen moral, lealtad y disparadores de partida. Presionalos demasiado y se iran — por razones que el motor rastrea. |
| **Influencia del jugador y accion politica** | Gasta influencia, favores e inteligencia en acciones sociales, de rumores, diplomacia y sabotaje. `/leverage` muestra tu capital politico. |
| **Procedencia de equipamiento y reliquias** | Los objetos llevan historia. Una espada que mata suficiente se convierte en reliquia con un epiteto. Los NPCs reconocen los objetos equipados y reaccionan. `/item` inspecciona la procedencia y las cronicas. |
| **Oportunidades emergentes** | Contratos, recompensas, favores, suministros e investigaciones surgen de las condiciones del mundo — presion, escasez, objetivos de NPCs, obligaciones. Acepta, rechaza, abandona o traiciona. `/jobs` y `/accepted` rastrean el trabajo disponible y activo. |
| **Arcos de campana y finales** | El motor detecta 10 tipos de arcos narrativos (rising-power, hunted, kingmaker, resistance, etc.) y 8 clases de resolucion de final (victory, exile, overthrow, martyrdom, etc.) a partir del estado acumulado. `/arcs` muestra la trayectoria. `/conclude` genera un epilogo estructurado con narracion LLM opcional. |

## Arquitectura

```
El jugador escribe texto libre
    |
[1] INTERPRETACION DE ACCION (Claude)
    Entrada: texto del jugador + verbos + entidades + salidas
    Salida: { verb, targetIds, confidence }
    |
[2] RESOLUCION DEL MOTOR (determinista)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] FILTRADO DE PERCEPCION (determinista)
    presentForObserver() -> lo que el jugador vio
    |
[4] HOOKS: pre-narracion
    Ambiente de zona, alertas de combate, efectos de muerte
    |
[5] PLAN DE NARRACION (Claude)
    Entrada: escena filtrada + estado de presentacion
    Salida: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] DIRECTOR DE AUDIO
    Prioridad, ducking, cooldowns -> AudioCommand[]
    |
[7] PRESENTACION
    Sintesis de voz + SFX + ambiente via voice-soundboard
    Renderizado de texto en terminal
    |
[8] DIALOGO DE NPC (Claude, si habla)
    Fundamentado en cognicion: creencias, recuerdos, faccion, rumores
    Voz asignada por NPC
```

## Runtime de Inmersion (v0.2)

El narrador no produce prosa sin formato — produce un **NarrationPlan**: una receta estructurada que describe texto, efectos de sonido, capas ambientales, senales musicales y parametros de voz.

| Modulo | Proposito |
|--------|-----------|
| **Maquina de Estado de Presentacion** | Rastrea exploracion / dialogo / combate / desenlace — impulsa la seleccion de capas de audio |
| **Ciclo de Vida de Hooks** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — inyecta audio consciente del contexto |
| **Asignador de Voces** | Asigna automaticamente NPCs a voces de [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) por tipo, genero, faccion |
| **Director de Audio** | Programa senales con prioridad, ducking, cooldowns, anti-spam |
| **Registro de Sonidos** | Entradas de audio direccionables por contenido — consulta por etiquetas, estado de animo, intensidad |
| **Puente MCP** | Traduce AudioCommands a llamadas de herramientas de voice-soundboard |

## Tres Modos

| Modo | Que Hace |
|------|----------|
| **Play** | RPG narrado e inmersivo. Claude narra, los NPCs hablan desde creencias, las acciones se resuelven a traves del motor. |
| **Director** | Inspecciona la verdad oculta: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Recorre la linea temporal de eventos mostrando la verdad objetiva vs la percepcion del jugador lado a lado. |

## Paquetes del Motor

Claude RPG depende de estos paquetes de [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine):

| Paquete | Proposito |
|---------|-----------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | Estado, entidades, acciones, eventos, reglas, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 modulos — combate, cognicion, percepcion, facciones, rumores, agencia de NPCs, companeros, influencia, mapa estrategico, reconocimiento de objetos, oportunidades emergentes |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Progresion de personaje, heridas, reputacion |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipamiento, procedencia de objetos, crecimiento de reliquias, cronicas |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Memoria entre sesiones, efectos de relaciones |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | Esquema de NarrationPlan, contratos de renderizado |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Programacion de senales de audio, prioridad, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Registro de paquetes de sonido + paquete base |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | Validacion de contenido del mundo |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Mundo inicial Chapel Threshold |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Mundo inicial Neon Lockbox |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Mundo inicial Gaslight Detective |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Mundo inicial Black Flag Requiem |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Mundo inicial Ashfall Dead |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Mundo inicial Dust Devil's Bargain |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Mundo inicial Signal Loss |

## Presupuesto de Tokens

| Paso | Entrada | Salida |
|------|---------|--------|
| Interpretacion de accion | ~800 tokens | ~100 tokens |
| Narracion de escena (NarrationPlan) | ~1400 tokens | ~300 tokens |
| Dialogo de NPC | ~1400 tokens | ~100 tokens |
| **Total por turno** | **~3600 tokens** | **~500 tokens** |

Modelo por defecto: `claude-sonnet-4-20250514`. La generacion de mundos usa Opus para mayor calidad.

## Seguridad

Claude RPG es una aplicacion CLI local que realiza llamadas de API salientes a Anthropic.

- **Datos accedidos:** archivos de guardado del jugador en `~/.claude-rpg/saves/`, API de Anthropic (solo HTTPS saliente)
- **Datos NO accedidos:** sin telemetria, sin analiticas, sin acceso al sistema de archivos fuera del directorio de guardado
- **Clave de API:** se lee de la variable de entorno `ANTHROPIC_API_KEY` — nunca se almacena, registra ni transmite mas alla de la API de Anthropic
- **Sin secretos en el codigo fuente** — sin tokens, credenciales ni claves de API integradas

Consulta [SECURITY.md](SECURITY.md) para la politica de seguridad completa y el reporte de vulnerabilidades.

## Licencia

MIT

---

Creado por [MCP Tool Shop](https://mcp-tool-shop.github.io/)
