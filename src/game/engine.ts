import {
  CAMERA_LERP,
  CHARACTER_CONFIGS,
  MONSTER_CONFIGS,
  STAGES,
  UPGRADES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type AudioEvent,
  type BossTelegraph,
  type BeamEffect,
  type CameraState,
  type CharacterConfig,
  type CharacterId,
  type DamageText,
  type GameSnapshot,
  type Gem,
  type InputState,
  type LightningEffect,
  type Monster,
  type MonsterKind,
  type Particle,
  type Player,
  type Projectile,
  type SkillId,
  type SkillLevels,
  type SlashEffect,
  type UpgradeOption,
  type UpgradeType,
  type Vec2,
} from './types';

const PLAYER_RADIUS = 24;
const GEM_PICKUP_RADIUS = 26;
const PROJECTILE_SPEED = 560;
const PROJECTILE_LIFE = 1.25;
const PARTICLE_LIFE = 0.5;
const DAMAGE_TEXT_LIFE = 0.65;
const SLASH_LIFE = 0.22;
const BEAM_LIFE = 0.18;
const LIGHTNING_LIFE = 0.2;
const MAX_MONSTERS_BASE = 180;
const MAX_MONSTERS_PER_STAGE = 24;
const MAX_GEMS = 520;
const MAX_PARTICLES = 900;
const MAX_DAMAGE_TEXTS = 180;

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

const randomRange = (min: number, max: number): number => Math.random() * (max - min) + min;

const sqr = (v: number): number => v * v;

const distanceSq = (a: Vec2, b: Vec2): number => sqr(a.x - b.x) + sqr(a.y - b.y);

const normalize = (v: Vec2): Vec2 => {
  const mag = Math.hypot(v.x, v.y);
  if (mag < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / mag, y: v.y / mag };
};

const moveTowards = (from: Vec2, to: Vec2, speed: number, dt: number): Vec2 => {
  const dir = normalize({ x: to.x - from.x, y: to.y - from.y });
  return {
    x: from.x + dir.x * speed * dt,
    y: from.y + dir.y * speed * dt,
  };
};

const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const pickRandomUnique = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j]!;
    copy[j] = tmp!;
  }
  return copy.slice(0, n);
};

const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 0.0001) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
};

interface RuntimeState {
  player: Player;
  monsters: Monster[];
  projectiles: Projectile[];
  gems: Gem[];
  particles: Particle[];
  damageTexts: DamageText[];
  slashes: SlashEffect[];
  beams: BeamEffect[];
  lightnings: LightningEffect[];
  bossTelegraphs: BossTelegraph[];
  camera: CameraState;
  stageIndex: number;
  stageTimeLeft: number;
  bossSpawned: boolean;
  bossId: number | null;
  spawnTimer: number;
  kills: number;
  combo: number;
  bestCombo: number;
  awaitingUpgrade: boolean;
  upgradeChoices: UpgradeOption[];
  pendingLevelUps: number;
  paused: boolean;
  stageClearReady: boolean;
  stageClearDelay: number;
  gameOver: boolean;
  victory: boolean;
  screenShake: number;
  skills: SkillLevels;
  bladeOrbitAngle: number;
  lightningCooldown: number;
  laserCooldown: number;
  bladeTickCooldown: number;
  bossAttackCooldown: number;
  playerMoving: boolean;
  playerSpeedRatio: number;
  playerAttackPulse: number;
  impactFlash: number;
  hitStopTimer: number;
  cameraShakeScale: number;
  audioEvents: AudioEvent[];
}

const SKILL_UPGRADE_MAP: Record<UpgradeType, SkillId | null> = {
  damage: null,
  attackSpeed: null,
  maxHp: null,
  heal: null,
  moveSpeed: null,
  projectiles: null,
  range: null,
  crit: null,
  armor: null,
  magnet: null,
  pierce: null,
  skillLightning: 'lightning',
  skillBlade: 'blade',
  skillLaser: 'laser',
};

export class GameEngine {
  private readonly characterId: CharacterId;

  private readonly config: CharacterConfig;

  private readonly input: InputState;

  private touchVector: Vec2 | null;

  private ids: number;

  private state: RuntimeState;

  constructor(characterId: CharacterId) {
    this.characterId = characterId;
    this.config = CHARACTER_CONFIGS[characterId];
    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.touchVector = null;
    this.ids = 1;
    this.state = this.createInitialState();
  }

  setInputKey(key: keyof InputState, pressed: boolean): void {
    this.input[key] = pressed;
  }

  setTouchVector(vector: Vec2 | null): void {
    this.touchVector = vector;
  }

  setCameraShakeScale(scale: number): void {
    this.state.cameraShakeScale = clamp(scale, 0, 1.6);
  }

  consumeAudioEvents(): AudioEvent[] {
    if (this.state.audioEvents.length <= 0) {
      return [];
    }
    const out = this.state.audioEvents;
    this.state.audioEvents = [];
    return out;
  }

  update(deltaSeconds: number, viewportWidth: number, viewportHeight: number): void {
    const dt = clamp(deltaSeconds, 0, 0.05);
    if (dt <= 0) {
      return;
    }

    if (this.state.paused) {
      this.updateCamera(viewportWidth, viewportHeight, dt);
      return;
    }

    if (this.state.hitStopTimer > 0) {
      this.state.hitStopTimer = Math.max(0, this.state.hitStopTimer - dt);
      this.updateVisuals(dt * 0.45);
      this.updateCamera(viewportWidth, viewportHeight, dt * 0.55);
      return;
    }

    if (this.state.gameOver || this.state.victory) {
      this.updateVisuals(dt);
      this.updateCamera(viewportWidth, viewportHeight, dt);
      return;
    }

    if (this.state.awaitingUpgrade) {
      this.updateVisuals(dt);
      this.updateCamera(viewportWidth, viewportHeight, dt);
      return;
    }

    if (this.state.stageClearReady) {
      this.updateStageClearTransition(dt);
      this.updateVisuals(dt);
      this.updateCamera(viewportWidth, viewportHeight, dt);
      return;
    }

    this.updatePlayer(dt);
    this.updateStage(dt);
    this.updateAttacks(dt);
    this.updateSkills(dt);
    this.updateBossTelegraphs(dt);
    this.updateProjectiles(dt);
    this.updateMonsters(dt);
    this.updateGems(dt);
    this.processDeathsAndProgression();
    this.updateVisuals(dt);
    this.updateCamera(viewportWidth, viewportHeight, dt);
  }

  applyUpgrade(type: UpgradeType): void {
    if (!this.state.awaitingUpgrade || this.state.pendingLevelUps <= 0) {
      return;
    }

    const skillTarget = SKILL_UPGRADE_MAP[type];
    if (skillTarget) {
      this.applySkillUpgrade(skillTarget);
    } else {
      this.applyStatUpgrade(type as Exclude<UpgradeType, 'skillLightning' | 'skillBlade' | 'skillLaser'>);
    }

    this.state.player.hp = clamp(this.state.player.hp, 0, this.state.player.maxHp);
    this.state.pendingLevelUps = Math.max(0, this.state.pendingLevelUps - 1);

    if (this.state.pendingLevelUps > 0) {
      this.state.awaitingUpgrade = true;
      this.state.upgradeChoices = this.makeUpgradeChoices();
    } else {
      this.state.awaitingUpgrade = false;
      this.state.upgradeChoices = [];
    }
  }

  togglePause(): boolean {
    if (!this.canTogglePause()) {
      return this.state.paused;
    }

    this.state.paused = !this.state.paused;
    if (this.state.paused) {
      this.clearInputs();
    }

    return this.state.paused;
  }

  advanceToNextStage(): boolean {
    if (
      !this.state.stageClearReady ||
      this.state.stageIndex >= STAGES.length - 1 ||
      this.state.awaitingUpgrade ||
      this.state.pendingLevelUps > 0
    ) {
      return false;
    }

    this.state.stageIndex += 1;
    const nextStage = this.currentStage();
    this.state.stageTimeLeft = nextStage.duration;
    this.state.spawnTimer = 1;
    this.state.bossSpawned = false;
    this.state.bossId = null;
    this.state.stageClearReady = false;
    this.state.stageClearDelay = 0;
    this.state.paused = false;
    this.state.monsters = [];
    this.state.projectiles = [];
    this.state.gems = [];
    this.state.bossTelegraphs = [];
    this.state.bossAttackCooldown = 2.8;
    this.state.combo = 0;
    this.state.player.hp = Math.min(
      this.state.player.maxHp,
      this.state.player.hp + this.state.player.maxHp * 0.24,
    );
    this.emitBurst(this.state.player.pos, 24, nextStage.accent, 180);

    return true;
  }

  getSnapshot(): GameSnapshot {
    const boss =
      this.state.bossId === null
        ? null
        : this.state.monsters.find((monster) => monster.id === this.state.bossId) ?? null;

    return {
      player: this.state.player,
      monsters: this.state.monsters,
      projectiles: this.state.projectiles,
      gems: this.state.gems,
      particles: this.state.particles,
      damageTexts: this.state.damageTexts,
      slashes: this.state.slashes,
      beams: this.state.beams,
      lightnings: this.state.lightnings,
      bossTelegraphs: this.state.bossTelegraphs,
      camera: this.state.camera,
      kills: this.state.kills,
      combo: this.state.combo,
      bestCombo: this.state.bestCombo,
      stageIndex: this.state.stageIndex,
      stageTimeLeft: this.state.stageTimeLeft,
      bossActive: boss !== null,
      bossName: boss ? this.currentStage().boss.name : null,
      bossHp: boss?.hp ?? 0,
      bossMaxHp: boss?.maxHp ?? 0,
      skillLevels: this.state.skills,
      skillCooldowns: {
        lightning: this.state.skills.lightning > 0 ? Math.max(0, this.state.lightningCooldown) : 0,
        blade: this.state.skills.blade > 0 ? Math.max(0, this.state.bladeTickCooldown) : 0,
        laser: this.state.skills.laser > 0 ? Math.max(0, this.state.laserCooldown) : 0,
      },
      bladeOrbitAngle: this.state.bladeOrbitAngle,
      awaitingUpgrade: this.state.awaitingUpgrade,
      upgradeChoices: this.state.upgradeChoices,
      pendingLevelUps: this.state.pendingLevelUps,
      paused: this.state.paused,
      stageClearReady: this.state.stageClearReady,
      stageAutoAdvanceLeft: this.state.stageClearReady ? Math.max(0, this.state.stageClearDelay) : 0,
      nextStageIndex: this.state.stageClearReady ? this.state.stageIndex + 1 : null,
      gameOver: this.state.gameOver,
      victory: this.state.victory,
      playerMoving: this.state.playerMoving,
      playerSpeedRatio: this.state.playerSpeedRatio,
      playerAttackPulse: this.state.playerAttackPulse,
      impactFlash: this.state.impactFlash,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
    };
  }

  private canTogglePause(): boolean {
    return !(
      this.state.gameOver ||
      this.state.victory ||
      this.state.awaitingUpgrade ||
      this.state.stageClearReady
    );
  }

  private clearInputs(): void {
    this.input.up = false;
    this.input.down = false;
    this.input.left = false;
    this.input.right = false;
    this.touchVector = null;
  }

  private createInitialState(): RuntimeState {
    const p: Player = {
      pos: { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.5 },
      vel: { x: 0, y: 0 },
      radius: PLAYER_RADIUS,
      hp: this.config.maxHp,
      maxHp: this.config.maxHp,
      speed: this.config.speed,
      damage: this.config.damage,
      attackInterval: this.config.attackInterval,
      attackCooldown: 0,
      range: this.config.range,
      projectiles: this.config.projectiles,
      critChance: this.config.critChance,
      armor: this.config.armor,
      magnetRadius: 115,
      pierce: 0,
      exp: 0,
      expToNext: 35,
      level: 1,
      facing: 1,
      lastMoveDir: { x: 0, y: 1 },
      invincibleTimer: 0,
    };

    return {
      player: p,
      monsters: [],
      projectiles: [],
      gems: [],
      particles: [],
      damageTexts: [],
      slashes: [],
      beams: [],
      lightnings: [],
      bossTelegraphs: [],
      camera: {
        x: p.pos.x,
        y: p.pos.y,
        shakeX: 0,
        shakeY: 0,
      },
      stageIndex: 0,
      stageTimeLeft: STAGES[0]!.duration,
      bossSpawned: false,
      bossId: null,
      spawnTimer: 0.65,
      kills: 0,
      combo: 0,
      bestCombo: 0,
      awaitingUpgrade: false,
      upgradeChoices: [],
      pendingLevelUps: 0,
      paused: false,
      stageClearReady: false,
      stageClearDelay: 0,
      gameOver: false,
      victory: false,
      screenShake: 0,
      skills: {
        lightning: 0,
        blade: 0,
        laser: 0,
      },
      bladeOrbitAngle: 0,
      lightningCooldown: 1.8,
      laserCooldown: 2.8,
      bladeTickCooldown: 0,
      bossAttackCooldown: 3.6,
      playerMoving: false,
      playerSpeedRatio: 0,
      playerAttackPulse: 0,
      impactFlash: 0,
      hitStopTimer: 0,
      cameraShakeScale: 1,
      audioEvents: [],
    };
  }

  private currentStage() {
    return STAGES[this.state.stageIndex] ?? STAGES[STAGES.length - 1]!;
  }

  private nextId(): number {
    this.ids += 1;
    return this.ids;
  }

  private updatePlayer(dt: number): void {
    const p = this.state.player;
    let inputVec: Vec2;

    if (this.touchVector) {
      inputVec = normalize(this.touchVector);
    } else {
      inputVec = {
        x: (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0),
        y: (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0),
      };
      inputVec = normalize(inputVec);
    }

    const targetVel = {
      x: inputVec.x * p.speed,
      y: inputVec.y * p.speed,
    };
    const accelerating = Math.abs(inputVec.x) > 0.02 || Math.abs(inputVec.y) > 0.02;
    const response = accelerating ? 16 : 12;
    const blend = 1 - Math.exp(-response * dt);

    p.vel.x += (targetVel.x - p.vel.x) * blend;
    p.vel.y += (targetVel.y - p.vel.y) * blend;

    if (!accelerating) {
      p.vel.x *= 1 - Math.min(0.82, dt * 10.5);
      p.vel.y *= 1 - Math.min(0.82, dt * 10.5);
    }

    const speedMag = Math.hypot(p.vel.x, p.vel.y);
    this.state.playerSpeedRatio = clamp(speedMag / Math.max(1, p.speed), 0, 1);
    this.state.playerMoving = speedMag > 8;

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;

    p.pos.x = clamp(p.pos.x, p.radius, WORLD_WIDTH - p.radius);
    p.pos.y = clamp(p.pos.y, p.radius, WORLD_HEIGHT - p.radius);

    if (Math.abs(p.vel.x) > 4) {
      p.facing = p.vel.x > 0 ? 1 : -1;
    }
    if (Math.abs(p.vel.x) > 4 || Math.abs(p.vel.y) > 4) {
      p.lastMoveDir = normalize(p.vel);
    }

    p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
  }

  private updateStage(dt: number): void {
    const stage = this.currentStage();

    if (!this.state.bossSpawned) {
      this.state.stageTimeLeft = Math.max(0, this.state.stageTimeLeft - dt);
      if (this.state.stageTimeLeft <= 0) {
        this.spawnBoss();
      }
    }

    this.state.spawnTimer -= dt;
    if (this.state.spawnTimer <= 0 && !this.state.bossSpawned) {
      const monsterCap = MAX_MONSTERS_BASE + this.state.stageIndex * MAX_MONSTERS_PER_STAGE;
      if (this.state.monsters.length < monsterCap) {
        this.spawnMonster(stage);
      }
      const elapsed = 1 - this.state.stageTimeLeft / stage.duration;
      const minInterval = stage.spawnMinInterval;
      const interval = stage.spawnBaseInterval - elapsed * (stage.spawnBaseInterval - minInterval);
      this.state.spawnTimer = Math.max(minInterval, interval) * randomRange(0.8, 1.2);
    }
  }

  private updateStageClearTransition(dt: number): void {
    if (
      this.state.awaitingUpgrade ||
      this.state.stageIndex >= STAGES.length - 1 ||
      this.state.gameOver ||
      this.state.victory
    ) {
      return;
    }

    this.state.stageClearDelay = Math.max(0, this.state.stageClearDelay - dt);
    if (this.state.stageClearDelay > 0) {
      return;
    }

    this.advanceToNextStage();
  }

  private spawnMonster(stage: ReturnType<GameEngine['currentStage']>): void {
    const kind = pickRandom(stage.monsterPool);
    const base = MONSTER_CONFIGS[kind];
    const p = this.state.player;

    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = randomRange(430, 640);
    const pos = {
      x: clamp(p.pos.x + Math.cos(angle) * spawnRadius, 22, WORLD_WIDTH - 22),
      y: clamp(p.pos.y + Math.sin(angle) * spawnRadius, 22, WORLD_HEIGHT - 22),
    };

    const stageFactor = 1 + this.state.stageIndex * 0.23;
    const timeFactor = 1 + (1 - this.state.stageTimeLeft / stage.duration) * 0.55;
    const hp = base.hp * stageFactor * timeFactor;

    this.state.monsters.push({
      id: this.nextId(),
      kind,
      pos,
      vel: { x: 0, y: 0 },
      radius: base.radius,
      hp,
      maxHp: hp,
      speed: base.speed * (1 + this.state.stageIndex * 0.05),
      damage: base.damage * stageFactor,
      expValue: base.exp,
      isBoss: false,
      color: base.color,
    });
  }

  private spawnBoss(): void {
    const stage = this.currentStage();
    const bossData = stage.boss;
    const p = this.state.player;

    const angle = Math.random() * Math.PI * 2;
    const dist = 520;
    const boss: Monster = {
      id: this.nextId(),
      kind: 'boss',
      pos: {
        x: clamp(p.pos.x + Math.cos(angle) * dist, bossData.radius + 5, WORLD_WIDTH - bossData.radius - 5),
        y: clamp(p.pos.y + Math.sin(angle) * dist, bossData.radius + 5, WORLD_HEIGHT - bossData.radius - 5),
      },
      vel: { x: 0, y: 0 },
      radius: bossData.radius,
      hp: bossData.hp,
      maxHp: bossData.hp,
      speed: bossData.speed,
      damage: bossData.damage,
      expValue: 100,
      isBoss: true,
      color: bossData.color,
    };

    this.state.monsters.push(boss);
    this.state.bossSpawned = true;
    this.state.bossId = boss.id;
    this.state.bossAttackCooldown = randomRange(2.2, 3.2);
    this.state.screenShake = Math.max(this.state.screenShake, 10);
    this.emitBurst(boss.pos, 26, stage.accent, 190);
    this.emitAudio('boss_spawn', 1);
  }

  private updateBossTelegraphs(dt: number): void {
    const boss =
      this.state.bossId === null
        ? null
        : this.state.monsters.find((monster) => monster.id === this.state.bossId && monster.hp > 0) ?? null;

    if (boss) {
      this.state.bossAttackCooldown -= dt;
      if (this.state.bossAttackCooldown <= 0) {
        const roll = Math.random();
        const useCone = this.state.stageIndex >= 2 && roll < 0.34;
        const useLine = this.state.stageIndex >= 1 && !useCone && roll < 0.7;
        if (useCone) {
          const dir = normalize({
            x: this.state.player.pos.x - boss.pos.x,
            y: this.state.player.pos.y - boss.pos.y,
          });
          this.state.bossTelegraphs.push({
            id: this.nextId(),
            kind: 'cone',
            pos: { x: boss.pos.x, y: boss.pos.y },
            to: null,
            angle: Math.atan2(dir.y, dir.x),
            arcSpan: Math.max(0.5, 0.98 - this.state.stageIndex * 0.08),
            radius: 190 + this.state.stageIndex * 28,
            width: 0,
            life: 1.02,
            maxLife: 1.02,
            damage: boss.damage * (1.12 + this.state.stageIndex * 0.1),
          });
          this.emitAudio('skill_blade', clamp(0.2 + this.state.stageIndex * 0.08, 0.2, 0.55));
        } else if (useLine) {
          const dir = normalize({
            x: this.state.player.pos.x - boss.pos.x,
            y: this.state.player.pos.y - boss.pos.y,
          });
          const length = 360 + this.state.stageIndex * 75;
          this.state.bossTelegraphs.push({
            id: this.nextId(),
            kind: 'line',
            pos: { x: boss.pos.x, y: boss.pos.y },
            to: {
              x: clamp(boss.pos.x + dir.x * length, 16, WORLD_WIDTH - 16),
              y: clamp(boss.pos.y + dir.y * length, 16, WORLD_HEIGHT - 16),
            },
            angle: Math.atan2(dir.y, dir.x),
            arcSpan: 0,
            radius: 0,
            width: 34 + this.state.stageIndex * 4,
            life: 0.92,
            maxLife: 0.92,
            damage: boss.damage * (1.02 + this.state.stageIndex * 0.1),
          });
          this.emitAudio('skill_laser', clamp(0.24 + this.state.stageIndex * 0.08, 0.24, 0.62));
        } else {
          this.state.bossTelegraphs.push({
            id: this.nextId(),
            kind: 'circle',
            pos: { x: this.state.player.pos.x, y: this.state.player.pos.y },
            to: null,
            angle: 0,
            arcSpan: 0,
            radius: boss.radius + 44 + this.state.stageIndex * 10 + randomRange(-18, 26),
            width: 0,
            life: 1.05,
            maxLife: 1.05,
            damage: boss.damage * (1.08 + this.state.stageIndex * 0.12),
          });
          this.emitAudio('skill_lightning', clamp(0.2 + this.state.stageIndex * 0.07, 0.2, 0.55));
        }
        this.state.bossAttackCooldown = Math.max(2.1, 4.2 - this.state.stageIndex * 0.32) * randomRange(0.9, 1.2);
      }
    }

    if (this.state.bossTelegraphs.length <= 0) {
      return;
    }

    const pending: BossTelegraph[] = [];
    for (const telegraph of this.state.bossTelegraphs) {
      telegraph.life -= dt;
      if (telegraph.life > 0) {
        pending.push(telegraph);
        continue;
      }
      this.resolveBossTelegraph(telegraph);
    }
    this.state.bossTelegraphs = pending;
  }

  private resolveBossTelegraph(telegraph: BossTelegraph): void {
    if (telegraph.kind === 'line' && telegraph.to) {
      const mid = {
        x: (telegraph.pos.x + telegraph.to.x) * 0.5,
        y: (telegraph.pos.y + telegraph.to.y) * 0.5,
      };
      this.state.beams.push({
        id: this.nextId(),
        from: { ...telegraph.pos },
        to: { ...telegraph.to },
        life: 0.2,
        maxLife: 0.2,
        color: '#ff9a68',
      });
      this.emitBurst(mid, 20 + this.state.stageIndex * 2, '#ff8f6f', 220);
      this.emitBurst(mid, 8, '#ffffff', 170);
      this.state.screenShake = Math.max(this.state.screenShake, 10 + this.state.stageIndex * 0.5);
      this.resolveLineTelegraphHit(telegraph);
      return;
    }

    if (telegraph.kind === 'cone') {
      const slashRadius = telegraph.radius * 0.78;
      const spanOffset = telegraph.arcSpan * 0.22;
      this.state.slashes.push({
        id: this.nextId(),
        pos: { ...telegraph.pos },
        radius: slashRadius,
        angle: telegraph.angle - spanOffset,
        life: 0.28,
        maxLife: 0.28,
      });
      this.state.slashes.push({
        id: this.nextId(),
        pos: { ...telegraph.pos },
        radius: slashRadius - 10,
        angle: telegraph.angle + spanOffset,
        life: 0.24,
        maxLife: 0.24,
      });
      this.emitBurst(telegraph.pos, 16 + this.state.stageIndex * 2, '#ffb37a', 220);
      this.emitBurst(telegraph.pos, 8, '#ffffff', 160);
      this.state.screenShake = Math.max(this.state.screenShake, 9 + this.state.stageIndex * 0.5);
      this.resolveConeTelegraphHit(telegraph);
      return;
    }

    this.emitBurst(telegraph.pos, 16 + this.state.stageIndex * 2, '#ff9a68', 230);
    this.emitBurst(telegraph.pos, 8, '#ffffff', 170);
    this.state.lightnings.push({
      id: this.nextId(),
      pos: { ...telegraph.pos },
      radius: Math.max(72, telegraph.radius * 0.72),
      life: LIGHTNING_LIFE * 1.2,
      maxLife: LIGHTNING_LIFE * 1.2,
    });
    this.state.screenShake = Math.max(this.state.screenShake, 9 + this.state.stageIndex * 0.5);
    this.resolveCircleTelegraphHit(telegraph);
  }

  private resolveCircleTelegraphHit(telegraph: BossTelegraph): void {
    const p = this.state.player;
    const hitRadius = telegraph.radius + p.radius * 0.45;
    if (distanceSq(telegraph.pos, p.pos) > hitRadius * hitRadius || p.invincibleTimer > 0) {
      return;
    }

    const incoming = telegraph.damage * randomRange(0.92, 1.12);
    this.applyTelegraphDamageToPlayer(incoming, 0.65);
  }

  private resolveConeTelegraphHit(telegraph: BossTelegraph): void {
    const p = this.state.player;
    const toPlayer = {
      x: p.pos.x - telegraph.pos.x,
      y: p.pos.y - telegraph.pos.y,
    };
    const dist = Math.hypot(toPlayer.x, toPlayer.y);
    if (dist > telegraph.radius + p.radius * 0.5 || p.invincibleTimer > 0) {
      return;
    }

    const angleToPlayer = Math.atan2(toPlayer.y, toPlayer.x);
    const delta = Math.abs(Math.atan2(Math.sin(angleToPlayer - telegraph.angle), Math.cos(angleToPlayer - telegraph.angle)));
    if (delta > telegraph.arcSpan * 0.5 + 0.04) {
      return;
    }

    const incoming = telegraph.damage * randomRange(0.94, 1.15);
    this.applyTelegraphDamageToPlayer(incoming, 0.62);
  }

  private resolveLineTelegraphHit(telegraph: BossTelegraph): void {
    if (!telegraph.to) {
      return;
    }

    const p = this.state.player;
    const d = distanceToSegment(p.pos, telegraph.pos, telegraph.to);
    if (d > telegraph.width + p.radius * 0.45 || p.invincibleTimer > 0) {
      return;
    }

    const incoming = telegraph.damage * randomRange(0.94, 1.14);
    this.applyTelegraphDamageToPlayer(incoming, 0.6);
  }

  private applyTelegraphDamageToPlayer(incomingDamage: number, armorFactor: number): void {
    const p = this.state.player;
    const reduced = incomingDamage * (1 - p.armor * armorFactor);
    p.hp -= reduced;
    p.invincibleTimer = 0.62;
    this.state.combo = 0;
    this.spawnDamageText({ ...p.pos }, Math.round(reduced), false);
    this.emitAudio('player_hit', clamp(reduced / 70, 0.25, 1));
    this.emitBurst({ ...p.pos }, 10, '#ff6b6b', 190);

    if (p.hp <= 0) {
      p.hp = 0;
      this.state.gameOver = true;
      this.emitAudio('game_over', 1);
    }
  }

  private collectNearestLivingMonsters(origin: Vec2, maxDistanceSq: number, maxCount: number): Monster[] {
    if (maxCount <= 0) {
      return [];
    }

    const nearest: Monster[] = [];
    const nearestDist: number[] = [];

    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      const d2 = distanceSq(monster.pos, origin);
      if (d2 > maxDistanceSq) {
        continue;
      }

      let insertAt = nearest.length;
      while (insertAt > 0 && d2 < nearestDist[insertAt - 1]!) {
        insertAt -= 1;
      }
      if (insertAt >= maxCount) {
        continue;
      }

      nearest.splice(insertAt, 0, monster);
      nearestDist.splice(insertAt, 0, d2);
      if (nearest.length > maxCount) {
        nearest.pop();
        nearestDist.pop();
      }
    }

    return nearest;
  }

  private updateAttacks(dt: number): void {
    const p = this.state.player;
    p.attackCooldown -= dt;
    if (p.attackCooldown > 0) {
      return;
    }

    if (this.state.monsters.length === 0) {
      p.attackCooldown = 0.06;
      return;
    }

    let attacked = false;
    switch (this.config.attackStyle) {
      case 'slash_projectile':
        attacked = this.performSlashProjectile();
        break;
      case 'arrow':
        attacked = this.performArrowAttack();
        break;
      case 'magic_aoe':
        attacked = this.performMagicAoeAttack();
        break;
    }

    if (!attacked) {
      p.attackCooldown = 0.08;
      return;
    }
    this.state.playerAttackPulse = 1;
    this.emitAudio('player_attack', 1);
    p.attackCooldown += p.attackInterval;
  }

  private performSlashProjectile(): boolean {
    const p = this.state.player;
    const targets = this.collectNearestLivingMonsters(p.pos, Number.POSITIVE_INFINITY, 1);

    if (targets.length === 0) {
      return false;
    }

    const main = targets[0]!;
    const direction = Math.atan2(main.pos.y - p.pos.y, main.pos.x - p.pos.x);
    const dir = normalize({
      x: main.pos.x - p.pos.x,
      y: main.pos.y - p.pos.y,
    });
    p.lastMoveDir = dir; // Face target

    // Fire a slash projectile that travels and damages everything in its path
    const speed = 480;
    this.state.projectiles.push({
      id: this.nextId(),
      pos: {
        x: p.pos.x + dir.x * (p.radius + 12),
        y: p.pos.y + dir.y * (p.radius + 12),
      },
      vel: {
        x: dir.x * speed,
        y: dir.y * speed,
      },
      radius: 22,
      damage: p.damage,
      life: 0.45,
      maxLife: 0.45,
      pierceLeft: 99,  // pierce everything
      critChance: p.critChance,
      kind: 'slash',
      angle: direction,
    });

    // Also emit a visual slash at the player's position
    this.state.slashes.push({
      id: this.nextId(),
      pos: { ...p.pos },
      radius: p.range * 0.5 + 26,
      angle: direction,
      life: SLASH_LIFE,
      maxLife: SLASH_LIFE,
    });

    return true;
  }

  private performArrowAttack(): boolean {
    const p = this.state.player;
    const maxShots = Math.max(1, p.projectiles);
    const targets = this.collectNearestLivingMonsters(
      p.pos,
      sqr(p.range * 1.4),
      Math.min(Math.max(1, maxShots), 12),
    );
    if (targets.length === 0) {
      return false;
    }

    for (let i = 0; i < maxShots; i += 1) {
      const target = targets[i % targets.length]!;
      const dir = normalize({
        x: target.pos.x - p.pos.x + randomRange(-8, 8),
        y: target.pos.y - p.pos.y + randomRange(-8, 8),
      });
      if (i === 0) p.lastMoveDir = dir; // Face first target
      const angle = Math.atan2(dir.y, dir.x);

      this.state.projectiles.push({
        id: this.nextId(),
        pos: {
          x: p.pos.x + dir.x * (p.radius + 8),
          y: p.pos.y + dir.y * (p.radius + 8),
        },
        vel: {
          x: dir.x * 680,
          y: dir.y * 680,
        },
        radius: 5,
        damage: p.damage,
        life: 1.0,
        maxLife: 1.0,
        pierceLeft: p.pierce,
        critChance: p.critChance,
        kind: 'arrow',
        angle,
      });
    }
    return true;
  }

  private performMagicAoeAttack(): boolean {
    const p = this.state.player;
    const maxShots = Math.max(1, p.projectiles);
    const targets = this.collectNearestLivingMonsters(
      p.pos,
      sqr(p.range * 1.4),
      Math.min(Math.max(1, maxShots), 12),
    );
    if (targets.length === 0) {
      return false;
    }

    for (let i = 0; i < maxShots; i += 1) {
      const target = targets[i % targets.length]!;
      const dir = normalize({
        x: target.pos.x - p.pos.x + randomRange(-16, 16),
        y: target.pos.y - p.pos.y + randomRange(-16, 16),
      });
      if (i === 0) p.lastMoveDir = dir; // Face first target

      this.state.projectiles.push({
        id: this.nextId(),
        pos: {
          x: p.pos.x + dir.x * (p.radius + 8),
          y: p.pos.y + dir.y * (p.radius + 8),
        },
        vel: {
          x: dir.x * PROJECTILE_SPEED,
          y: dir.y * PROJECTILE_SPEED,
        },
        radius: 9,
        damage: p.damage,
        life: PROJECTILE_LIFE,
        maxLife: PROJECTILE_LIFE,
        pierceLeft: 0,
        critChance: p.critChance,
        kind: 'magic',
        aoeRadius: 65,
      });
    }
    return true;
  }

  private updateSkills(dt: number): void {
    this.state.bladeOrbitAngle += dt * (1.8 + this.state.skills.blade * 0.16) * Math.PI;
    if (this.state.bladeOrbitAngle > Math.PI * 2) {
      this.state.bladeOrbitAngle -= Math.PI * 2;
    }

    this.updateBladeSkill(dt);

    this.state.lightningCooldown -= dt;
    if (this.state.skills.lightning > 0 && this.state.lightningCooldown <= 0) {
      this.castLightning();
      const lv = this.state.skills.lightning;
      this.state.lightningCooldown = Math.max(0.7, 3.25 - lv * 0.38);
    }

    this.state.laserCooldown -= dt;
    if (this.state.skills.laser > 0 && this.state.laserCooldown <= 0) {
      this.castLaser();
      const lv = this.state.skills.laser;
      this.state.laserCooldown = Math.max(0.95, 4.1 - lv * 0.42);
    }
  }

  private updateBladeSkill(dt: number): void {
    const level = this.state.skills.blade;
    if (level <= 0) {
      return;
    }

    this.state.bladeTickCooldown -= dt;
    if (this.state.bladeTickCooldown > 0) {
      return;
    }
    this.state.bladeTickCooldown = Math.max(0.08, 0.24 - level * 0.018);

    const bladeCount = Math.min(6, 1 + level);
    const radius = 62 + level * 9;
    const hitRadius = 12 + level * 0.7;
    const baseDamage = this.state.player.damage * (0.52 + level * 0.2);

    let hitAny = false;
    for (let i = 0; i < bladeCount; i += 1) {
      const angle = this.state.bladeOrbitAngle + (i / bladeCount) * Math.PI * 2;
      const bladePos = {
        x: this.state.player.pos.x + Math.cos(angle) * radius,
        y: this.state.player.pos.y + Math.sin(angle) * radius,
      };

      for (const monster of this.state.monsters) {
        if (monster.hp <= 0) {
          continue;
        }

        const rr = hitRadius + monster.radius;
        if (distanceSq(bladePos, monster.pos) > rr * rr) {
          continue;
        }

        const crit = Math.random() < this.state.player.critChance * 0.45;
        const amount = baseDamage * randomRange(0.9, 1.08) * (crit ? 1.7 : 1);
        this.damageMonster(monster, amount, crit);
        hitAny = true;
      }
    }
    if (hitAny) {
      this.state.hitStopTimer = Math.max(this.state.hitStopTimer, 0.016);
      this.state.impactFlash = Math.max(this.state.impactFlash, 0.08);
      this.emitAudio('skill_blade', clamp(level / 8, 0.25, 1));
    }
  }

  private castLightning(): void {
    if (this.state.monsters.length === 0) {
      return;
    }

    const level = this.state.skills.lightning;
    const p = this.state.player;
    const targetCount = 1 + Math.floor((level + 1) / 2);
    const nearestPool = this.collectNearestLivingMonsters(
      p.pos,
      Number.POSITIVE_INFINITY,
      Math.max(3, targetCount * 2),
    );
    if (nearestPool.length === 0) {
      return;
    }
    const targets = pickRandomUnique(nearestPool, Math.min(targetCount, nearestPool.length));

    for (const target of targets) {
      const crit = Math.random() < this.state.player.critChance * 0.6;
      const amount =
        this.state.player.damage * (1.35 + level * 0.48) * randomRange(0.9, 1.15) * (crit ? 1.65 : 1);
      this.damageMonster(target, amount, crit);

      this.state.lightnings.push({
        id: this.nextId(),
        pos: { ...target.pos },
        radius: 72 + level * 8,
        life: LIGHTNING_LIFE,
        maxLife: LIGHTNING_LIFE,
      });
      this.emitBurst(target.pos, 12, '#9ef6ff', 240);
      this.emitBurst(target.pos, 8, '#ffffff', 160);
      this.state.screenShake = Math.max(this.state.screenShake, 8);
      this.state.hitStopTimer = Math.max(this.state.hitStopTimer, 0.022);
      this.state.impactFlash = Math.max(this.state.impactFlash, 0.18);
    }
    this.emitAudio('skill_lightning', clamp(level / 8, 0.3, 1));
  }

  private castLaser(): void {
    const level = this.state.skills.laser;
    if (level <= 0 || this.state.monsters.length === 0) {
      return;
    }

    const p = this.state.player;
    const target = this.collectNearestLivingMonsters(p.pos, Number.POSITIVE_INFINITY, 1)[0];
    if (!target) {
      return;
    }
    const dir = normalize({
      x: target.pos.x - p.pos.x,
      y: target.pos.y - p.pos.y,
    });

    const range = 520 + level * 95;
    const beamStart = { x: p.pos.x, y: p.pos.y - 14 };
    const beamEnd = {
      x: beamStart.x + dir.x * range,
      y: beamStart.y + dir.y * range,
    };

    const baseDamage = p.damage * (2.9 + level * 1.15);
    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      const d = distanceToSegment(monster.pos, beamStart, beamEnd);
      if (d > monster.radius + 12) {
        continue;
      }
      const crit = Math.random() < p.critChance * 0.35;
      const amount = baseDamage * randomRange(0.93, 1.08) * (crit ? 1.6 : 1);
      this.damageMonster(monster, amount, crit);
    }

    this.state.beams.push({
      id: this.nextId(),
      from: beamStart,
      to: beamEnd,
      life: BEAM_LIFE,
      maxLife: BEAM_LIFE,
      color: '#f8b4ff',
    });
    this.emitBurst(beamEnd, 18, '#ffb5f7', 220);
    this.emitBurst(beamEnd, 10, '#ffffff', 170);
    this.state.screenShake = Math.max(this.state.screenShake, 10);
    this.state.hitStopTimer = Math.max(this.state.hitStopTimer, 0.03);
    this.state.impactFlash = Math.max(this.state.impactFlash, 0.22);
    this.emitAudio('skill_laser', clamp(level / 8, 0.35, 1));
  }

  private updateProjectiles(dt: number): void {
    const remaining: Projectile[] = [];
    const livingMonsters = this.state.monsters.filter((monster) => monster.hp > 0);

    for (const projectile of this.state.projectiles) {
      projectile.pos.x += projectile.vel.x * dt;
      projectile.pos.y += projectile.vel.y * dt;
      projectile.life -= dt;

      if (
        projectile.life <= 0 ||
        projectile.pos.x < -60 ||
        projectile.pos.y < -60 ||
        projectile.pos.x > WORLD_WIDTH + 60 ||
        projectile.pos.y > WORLD_HEIGHT + 60
      ) {
        continue;
      }

      let destroyed = false;
      for (const monster of livingMonsters) {
        const rr = projectile.radius + monster.radius;
        if (distanceSq(projectile.pos, monster.pos) > rr * rr) {
          continue;
        }

        const crit = Math.random() < projectile.critChance;
        const damage = projectile.damage * randomRange(0.9, 1.14) * (crit ? 1.8 : 1);
        this.damageMonster(monster, damage, crit);

        // Mage AOE explosion on hit
        if (projectile.kind === 'magic' && projectile.aoeRadius) {
          const aoeR = projectile.aoeRadius;
          for (const otherMonster of livingMonsters) {
            if (otherMonster.id === monster.id) {
              continue;
            }
            const aoeDistSq = distanceSq(projectile.pos, otherMonster.pos);
            if (aoeDistSq <= sqr(aoeR + otherMonster.radius)) {
              const aoeCrit = Math.random() < projectile.critChance * 0.5;
              const aoeDmg = projectile.damage * 0.6 * randomRange(0.85, 1.1) * (aoeCrit ? 1.6 : 1);
              this.damageMonster(otherMonster, aoeDmg, aoeCrit);
            }
          }
          // Visual AOE explosion effect
          this.state.lightnings.push({
            id: this.nextId(),
            pos: { ...projectile.pos },
            radius: aoeR,
            life: LIGHTNING_LIFE * 1.1,
            maxLife: LIGHTNING_LIFE * 1.1,
          });
          this.emitBurst(projectile.pos, 14, '#b388ff', 180);
          this.emitBurst(projectile.pos, 6, '#ffffff', 120);
          this.state.screenShake = Math.max(this.state.screenShake, 4);
        }

        if (projectile.pierceLeft <= 0) {
          destroyed = true;
          break;
        }
        projectile.pierceLeft -= 1;
      }

      if (!destroyed) {
        remaining.push(projectile);
      }
    }

    this.state.projectiles = remaining;
  }

  private updateMonsters(dt: number): void {
    const p = this.state.player;

    for (const monster of this.state.monsters) {
      if (monster.hp <= 0) {
        continue;
      }

      const next = moveTowards(monster.pos, p.pos, monster.speed, dt);
      monster.vel.x = (next.x - monster.pos.x) / dt;
      monster.vel.y = (next.y - monster.pos.y) / dt;
      monster.pos = next;

      const rr = monster.radius + p.radius;
      if (distanceSq(monster.pos, p.pos) > rr * rr) {
        continue;
      }

      if (p.invincibleTimer > 0) {
        continue;
      }

      const incoming = monster.damage * randomRange(0.9, 1.08);
      const reduced = incoming * (1 - p.armor);
      p.hp -= reduced;
      p.invincibleTimer = 0.62;
      this.state.combo = 0;
      this.state.screenShake = Math.max(this.state.screenShake, 7);
      this.state.hitStopTimer = Math.max(this.state.hitStopTimer, 0.018);
      this.state.impactFlash = Math.max(this.state.impactFlash, 0.12);
      this.emitAudio('player_hit', clamp(reduced / 60, 0.2, 1));
      this.spawnDamageText({ ...p.pos }, Math.round(reduced), false);
      this.emitBurst({ ...p.pos }, 8, '#ff6b6b', 170);

      if (p.hp <= 0) {
        p.hp = 0;
        this.state.gameOver = true;
        this.emitAudio('game_over', 1);
      }
    }
  }

  private updateGems(dt: number): void {
    const p = this.state.player;
    const kept: Gem[] = [];

    for (const gem of this.state.gems) {
      const d2 = distanceSq(gem.pos, p.pos);
      const d = Math.sqrt(d2);

      if (d < p.magnetRadius && d > 0.001) {
        const pull = 260 + (p.magnetRadius - d) * 1.9;
        gem.pos = moveTowards(gem.pos, p.pos, pull, dt);
      }

      const collectDist = GEM_PICKUP_RADIUS + gem.radius;
      if (distanceSq(gem.pos, p.pos) <= sqr(collectDist)) {
        this.gainExp(gem.value);
        this.emitBurst(gem.pos, 4, '#8fffd9', 110);
        continue;
      }

      kept.push(gem);
    }

    this.state.gems = kept;
  }

  private gainExp(amount: number): void {
    if (amount <= 0) {
      return;
    }

    const p = this.state.player;
    p.exp += amount;

    let leveled = 0;
    while (p.exp >= p.expToNext && leveled < 24) {
      p.exp -= p.expToNext;
      p.level += 1;
      p.expToNext = Math.floor(p.expToNext * 1.28 + 16);
      leveled += 1;
    }

    if (leveled <= 0) {
      return;
    }

    this.state.pendingLevelUps += leveled;
    if (!this.state.awaitingUpgrade) {
      this.state.awaitingUpgrade = true;
      this.state.upgradeChoices = this.makeUpgradeChoices();
    }
    this.emitAudio('level_up', clamp(leveled / 3, 0.35, 1));
    this.state.screenShake = Math.max(this.state.screenShake, 4);
  }

  private makeUpgradeChoices(): UpgradeOption[] {
    const options: UpgradeOption[] = [];

    const statPool = UPGRADES.filter((upgrade) => {
      if (this.config.attackStyle === 'slash_projectile') {
        return upgrade.id !== 'projectiles' && upgrade.id !== 'pierce';
      }
      return true;
    });
    options.push(...statPool);

    const skillPool = this.buildSkillUpgradeOptions();

    const unlockedMissing = skillPool.filter((option) => {
      const skill = SKILL_UPGRADE_MAP[option.id];
      if (!skill) {
        return false;
      }
      return this.state.skills[skill] <= 0;
    });

    const chosen: UpgradeOption[] = [];
    if (unlockedMissing.length > 0) {
      chosen.push(pickRandom(unlockedMissing));
    }

    const fullPool = [...options, ...skillPool];
    const remainingPool = fullPool.filter((opt) => !chosen.some((pick) => pick.id === opt.id));
    chosen.push(...pickRandomUnique(remainingPool, Math.max(0, 3 - chosen.length)));

    return chosen.slice(0, 3);
  }

  private buildSkillUpgradeOptions(): UpgradeOption[] {
    const lightningLevel = this.state.skills.lightning;
    const bladeLevel = this.state.skills.blade;
    const laserLevel = this.state.skills.laser;

    return [
      {
        id: 'skillLightning',
        name: lightningLevel <= 0 ? '신규 스킬: 번개 강림' : `번개 강림 Lv.${lightningLevel + 1}`,
        description:
          lightningLevel <= 0
            ? '주기적으로 낙뢰를 내려 광역 피해를 줍니다.'
            : `낙뢰 수/피해 강화 (현재 Lv.${lightningLevel})`,
      },
      {
        id: 'skillBlade',
        name: bladeLevel <= 0 ? '신규 스킬: 회전 칼날' : `회전 칼날 Lv.${bladeLevel + 1}`,
        description:
          bladeLevel <= 0
            ? '주변을 도는 칼날로 근접 몬스터를 자동 공격합니다.'
            : `칼날 수/피해 강화 (현재 Lv.${bladeLevel})`,
      },
      {
        id: 'skillLaser',
        name: laserLevel <= 0 ? '신규 스킬: 레이저 미사일' : `레이저 미사일 Lv.${laserLevel + 1}`,
        description:
          laserLevel <= 0
            ? '강력한 관통 레이저를 발사해 직선 상 적을 관통합니다.'
            : `레이저 피해/쿨다운 강화 (현재 Lv.${laserLevel})`,
      },
    ];
  }

  private applyStatUpgrade(type: Exclude<UpgradeType, 'skillLightning' | 'skillBlade' | 'skillLaser'>): void {
    const p = this.state.player;
    switch (type) {
      case 'damage':
        p.damage *= 1.15;
        break;
      case 'attackSpeed':
        p.attackInterval = Math.max(0.16, p.attackInterval * 0.87);
        break;
      case 'maxHp':
        p.maxHp += 20;
        p.hp += 20;
        break;
      case 'heal':
        p.hp += 30;
        break;
      case 'moveSpeed':
        p.speed *= 1.12;
        break;
      case 'projectiles':
        if (this.config.attackStyle !== 'slash_projectile') {
          p.projectiles += 1;
        } else {
          p.damage *= 1.08;
        }
        break;
      case 'range':
        p.range *= 1.14;
        break;
      case 'crit':
        p.critChance = Math.min(0.85, p.critChance + 0.08);
        break;
      case 'armor':
        p.armor = Math.min(0.75, p.armor + 0.07);
        break;
      case 'magnet':
        p.magnetRadius += 60;
        break;
      case 'pierce':
        if (this.config.attackStyle !== 'slash_projectile') {
          p.pierce += 1;
        } else {
          p.damage *= 1.08;
        }
        break;
      default:
        break;
    }
  }

  private applySkillUpgrade(skillId: SkillId): void {
    this.state.skills[skillId] = Math.min(8, this.state.skills[skillId] + 1);

    if (skillId === 'lightning') {
      this.state.lightningCooldown = Math.min(this.state.lightningCooldown, 0.2);
    }
    if (skillId === 'laser') {
      this.state.laserCooldown = Math.min(this.state.laserCooldown, 0.2);
    }
    if (skillId === 'blade') {
      this.state.bladeTickCooldown = Math.min(this.state.bladeTickCooldown, 0.05);
    }
  }

  private damageMonster(monster: Monster, amount: number, crit: boolean): void {
    monster.hp -= amount;
    this.spawnDamageText({ ...monster.pos }, Math.round(amount), crit);
    this.emitBurst(monster.pos, crit ? 6 : 4, crit ? '#ffe08a' : '#fff', 130);
    const push = monster.isBoss ? 6 : crit ? 18 : 11;
    const away = normalize({
      x: monster.pos.x - this.state.player.pos.x,
      y: monster.pos.y - this.state.player.pos.y,
    });
    monster.pos.x = clamp(monster.pos.x + away.x * push, monster.radius + 4, WORLD_WIDTH - monster.radius - 4);
    monster.pos.y = clamp(
      monster.pos.y + away.y * push,
      monster.radius + 4,
      WORLD_HEIGHT - monster.radius - 4,
    );

    this.state.impactFlash = Math.max(this.state.impactFlash, crit ? 0.24 : 0.1);
    this.state.hitStopTimer = Math.max(this.state.hitStopTimer, crit ? 0.028 : 0.012);
    this.state.screenShake = Math.max(this.state.screenShake, crit ? 7 : 4);

    if (monster.isBoss) {
      this.state.screenShake = Math.max(this.state.screenShake, crit ? 9 : 6);
      this.state.hitStopTimer = Math.max(this.state.hitStopTimer, crit ? 0.032 : 0.018);
    }
  }

  private processDeathsAndProgression(): void {
    const survivors: Monster[] = [];
    let bossDefeated = false;
    let regularKilled = 0;

    for (const monster of this.state.monsters) {
      if (monster.hp > 0) {
        survivors.push(monster);
        continue;
      }

      this.state.kills += 1;
      this.state.combo += 1;
      this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);

      if (monster.isBoss) {
        bossDefeated = true;
        this.state.bossId = null;
        this.state.bossTelegraphs = [];
        this.state.screenShake = Math.max(this.state.screenShake, 14);
        this.emitBurst(monster.pos, 38, '#ffd166', 250);
        this.emitAudio('boss_die', 1);
      } else {
        regularKilled += 1;
        if (this.state.gems.length >= MAX_GEMS) {
          const idx = Math.floor(Math.random() * this.state.gems.length);
          const merged = this.state.gems[idx];
          if (merged) {
            merged.value += monster.expValue;
            merged.pos.x = (merged.pos.x + monster.pos.x) * 0.5;
            merged.pos.y = (merged.pos.y + monster.pos.y) * 0.5;
          }
        } else {
          this.state.gems.push({
            id: this.nextId(),
            pos: {
              x: monster.pos.x + randomRange(-8, 8),
              y: monster.pos.y + randomRange(-8, 8),
            },
            value: monster.expValue,
            radius: 6,
          });
        }
      }
    }

    this.state.monsters = survivors;

    if (regularKilled > 0) {
      this.emitAudio('monster_die', clamp(regularKilled / 8, 0.2, 1));
    }

    if (!bossDefeated) {
      return;
    }

    if (this.state.stageIndex >= STAGES.length - 1) {
      this.collectAllStageGems();
      this.state.victory = true;
      this.emitAudio('victory', 1);
      return;
    }

    // Stage clear reward: automatically vacuum all dropped EXP before next stage.
    this.collectAllStageGems();

    this.state.stageClearReady = true;
    this.state.stageClearDelay = 2.8;
    this.state.bossSpawned = true;
    this.state.bossTelegraphs = [];
    this.state.monsters = [];
    this.state.projectiles = [];
    this.state.combo = 0;
    this.emitAudio('stage_clear', 1);
  }

  private collectAllStageGems(): void {
    if (this.state.gems.length <= 0) {
      return;
    }

    const totalExp = this.state.gems.reduce((sum, gem) => sum + gem.value, 0);
    this.state.gems = [];
    this.gainExp(totalExp);
    this.emitBurst(this.state.player.pos, 22, '#8fffd9', 210);
  }

  private updateVisuals(dt: number): void {
    this.state.particles = this.state.particles.filter((particle) => {
      particle.pos.x += particle.vel.x * dt;
      particle.pos.y += particle.vel.y * dt;
      particle.life -= dt;
      return particle.life > 0;
    });

    this.state.damageTexts = this.state.damageTexts.filter((text) => {
      text.pos.y -= 42 * dt;
      text.life -= dt;
      return text.life > 0;
    });

    this.state.slashes = this.state.slashes.filter((slash) => {
      slash.life -= dt;
      return slash.life > 0;
    });

    this.state.beams = this.state.beams.filter((beam) => {
      beam.life -= dt;
      return beam.life > 0;
    });

    this.state.lightnings = this.state.lightnings.filter((strike) => {
      strike.life -= dt;
      return strike.life > 0;
    });

    this.state.playerAttackPulse = Math.max(0, this.state.playerAttackPulse - dt * 2.0);
    this.state.screenShake = Math.max(0, this.state.screenShake - dt * 18);
    this.state.impactFlash = Math.max(0, this.state.impactFlash - dt * 1.8);
  }

  private updateCamera(viewportWidth: number, viewportHeight: number, dt: number): void {
    const p = this.state.player;
    const cam = this.state.camera;

    const targetX = clamp(p.pos.x, viewportWidth * 0.5, WORLD_WIDTH - viewportWidth * 0.5);
    const targetY = clamp(p.pos.y, viewportHeight * 0.5, WORLD_HEIGHT - viewportHeight * 0.5);
    const followFactor = 1 - Math.exp(-CAMERA_LERP * dt);
    cam.x += (targetX - cam.x) * followFactor;
    cam.y += (targetY - cam.y) * followFactor;

    if (this.state.screenShake > 0.01) {
      const amp = this.state.screenShake * this.state.cameraShakeScale;
      cam.shakeX = randomRange(-amp, amp);
      cam.shakeY = randomRange(-amp, amp);
    } else {
      cam.shakeX = 0;
      cam.shakeY = 0;
    }
  }

  private spawnDamageText(pos: Vec2, value: number, crit: boolean): void {
    if (this.state.damageTexts.length >= MAX_DAMAGE_TEXTS) {
      this.state.damageTexts.shift();
    }
    this.state.damageTexts.push({
      id: this.nextId(),
      pos,
      value,
      life: DAMAGE_TEXT_LIFE,
      maxLife: DAMAGE_TEXT_LIFE,
      crit,
    });
  }

  private emitBurst(center: Vec2, count: number, color: string, speed: number): void {
    if (this.state.particles.length >= MAX_PARTICLES) {
      return;
    }
    const allowance = Math.min(count, MAX_PARTICLES - this.state.particles.length);
    if (allowance <= 0) {
      return;
    }
    for (let i = 0; i < allowance; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = randomRange(speed * 0.35, speed);
      this.state.particles.push({
        id: this.nextId(),
        pos: { x: center.x, y: center.y },
        vel: {
          x: Math.cos(angle) * magnitude,
          y: Math.sin(angle) * magnitude,
        },
        life: PARTICLE_LIFE * randomRange(0.7, 1.3),
        maxLife: PARTICLE_LIFE,
        size: randomRange(2, 4.5),
        color,
      });
    }
  }

  private emitAudio(type: AudioEvent['type'], intensity: number): void {
    this.state.audioEvents.push({
      id: this.nextId(),
      type,
      intensity: clamp(intensity, 0, 1),
    });
  }

  getCharacterConfig(): CharacterConfig {
    return this.config;
  }

  getCurrentStageName(): string {
    return this.currentStage().name;
  }

  getCurrentStageId(): number {
    return this.currentStage().id;
  }

  getCharacterId(): CharacterId {
    return this.characterId;
  }

  getMonsterTypeName(kind: MonsterKind): string {
    switch (kind) {
      case 'slime':
        return 'Slime';
      case 'bat':
        return 'Bat';
      case 'skeleton':
        return 'Skeleton';
      case 'scorpion':
        return 'Scorpion';
      case 'mummy':
        return 'Mummy';
      case 'flame':
        return 'Flame';
      case 'boss':
        return 'Boss';
      default:
        return pickRandom(['Enemy']);
    }
  }
}
