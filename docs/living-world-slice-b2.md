# Slice B2 — faces

> **ON HOLD — Director ruling 2026-09-02.** After the second cast sheet the
> Director put portraits on hold "until we can do it right": the intent is
> portraits **made as needed**, so that **every character is unique**; a
> pre-rendered cast implies a set cast and would shrink the game. This
> design's pipeline (one workflow, two backends, contract-driven prompts, the
> question gate, the registry) stands; its *trigger* must become the entity
> the player meets, with its contract derived at runtime from the entity's
> own description. Redesign brief: memory `feedback_portraits_on_demand_not_a_cast`.
> Nothing below resumes until the Director asks.

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Why this slice exists:** the Director ordered a visual component: every NPC
and monster gets a portrait generated from its engine description, saved to
its profile so it stays consistent across sessions and variants, with a local
path (Qwen-Image on the RTX 5090) and a cloud path (Comfy Cloud) through ONE
fixed ComfyUI workflow, and the studio's painterly LoRAs as the house look.
**Research grounding:** `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/study-swarm-b2/dispatch-b2.md`
(39 findings from four Opus research agents, every source retrieved; arXiv/DOI
items pass the different-family citation gate before they bear weight;
load-bearing choices cite findings by number). **Status: DRAFT for the
Director's review before any code (dogfood-swarm law 8).**
**Verification:** every DOI and arXiv id resolved; 25 of 39 findings supported
outright by the different-family gate, 8 supported in gist and trimmed to
their abstracts, 2 dropped as unsupported by their abstracts (the
masked-embedding and story-consistency claims), 2 advisory (DreamBooth's
subject set; the seductive-details meta-analysis), none fabricated. Receipts
in the study-swarm folder.

## What is on the rig (measured 2026-09-01)

- **Base:** Qwen-Image 2512 (bf16 and fp8) and Qwen-Image-Edit 2511 with their
  VAE and Qwen2.5-VL encoder are installed under the portable ComfyUI; the
  verified model catalog recommends Qwen-Image-2512 (Apache 2.0) as the
  commercial-safe frontier base and ships a starter workflow for it.
- **House look:** `sfhd_style_v1` (`E:/AI/training/output/sfhd_style_v1/`) is a
  Qwen-Image style LoRA trained toward the sprite-foundry HD art-direction
  bible the Director approved on 2026-06-22 (silhouette-first, value-carried
  readability, one master palette, shape-language tilt per pack); its sample
  progression shows exactly the painted character-concept register a portrait
  wants (priest, knight, sorcerer, goblin, innkeeper). Rustline is android-trained
  and is not a candidate. `hellenic_bestiary_hidream_o1` is a creature LoRA on
  HiDream-O1, a different base; the bible already plans a Monster Pack LoRA of
  its own. The oil-pastel dataset exists but no LoRA was trained from it.
- **Cloud:** Comfy Cloud was validated earlier for a Qwen-Image plus LoRA
  pipeline (seed-identical to the local grid at the time) and accepts
  uploaded LoRAs (finding 19).
- **Verifier:** ai-eyes (the studio's VLM tool) for image-versus-description
  checks; plain-sight for reading text out of images.
- **Engine seam:** `PortraitOps.ensure(build)` stamps `portraitRef` on the
  player profile only; NPC and monster portraits live app-side.

## Design (locked on ratification)

### 1. One workflow, two backends (findings 12–19, 20, 21)

- **The workflow is a file:** `portraits/workflow.qwen-sfhd.json` (checked
  in), a ComfyUI API-format graph pinned to Qwen-Image-2512 bf16, the sfhd
  style LoRA at one strength constant (17: a pinned dial), CPU noise, a fixed
  sampler and scheduler, fixed steps and CFG, 832×1216 portrait framing, and a
  fixed-block style injection where the runtime supports it (15, 16). The
  workflow's SHA-256 is part of every portrait's manifest.
- **Local backend:** the portable ComfyUI on this rig (its `--disable-smart-
  memory` start for Qwen plus LoRA is the known-good launch). **Cloud
  backend:** the same graph submitted to Comfy Cloud with the LoRA uploaded
  once; the manifest records `backend`. Local and cloud are expected to be
  near-identical, not bit-identical (19); the acceptance gate, not the seed,
  is what guarantees a portrait is right.
- **At most two LoRAs in the stack** (14): the house style plus, when a
  creature LoRA on the same base exists, the creature LoRA; never a merged
  bake (12, 13). A monster-pack LoRA trained on Qwen-Image (ai-toolkit) is
  this slice's training ask; until it lands, monsters run through the same
  workflow with creature prompt slots and the style LoRA alone.
- **The prompt is a slot template with frozen wording** (21): `[style token]
  [species/body class] [age] [face] [hair/head] [garb] [mood] [palette
  accent] [shot: bust, three-quarter, plain ground]`; only fillers vary.
  Fillers come from the engine's entity description, tags, faction, and the
  pack's shape-language tilt (the bible §3), never from the narrator's prose.

### 2. Identity that survives regeneration (findings 1–11)

- **Canonical first, variants from canonical.** The first accepted portrait is
  the canonical reference; every variant (wounded, older, hooded, bloodied)
  is produced by Qwen-Image-Edit from the canonical image with the variant
  named in the edit prompt, never by editing the previous variant (9, 3).
- **Identity and style ride separate channels** (4, trimmed at the gate to
  "a dedicated identity method beats baselines"; the split itself is the
  agent's reading, kept as design judgment): the style LoRA carries the
  look; identity comes from the canonical reference through the edit model
  (and an image-prompt adapter only if the Qwen runtime exposes one at
  execute time — verified then, not assumed).
- **Consistency check for illustrated faces and creatures:** a VLM judge
  asked pairwise "is this the same character" (11, supported) is the
  primary check, because face-identity encoders degrade under stylization
  (7); a foreground-masked embedding similarity is added as a LOCAL
  MEASUREMENT (the cited support for it, 8, was dropped at the gate; 6 is
  advisory) — thresholds are A6-style levers set from a measured baseline on
  the starter cast, and the embedding check only gates once that baseline
  shows it separates identities.
- **Seed is derived, not random:** `seed = hash(packId, entityId,
  descriptionHash)`; a fixed seed is a reproducibility aid, not the
  consistency mechanism (9, 3; the story-consistency citation was dropped
  at the gate).

### 3. The acceptance gate (findings 22–31)

- **Questions, not scores.** From the description the app builds a fixed
  count of atomic yes/no questions (25), positively phrased (30), balanced in
  polarity by including checks whose correct answer is "no" (26), coarse and
  structural (31): species, sex-if-stated, age band, hair, one signature
  garment, one signature prop, mood register. The verifier (ai-eyes) answers
  each; an accepted portrait passes every required question.
- **Best-of-N ranked, no aesthetics** (24, 28, 29; 27 supports search
  improving output, the verifier-exploitation detail was trimmed): generate N = 3
  candidates (seed, seed+1, seed+2), rank by the count of passed questions
  and a pairwise VLM comparison for ties, accept the top; never use an
  aesthetic or preference score as the gate. On zero acceptable candidates,
  one more round of N with a re-slotted prompt; then the entity keeps a
  silhouette card (no wrong face ever ships — 36's inconsistency cost).
- **Style gate:** a style-descriptor similarity (18) against a reference
  plate from the sfhd samples; below threshold the candidate is rejected as
  off-look even if the questions pass.
- **Cost:** the verifier is not the bottleneck; N generations are (Q3 cost
  note). Batch the named cast at world creation; petitioners and spawned
  patrol members generate lazily on first meeting.

### 4. Where the face appears (findings 32–39)

- **After the first description, never before** (32, trimmed to "imagery
  and illustration interact rather than one suppressing the other"): a portrait shows the
  round after the player first reads the character's description; a portrait
  never carries a fact the prose omits (33).
- **Only for characters who matter** (33, 36; 34 is advisory after the
  gate): named NPCs, petitioners, named monsters and bosses; not filler
  encounters.
- **One look for the whole cast** (35, 36): one style, one eye and mouth
  treatment, one lighting model; fidelity matched to the writing's density
  (37) by the shot slot (bust for minor named, three-quarter for major).
- **The player's own face is opt-in** (38): `portrait me` builds one from the
  character sheet through the engine's portrait hook; default off.
- **The portrait sits welded to the text frame** (39): one caption line in
  the play screen (`[portrait: Suspicious Pilgrim]`), the image rendered
  inline where the terminal supports images (Windows Terminal sixel, Kitty
  graphics), otherwise saved beside the save with `/portrait <name>` to
  open it. Prose keeps interiority; the portrait anchors identity.

### 5. The registry

- `~/.claude-rpg/portraits/<packId>/<entityId>/canonical.png`, `variants/
  <kind>.png`, `manifest.json` = `{ descriptionHash, prompt, seed, workflowId,
  workflowSha256, loras: [{ name, sha256, strength }], backend, model,
  accepted: { questions: [{ q, expected, answer }], styleScore }, identity:
  { variant: score } }`. Regeneration only when `descriptionHash` changes.
- The NPC profile view and the monster template carry `portraitRef` app-side
  (the engine's `PortraitOps` hook fills the player's).

### 6. Ownership and shape

- **A private repo `portrait-forge`** (org, private until proper, like
  `ai-playtest`): the game-agnostic tool — workflow file, backend adapters
  (local ComfyUI, Comfy Cloud), the slot-template prompter, the acceptance
  loop with the ai-eyes verifier, the registry. CLI:
  `portrait-forge ensure --entity <json> --style sfhd --backend local|cloud`.
- **claude-rpg:** runtime-foundry owns the adapter (`src/runtime/portraits.ts`:
  when to ensure, which entities, the caption event); cli-display owns the
  caption line, inline rendering, `/portrait`; tests own the proofs with a
  recorded-backend fake (no GPU in CI).
- **Training ask:** a Qwen-Image monster-pack LoRA (the bible's Monster Pack
  own LoRA) so creatures share the base; until then, style-only.

### 7. Proofs

1. Determinism: the same entity description yields the same prompt, seed,
   and manifest twice; a changed description changes only what it names.
2. Gate: a fixture portrait that fails a required question is rejected; a
   negative-polarity question is asked; an aesthetic score never decides.
3. Identity: a variant's masked-embedding score against canonical exceeds
   the threshold on the starter cast; a deliberately different face fails.
4. Display: the caption appears the round after the first description and
   never on filler encounters; the player portrait is off by default.
5. Backends: the same workflow JSON runs on local ComfyUI and Comfy Cloud
   (recorded runs), both writing the same manifest shape.
6. **Exit gate:** the starter-fantasy cast (pilgrim, Brother Aldric, Sister
   Maren, stalker, ghoul, warden) rendered through the local backend, then
   the Director rules on the sheet; a second sheet from the cloud backend for
   parity.

## Out of scope

Animated portraits, expressions per line, the 2.5D sprite pipeline (Sprite
Foundry's lane), engine changes.
