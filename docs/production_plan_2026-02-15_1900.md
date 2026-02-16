# Chibi Survivors Improvement Plan (target: 2026-02-15 19:00)

## Meeting Participants
1. Developer agent
2. Game design agent
3. Graphic design agent
4. Infra/resource manager agent
5. Sound design agent

## Current Product Evaluation
- Core loop works: move, auto-attack, level-up choices, stage progression, boss cycle.
- Main completion blockers: visual comfort (flash/flicker fatigue), early-session UX guidance, long-session readability, combat readability in high density.
- Asset direction is now consistent around chibi baseline (`chibi.jpg`), but replacement quality control process must be stricter.

## Agreed Priority (descending)
1. Remove visual fatigue first (flashes and harsh blink cues).
2. Improve in-run decision clarity (goal visibility, HUD hierarchy).
3. Strengthen readability under crowd pressure (skills, combo, objective, low HP warnings).
4. Lock an asset pipeline with pass/fail criteria.
5. Tune audio layering to keep impact without ear fatigue.

## Delivery Tracks

### Track A - Combat Feel and Comfort (Developer + Sound)
- Disable screen flash overlays.
- Replace invincibility blink with soft non-blinking outline indicator.
- Keep hit feedback through shake/particles/damage text but cap extreme visual spikes.
- Tune skill and attack sound ducking to avoid stacking pain.

### Track B - UX/UI Completion (Developer + Game Design)
- Add objective progress in HUD (boss timer / boss objective).
- Convert right HUD to KPI + skill-chip structure.
- Add low HP warning state without full-screen blink.
- Improve modal information hierarchy and progression prompts.

### Track C - Art Production (Graphic + Infra)
- Use `scripts/gemini_asset_prompts.json` as single source of truth.
- Generate assets in fixed target paths to avoid runtime mapping complexity.
- Run quality gate for every new sprite:
  - silhouette readable at 64px
  - transparent edges clean
  - no stretching in runtime scale
  - style matches `public/assets/characters/chibi.jpg`

## Timeboxed Plan (local)

### 15:00 - 15:45
- Anti-flicker patch.
- Objective HUD and low HP warning integration.

### 15:45 - 16:45
- Skill cooldown visibility and boss imminent warning.
- Stage clear auto-advance and flow friction removal.

### 16:45 - 17:45
- Replace and validate character/monster/background assets from Gemini outputs.
- Reject/regenerate low-readability outputs immediately.

### 17:45 - 18:30
- High-density combat readability polish.
- Mobile-safe spacing and information hierarchy pass.

### 18:30 - 19:00
- Final balancing pass.
- Handoff notes and launch checklist.

## Task Chaining Rule
- No waiting between tasks.
- As soon as one task is marked done, the next task starts immediately.
- If blocked by external dependency (asset generation delay), switch to the next unblocked track and return later.

## Definition of Done by 19:00
- No harsh blink/flicker elements in combat loop.
- HUD immediately communicates objective, risk, and growth state.
- Stage readability remains stable with many enemies/projectiles.
- Asset set style-consistent and path-consistent.
- Audio layers no longer clip or overwhelm at skill-heavy moments.
