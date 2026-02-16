export type CharacterId = 'warrior' | 'mage' | 'archer';

export type AttackStyle = 'slash_projectile' | 'arrow' | 'magic_aoe';

export type MonsterKind =
  | 'slime'
  | 'bat'
  | 'skeleton'
  | 'scorpion'
  | 'mummy'
  | 'flame'
  | 'boss';

export type UpgradeType =
  | 'damage'
  | 'attackSpeed'
  | 'maxHp'
  | 'heal'
  | 'moveSpeed'
  | 'projectiles'
  | 'range'
  | 'crit'
  | 'armor'
  | 'magnet'
  | 'pierce'
  | 'skillLightning'
  | 'skillBlade'
  | 'skillLaser';

export type SkillId = 'lightning' | 'blade' | 'laser';

export type AudioEventType =
  | 'ui_click'
  | 'player_move_loop'
  | 'monster_swarm_loop'
  | 'player_attack'
  | 'skill_lightning'
  | 'skill_blade'
  | 'skill_laser'
  | 'player_hit'
  | 'monster_die'
  | 'boss_spawn'
  | 'boss_die'
  | 'level_up'
  | 'stage_clear'
  | 'game_over'
  | 'victory';

export interface AudioEvent {
  id: number;
  type: AudioEventType;
  intensity: number;
}

export interface SkillLevels {
  lightning: number;
  blade: number;
  laser: number;
}

export interface SkillCooldowns {
  lightning: number;
  blade: number;
  laser: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  title: string;
  description: string;
  attackStyle: AttackStyle;
  maxHp: number;
  speed: number;
  damage: number;
  attackInterval: number;
  range: number;
  projectiles: number;
  critChance: number;
  armor: number;
  bodyColor: string;
  hairColor: string;
  accentColor: string;
}

export interface MonsterConfig {
  kind: Exclude<MonsterKind, 'boss'>;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  exp: number;
  color: string;
}

export interface BossConfig {
  stageId: number;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  color: string;
}

export interface StageConfig {
  id: number;
  name: string;
  duration: number;
  spawnBaseInterval: number;
  spawnMinInterval: number;
  monsterPool: Array<Exclude<MonsterKind, 'boss'>>;
  floorColorA: string;
  floorColorB: string;
  accent: string;
  boss: BossConfig;
}

export interface Player {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackInterval: number;
  attackCooldown: number;
  range: number;
  projectiles: number;
  critChance: number;
  armor: number;
  magnetRadius: number;
  pierce: number;
  exp: number;
  expToNext: number;
  level: number;
  facing: 1 | -1;
  lastMoveDir: Vec2;
  invincibleTimer: number;
}

export interface Monster {
  id: number;
  kind: MonsterKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  expValue: number;
  isBoss: boolean;
  color: string;
}

export type ProjectileKind = 'default' | 'slash' | 'arrow' | 'magic';

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  pierceLeft: number;
  critChance: number;
  kind: ProjectileKind;
  aoeRadius?: number;
  angle?: number;
}

export interface Gem {
  id: number;
  pos: Vec2;
  value: number;
  radius: number;
}

export interface Particle {
  id: number;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface DamageText {
  id: number;
  pos: Vec2;
  value: number;
  life: number;
  maxLife: number;
  crit: boolean;
}

export interface SlashEffect {
  id: number;
  pos: Vec2;
  radius: number;
  angle: number;
  life: number;
  maxLife: number;
}

export interface BeamEffect {
  id: number;
  from: Vec2;
  to: Vec2;
  life: number;
  maxLife: number;
  color: string;
}

export interface LightningEffect {
  id: number;
  pos: Vec2;
  radius: number;
  life: number;
  maxLife: number;
}

export type BossTelegraphKind = 'circle' | 'line' | 'cone';

export interface BossTelegraph {
  id: number;
  kind: BossTelegraphKind;
  pos: Vec2;
  to: Vec2 | null;
  angle: number;
  arcSpan: number;
  radius: number;
  width: number;
  life: number;
  maxLife: number;
  damage: number;
}

export interface UpgradeOption {
  id: UpgradeType;
  name: string;
  description: string;
}

export interface CameraState {
  x: number;
  y: number;
  shakeX: number;
  shakeY: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface GameSnapshot {
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
  kills: number;
  combo: number;
  bestCombo: number;
  stageIndex: number;
  stageTimeLeft: number;
  bossActive: boolean;
  bossName: string | null;
  bossHp: number;
  bossMaxHp: number;
  skillLevels: SkillLevels;
  skillCooldowns: SkillCooldowns;
  bladeOrbitAngle: number;
  awaitingUpgrade: boolean;
  upgradeChoices: UpgradeOption[];
  pendingLevelUps: number;
  paused: boolean;
  stageClearReady: boolean;
  stageAutoAdvanceLeft: number;
  nextStageIndex: number | null;
  gameOver: boolean;
  victory: boolean;
  playerMoving: boolean;
  playerSpeedRatio: number;
  playerAttackPulse: number;
  impactFlash: number;
  worldWidth: number;
  worldHeight: number;
}

export const WORLD_WIDTH = 5200;
export const WORLD_HEIGHT = 3600;

export const CHARACTER_CONFIGS: Record<CharacterId, CharacterConfig> = {
  warrior: {
    id: 'warrior',
    name: '블레이드 곰돌',
    title: '근접 탱커',
    description: '검기를 날려 넓은 범위의 적을 정리합니다.',
    attackStyle: 'slash_projectile',
    maxHp: 180,
    speed: 255,
    damage: 30,
    attackInterval: 0.75,
    range: 184,
    projectiles: 1,
    critChance: 0.12,
    armor: 0.16,
    bodyColor: '#d64d4d',
    hairColor: '#7f4f24',
    accentColor: '#ffd97d',
  },
  mage: {
    id: 'mage',
    name: '별빛 마도사',
    title: '원거리 광역',
    description: '마법 구체가 적에게 닿으면 폭발하여 범위 피해를 줍니다.',
    attackStyle: 'magic_aoe',
    maxHp: 120,
    speed: 270,
    damage: 24,
    attackInterval: 0.58,
    range: 520,
    projectiles: 1,
    critChance: 0.16,
    armor: 0.05,
    bodyColor: '#5777d9',
    hairColor: '#3d2d86',
    accentColor: '#9ef6ff',
  },
  archer: {
    id: 'archer',
    name: '숲의 레인저',
    title: '고속 연사',
    description: '빠른 화살 연사로 적을 쉴 틈 없이 공격합니다.',
    attackStyle: 'arrow',
    maxHp: 135,
    speed: 305,
    damage: 21,
    attackInterval: 0.32,
    range: 470,
    projectiles: 1,
    critChance: 0.11,
    armor: 0.08,
    bodyColor: '#31a46b',
    hairColor: '#8d5a2a',
    accentColor: '#f4f1bb',
  },
};

export const MONSTER_CONFIGS: Record<Exclude<MonsterKind, 'boss'>, MonsterConfig> = {
  slime: {
    kind: 'slime',
    hp: 28,
    speed: 95,
    radius: 19,
    damage: 8,
    exp: 8,
    color: '#5fcf80',
  },
  bat: {
    kind: 'bat',
    hp: 22,
    speed: 160,
    radius: 15,
    damage: 7,
    exp: 9,
    color: '#6767af',
  },
  skeleton: {
    kind: 'skeleton',
    hp: 44,
    speed: 108,
    radius: 20,
    damage: 10,
    exp: 12,
    color: '#ddd4c5',
  },
  scorpion: {
    kind: 'scorpion',
    hp: 58,
    speed: 124,
    radius: 22,
    damage: 13,
    exp: 14,
    color: '#c88d34',
  },
  mummy: {
    kind: 'mummy',
    hp: 72,
    speed: 90,
    radius: 24,
    damage: 15,
    exp: 16,
    color: '#c0b28a',
  },
  flame: {
    kind: 'flame',
    hp: 82,
    speed: 140,
    radius: 26,
    damage: 18,
    exp: 18,
    color: '#f4683d',
  },
};

export const STAGES: StageConfig[] = [
  {
    id: 1,
    name: '초록 숲',
    duration: 65,
    spawnBaseInterval: 0.9,
    spawnMinInterval: 0.36,
    monsterPool: ['slime', 'bat'],
    floorColorA: '#0a3a2f',
    floorColorB: '#0d4b3f',
    accent: '#7ed957',
    boss: {
      stageId: 1,
      name: '킹 슬라임',
      hp: 1000,
      speed: 92,
      radius: 58,
      damage: 24,
      color: '#79e27e',
    },
  },
  {
    id: 2,
    name: '그림자 동굴',
    duration: 72,
    spawnBaseInterval: 0.78,
    spawnMinInterval: 0.3,
    monsterPool: ['bat', 'skeleton'],
    floorColorA: '#1f2334',
    floorColorB: '#2b3048',
    accent: '#a3b9ff',
    boss: {
      stageId: 2,
      name: '가고일 로드',
      hp: 1400,
      speed: 98,
      radius: 62,
      damage: 28,
      color: '#8a96bf',
    },
  },
  {
    id: 3,
    name: '황혼 사막',
    duration: 80,
    spawnBaseInterval: 0.72,
    spawnMinInterval: 0.27,
    monsterPool: ['scorpion', 'mummy'],
    floorColorA: '#5b3e22',
    floorColorB: '#6f4e2c',
    accent: '#ffd38b',
    boss: {
      stageId: 3,
      name: '사막 포식자',
      hp: 1850,
      speed: 108,
      radius: 66,
      damage: 31,
      color: '#e4a547',
    },
  },
  {
    id: 4,
    name: '용암 지대',
    duration: 88,
    spawnBaseInterval: 0.65,
    spawnMinInterval: 0.24,
    monsterPool: ['flame', 'mummy', 'scorpion'],
    floorColorA: '#4a1616',
    floorColorB: '#651f1f',
    accent: '#ff8248',
    boss: {
      stageId: 4,
      name: '마그마 골렘',
      hp: 2500,
      speed: 95,
      radius: 72,
      damage: 35,
      color: '#ff6d3a',
    },
  },
  {
    id: 5,
    name: '마왕 성채',
    duration: 96,
    spawnBaseInterval: 0.58,
    spawnMinInterval: 0.2,
    monsterPool: ['skeleton', 'flame', 'mummy', 'bat'],
    floorColorA: '#262334',
    floorColorB: '#2f2c40',
    accent: '#ffd166',
    boss: {
      stageId: 5,
      name: '데몬 로드',
      hp: 4200,
      speed: 120,
      radius: 82,
      damage: 42,
      color: '#f05d6c',
    },
  },
];

export const UPGRADES: UpgradeOption[] = [
  {
    id: 'damage',
    name: '날카로운 힘',
    description: '공격력 +15%',
  },
  {
    id: 'attackSpeed',
    name: '연속 베기',
    description: '공격 속도 +15%',
  },
  {
    id: 'maxHp',
    name: '생명력 강화',
    description: '최대 체력 +20',
  },
  {
    id: 'heal',
    name: '응급 처치',
    description: '체력 30 즉시 회복',
  },
  {
    id: 'moveSpeed',
    name: '신속한 발걸음',
    description: '이동 속도 +12%',
  },
  {
    id: 'projectiles',
    name: '추가 탄환',
    description: '투사체 +1',
  },
  {
    id: 'range',
    name: '사거리 확장',
    description: '사거리 +14%',
  },
  {
    id: 'crit',
    name: '치명적 조준',
    description: '치명타 확률 +8%',
  },
  {
    id: 'armor',
    name: '강철 갑주',
    description: '피해 감소 +7%',
  },
  {
    id: 'magnet',
    name: '자석 오브',
    description: '경험치 흡입 범위 +60',
  },
  {
    id: 'pierce',
    name: '관통 강화',
    description: '투사체 관통 +1',
  },
];

export const CAMERA_LERP = 10;
