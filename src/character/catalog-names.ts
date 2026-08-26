// Shared display-name resolution for catalog-backed character ids.
//
// F-3c282b18 / F-9c94c4b5: presence.ts's buildPresence/buildStatusData and
// sheet.ts's renderCharacterSheet were rendering the raw kebab-case catalog
// slug (profile.build.archetypeId/disciplineId/backgroundId, e.g.
// 'penitent-knight') instead of the resolved display name — unlike
// builder.ts's own creation-flow summary, which always resolves `.name`
// before printing ('Penitent Knight'). Centralizes the
// `catalog?.xs.find(...)?.name ?? id` fallback pattern (mirrors builder.ts's
// own `archetype.name` / `disc?.name ?? disciplineId` convention) so every
// render-boundary call site resolves names the same way. The `catalog`
// parameter is optional everywhere it's threaded through: callers that don't
// (yet) have a BuildCatalog in scope keep getting the raw id back, same as
// before this fix — never a hard failure.

import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

/** Resolve an archetypeId to its catalog display name; falls back to the id itself when no catalog is supplied or the id isn't found. */
export function resolveArchetypeName(catalog: BuildCatalog | undefined | null, archetypeId: string): string {
  return catalog?.archetypes.find((a) => a.id === archetypeId)?.name ?? archetypeId;
}

/** Resolve a backgroundId to its catalog display name; falls back to the id itself when no catalog is supplied or the id isn't found. */
export function resolveBackgroundName(catalog: BuildCatalog | undefined | null, backgroundId: string): string {
  return catalog?.backgrounds.find((b) => b.id === backgroundId)?.name ?? backgroundId;
}

/** Resolve a disciplineId to its catalog display name; falls back to the id itself when no catalog is supplied or the id isn't found. */
export function resolveDisciplineName(catalog: BuildCatalog | undefined | null, disciplineId: string): string {
  return catalog?.disciplines.find((d) => d.id === disciplineId)?.name ?? disciplineId;
}
