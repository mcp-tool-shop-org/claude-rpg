# Slice B2 — the starter-fantasy cast sheet (cloud run, 2026-09-02)

**Proof 6 of `docs/living-world-slice-b2.md`:** the starter-fantasy cast rendered
through the pinned workflow for the Director's ruling. This first sheet is the
**cloud** backend (Comfy Cloud via the hosted MCP plugin); the local-backend
parity sheet follows when the local ComfyUI can have the GPU.

![cast sheet](../dogfood/portraits/starter-fantasy-cast-cloud-2026-09-02.jpg)

Rows: Suspicious Pilgrim · Brother Aldric · Sister Maren · Crypt Stalker · Ash
Ghoul · Crypt Warden. Columns: the three candidates per entity (seed, seed+1,
seed+2 — design §3, best-of-3). Nothing here has passed the gate yet; the gate
(SigLIP2 + a local vision model, eight questions each, style plate check) runs
per entity with `portrait-forge accept` and writes the registry.

## How it was made

| Item | Value |
|---|---|
| Tool | `portrait-forge` (private, `mcp-tool-shop-org/portrait-forge`), `scripts/emit-graphs.mjs` |
| Workflow | `workflows/qwen-sfhd.portrait.json`, SHA-256 `0f586da32e7e…` (full hash in the index file beside the sheet) |
| Base | `qwen_image_2512_fp8_e4m3fn.safetensors` (fp8: the bf16 base trips this rig's VRAM ceiling) |
| LoRA | `sfhd_style_v1_000001250` at 0.85 — on Comfy Cloud under its imported name `SaintEloi__sfhd-style-v1-lora__sfhd_style_v1_1250.safetensors` |
| Sampler | euler / simple, 50 steps, cfg 4.0, shift 3.1, 832×1216 |
| Prompt | the frozen slot template (design §1): `sfhd style, [species/body] [age] [face] [hair] [garb] [mood] [palette] [shot]`, fillers from `casts/starter-fantasy.json` |
| Seeds | derived: low 53 bits of SHA-256(packId, entityId, descriptionHash) — listed per graph in the index file |
| Backend | Comfy Cloud, one `submit_workflow` (pilgrim r0-0) + one `submit_batch` of 17; all 18 completed, none failed |

## What the sheet shows (coordinator reading, before the gate)

- The house look holds across all six: one painterly register, one lighting
  model, plain pale ground, silhouette-first readability — the bible's look.
- Within each row the three seeds agree on identity (face, garb, prop, palette);
  the variance is pose and rendering detail, which is what a best-of-3 wants.
- Slot fidelity by eye: pilgrim (wimple, scallop badge, red patch, staff) ✓;
  Aldric (tonsure, beard, rope belt, pendant, candle-gold) ✓; Maren (veil,
  black-and-white habit, ink-stained fingers, satchel of papers) ✓; stalker
  (gaunt, hook, wrappings, grave grey/violet) ✓; ghoul (hairless, cracked
  scalp, ember accents, charred cleric's tunic reading as a cassock) ✓;
  warden (great-helm, black iron, tabard, greatsword, green witch-light) ✓.
- Two things for the Director's eye: the ghoul's "sexton's tunic" rendered as a
  priest's cassock with crosses (a strong read, arguably better than the
  brief); Maren's shot came out three-quarter rather than bust on two of
  three (the gate's questions do not test shot, by design).

## Next

1. Gate each entity (`portrait-forge accept --entity casts/starter-fantasy/<id>.json --candidates _cloud/starter-fantasy/out/<id>`) → registry manifests with the questions, answers, and style scores; append the accepted column here.
2. Local-backend parity sheet (same graphs, local ComfyUI, pinned local LoRA name).
3. The Director rules on the sheet; then wave 11 wires the adapters (runtime-foundry `src/runtime/portraits.ts`, cli-display caption / inline / `/portrait`).
