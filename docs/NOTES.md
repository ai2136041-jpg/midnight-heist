# Midnight Heist - working notes (saved for context compaction)

Project dir: /home/ubuntu/midheist  (Three.js/Vite/TS, resource manus-resource://manus-webdev/project/wdp_7bd2503f5b2291c43408995b)
GAME_RUNTIME=/home/ubuntu/.manus-addons/manus-webdev-sha-eaaeec6cf811c1a2/runtime/game-dev
Blueprint APPROVED rev2: assetProduction=ai_generated_fast (P1, pbr false), riggingAndAnimation=true, no online features (server/db stay off), language ar.
Dev server: run `PORT=3000 HOST=0.0.0.0 pnpm dev` as resident exec service (cwd project). Use webdev.take_screenshot for visual checks.
Before first checkpoint: read skills/webdev/references/game-sharing.md, git-checkpoints.md, deployment.md. Favicon required. Build via `pnpm build` (tsc + vite + check-size). smoke: scripts/smoke.mjs needs rewrite.
Save: `node $GAME_RUNTIME/save-threejs.mjs --message "..."`, then push to origin/main per git-checkpoints.md.

## Generated models (assets/models/, synced into assets.lock.json; groups still default "models" -> assign meaningful groups: characters/artifacts/props)
- thief_anim.glb (rigged biped, clips: idle 15.4s, walk 2.37s, run 1.27s, frightened 3.4s), guard_anim.glb (idle, walk, run, look_around 15.6s). Hip drift tiny. run clip hip y = -0.51 (check ground contact in render).
- Mesh bounds pre-skin: height 0..1 (scale to ~1.75), T-pose arms along Z => character likely faces +/-X; verify facing with a render and use a fixed yaw wrapper.
- Props bounds centered (y -0.5..0.5, height 1): artifact_common (vase), artifact_rare (gold cat statuette), artifact_legendary (crown), statue, locker, urn. Scale + sit on y=0 in code.
- Intermediates (thief.glb, thief_rig.glb, guard.glb, guard_rig.glb) moved to /home/ubuntu/scratch (not in project).
- Load models by `import.meta.glob('../../assets/models/*.glb',{query:'?url',import:'default',eager:true})`.
- Materials: set roughness .8, metalness 0 to avoid glare. Clone rigged with SkeletonUtils.clone, own AnimationMixer each.

## Fonts
public/fonts: ManusCC0 Regular/Medium/Bold (Latin), cairo-arabic-400/700-normal.woff2 (OFL, Cairo-OFL.txt). CJK font removed. i18n: en + ar (RTL). @font-face unicode-range for Arabic.

## Done so far
Deleted old starter game files (rapier removed). Written: src/game/config.ts, grid.ts, rules.ts. Kept: engine/loop.ts, assets.ts, renderer.ts (need adapt), scripts/manus-tuning (keep), scripts/check-size.mjs, smoke.mjs (rewrite).
Planned: levels.ts (generator + tutorial L1), world.ts, player.ts, guard.ts, security.ts, noise.ts, camera.ts, fx.ts, game.ts, shop in rules, ui/ui.ts, ui/touch.ts, ui/icons.ts, engine/audio.ts (procedural 3 music layers), engine/input.ts, engine/save.ts (v2: money, level, upgrades, gadgets, settings), engine/i18n.ts (en/ar), tuning.ts (dev bridge), styles/main.css, tests.
Tripo animation presets doc: https://developers.tripo3d.ai/en/docs/animations-retarget (v1.0 biped presets preset:biped:*)
