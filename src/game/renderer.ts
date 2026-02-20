import {
  CHARACTER_CONFIGS,
  STAGES,
  type CharacterId,
  type GameSnapshot,
  type Monster,
  type MonsterKind,
  type Projectile,
} from './types';

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

const withAlpha = (hexColor: string, alpha: number): string => {
  const sanitized = hexColor.replace('#', '');
  if (sanitized.length !== 6) {
    return `rgba(255,255,255,${alpha})`;
  }
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
};

const loadSprite = (src: string): HTMLImageElement => {
  const image = new Image();
  image.src = src;
  image.decoding = 'async';
  return image;
};

interface IndividualSpriteConfig {
  idle: HTMLImageElement;
  walk: HTMLImageElement;
  attack: HTMLImageElement;
  cols: number;
  rows: number;
}

const characterFallbackSprites: Record<CharacterId, HTMLImageElement> = {
  warrior: loadSprite('/assets/characters/warrior.png'),
  mage: loadSprite('/assets/characters/mage.png'),
  archer: loadSprite('/assets/characters/archer.png'),
};

const chibiSheetSprite = loadSprite('/assets/characters/chibi_sheet.png');
const characterSprites: Record<CharacterId, IndividualSpriteConfig> = {
  warrior: {
    idle: loadSprite('/assets/characters/warrior/idle.png'),
    walk: loadSprite('/assets/characters/warrior/walk.png'),
    attack: loadSprite('/assets/characters/warrior/attack.png'),
    cols: 4, rows: 4,
  },
  mage: {
    idle: loadSprite('/assets/characters/mage/idle.png'),
    walk: loadSprite('/assets/characters/mage/walk.png'),
    attack: loadSprite('/assets/characters/mage/attack.png'),
    cols: 4, rows: 4,
  },
  archer: {
    idle: loadSprite('/assets/characters/archer/idle.png'),
    walk: loadSprite('/assets/characters/archer/walk.png'),
    attack: loadSprite('/assets/characters/archer/attack.png'),
    cols: 4, rows: 4,
  },
};

const stageBackgroundSprites: HTMLImageElement[] = [
  loadSprite('/assets/backgrounds/stage_1.png'),
  loadSprite('/assets/backgrounds/stage_2.png'),
  loadSprite('/assets/backgrounds/stage_3.png'),
  loadSprite('/assets/backgrounds/stage_4.png'),
  loadSprite('/assets/backgrounds/stage_5.png'),
];

const monsterSprites: Record<MonsterKind, HTMLImageElement> = {
  slime: loadSprite('/assets/monsters/slime.png'),
  bat: loadSprite('/assets/monsters/bat.png'),
  skeleton: loadSprite('/assets/monsters/skeleton.png'),
  scorpion: loadSprite('/assets/monsters/scorpion.png'),
  mummy: loadSprite('/assets/monsters/mummy.png'),
  flame: loadSprite('/assets/monsters/flame.png'),
  boss: loadSprite('/assets/bosses/king_slime.png'),
};

const stageBossSprites: Array<HTMLImageElement> = [
  loadSprite('/assets/bosses/king_slime.png'),
  loadSprite('/assets/bosses/gargoyle_lord.png'),
  loadSprite('/assets/bosses/desert_predator.png'),
  loadSprite('/assets/bosses/magma_golem.png'),
  loadSprite('/assets/bosses/demon_lord.png'),
];

export interface RenderOptions {
  reducedFx: boolean;
  showDamageTexts: boolean;
  showMiniMap: boolean;
  highContrastTelegraphs: boolean;
}

export const WORLD_RENDER_SCALE = 0.6;

export class GameRenderer {
  private readonly stagePatternCache = new Map<number, CanvasPattern | null>();

  private readonly spriteTrimCache = new WeakMap<object, { sx: number; sy: number; sw: number; sh: number }>();

  private readonly sanitizedSpriteCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

  private readonly sanitizedAggressiveSpriteCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

  private viewMinX = 0;

  private viewMinY = 0;

  private viewMaxX = 0;

  private viewMaxY = 0;

  private isVisible(x: number, y: number, padding = 0): boolean {
    return (
      x + padding >= this.viewMinX &&
      x - padding <= this.viewMaxX &&
      y + padding >= this.viewMinY &&
      y - padding <= this.viewMaxY
    );
  }

  /**
   * Strip near-transparent and bright grayish fringe pixels from a sprite
   * to eliminate checkered-background artifacts from AI-generated PNGs.
   */
  private getSanitizedSprite(image: HTMLImageElement, aggressive = false): HTMLImageElement | HTMLCanvasElement {
    if (!image.complete || image.naturalWidth <= 0) return image;
    const cache = aggressive ? this.sanitizedAggressiveSpriteCache : this.sanitizedSpriteCache;
    const cached = cache.get(image);
    if (cached) return cached;
    if (typeof document === 'undefined') return image;

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const sctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) return image;

    sctx.drawImage(image, 0, 0);
    const imgData = sctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!;
      if (a < 25) { d[i + 3] = 0; continue; }
      if (a < 100) {
        const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        // Bright, low-saturation, semi-transparent = fringe / checkerboard
        if (mx > 160 && mx - mn < 40) { d[i + 3] = 0; }
      }
    }
    if (aggressive) {
      const w = canvas.width;
      const h = canvas.height;
      const idx = (x: number, y: number): number => (y * w + x) * 4;
      const isBgLike = (x: number, y: number): boolean => {
        const i = idx(x, y);
        const a = d[i + 3] ?? 0;
        if (a <= 28) {
          return true;
        }
        const r = d[i] ?? 0;
        const g = d[i + 1] ?? 0;
        const b = d[i + 2] ?? 0;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = mx - mn;
        return sat <= 24 && mx >= 58 && mx <= 218;
      };

      let borderBg = 0;
      let borderTotal = 0;
      for (let x = 0; x < w; x += 1) {
        borderTotal += 2;
        if (isBgLike(x, 0)) borderBg += 1;
        if (isBgLike(x, h - 1)) borderBg += 1;
      }
      for (let y = 1; y < h - 1; y += 1) {
        borderTotal += 2;
        if (isBgLike(0, y)) borderBg += 1;
        if (isBgLike(w - 1, y)) borderBg += 1;
      }

      if (borderTotal > 0 && borderBg / borderTotal > 0.05) {
        const visited = new Uint8Array(w * h);
        const queueX: number[] = [];
        const queueY: number[] = [];
        const enqueue = (x: number, y: number): void => {
          if (x < 0 || x >= w || y < 0 || y >= h) {
            return;
          }
          const vi = y * w + x;
          if (visited[vi]) {
            return;
          }
          visited[vi] = 1;
          if (!isBgLike(x, y)) {
            return;
          }
          queueX.push(x);
          queueY.push(y);
        };

        for (let x = 0; x < w; x += 1) {
          enqueue(x, 0);
          enqueue(x, h - 1);
        }
        for (let y = 1; y < h - 1; y += 1) {
          enqueue(0, y);
          enqueue(w - 1, y);
        }

        while (queueX.length > 0) {
          const x = queueX.pop();
          const y = queueY.pop();
          if (x === undefined || y === undefined) {
            continue;
          }
          const i = idx(x, y);
          d[i + 3] = 0;
          enqueue(x + 1, y);
          enqueue(x - 1, y);
          enqueue(x, y + 1);
          enqueue(x, y - 1);
        }
      }
    }

    sctx.putImageData(imgData, 0, 0);
    cache.set(image, canvas);
    return canvas;
  }

  render(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    characterId: CharacterId,
    viewportWidth: number,
    viewportHeight: number,
    nowMs: number,
    options: RenderOptions,
  ): void {
    const stage = STAGES[snapshot.stageIndex] ?? STAGES[STAGES.length - 1]!;
    const worldViewWidth = viewportWidth / WORLD_RENDER_SCALE;
    const worldViewHeight = viewportHeight / WORLD_RENDER_SCALE;
    const camX = snapshot.camera.x - worldViewWidth * 0.5 + snapshot.camera.shakeX;
    const camY = snapshot.camera.y - worldViewHeight * 0.5 + snapshot.camera.shakeY;
    this.viewMinX = camX;
    this.viewMinY = camY;
    this.viewMaxX = camX + worldViewWidth;
    this.viewMaxY = camY + worldViewHeight;

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(WORLD_RENDER_SCALE, WORLD_RENDER_SCALE);
    ctx.translate(-camX, -camY);

    this.drawStageBackground(
      ctx,
      stage.floorColorA,
      stage.floorColorB,
      stage.accent,
      snapshot,
      snapshot.stageIndex,
      camX,
      camY,
      worldViewWidth,
      worldViewHeight,
    );
    this.drawBossTelegraphs(ctx, snapshot, nowMs, options.highContrastTelegraphs);
    this.drawGems(ctx, snapshot);
    this.drawProjectiles(ctx, snapshot, stage.accent);
    this.drawSlashes(ctx, snapshot);

    for (const monster of snapshot.monsters) {
      if (!this.isVisible(monster.pos.x, monster.pos.y, monster.radius * 2.2)) {
        continue;
      }
      this.drawMonster(ctx, monster, nowMs, snapshot.stageIndex);
      this.drawMonsterHp(ctx, monster);
    }

    this.drawBeams(ctx, snapshot);
    this.drawLightnings(ctx, snapshot, nowMs);
    this.drawBladeOrbit(ctx, snapshot, nowMs);
    this.drawPlayer(ctx, snapshot, characterId, nowMs);
    if (!options.reducedFx) {
      this.drawParticles(ctx, snapshot);
    }
    if (options.showDamageTexts) {
      this.drawDamageTexts(ctx, snapshot);
    }

    ctx.restore();

    this.drawVignette(ctx, viewportWidth, viewportHeight, stage.accent);
    this.drawImpactFlash(ctx, viewportWidth, viewportHeight, snapshot);
    if (options.showMiniMap) {
      this.drawMiniMap(ctx, snapshot, viewportWidth, viewportHeight);
    }
    this.drawBossBar(ctx, snapshot, viewportWidth);
  }

  private drawBossTelegraphs(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    nowMs: number,
    highContrast: boolean,
  ): void {
    if (snapshot.bossTelegraphs.length <= 0) {
      return;
    }

    const palette = highContrast
      ? {
        fill: '#ff2b2b',
        mid: '#fff400',
        hard: '#ffffff',
      }
      : {
        fill: '#ff755d',
        mid: '#ffd5c1',
        hard: '#ff3d3d',
      };

    for (const telegraph of snapshot.bossTelegraphs) {
      const ratio = clamp(telegraph.life / telegraph.maxLife, 0, 1);
      const progress = 1 - ratio;
      const pulse = 0.55 + Math.sin(nowMs * 0.02 + telegraph.id) * 0.45;

      if (telegraph.kind === 'line' && telegraph.to) {
        const dx = telegraph.to.x - telegraph.pos.x;
        const dy = telegraph.to.y - telegraph.pos.y;
        const px = telegraph.pos.x + dx * progress;
        const py = telegraph.pos.y + dy * progress;

        ctx.strokeStyle = withAlpha(palette.fill, 0.2 + progress * 0.15);
        ctx.lineWidth = telegraph.width * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(telegraph.pos.x, telegraph.pos.y);
        ctx.lineTo(telegraph.to.x, telegraph.to.y);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(palette.mid, 0.38 + pulse * 0.32);
        ctx.lineWidth = telegraph.width * 0.8;
        ctx.beginPath();
        ctx.moveTo(telegraph.pos.x, telegraph.pos.y);
        ctx.lineTo(telegraph.to.x, telegraph.to.y);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(palette.hard, 0.8);
        ctx.lineWidth = Math.max(4, telegraph.width * 0.28);
        ctx.beginPath();
        ctx.moveTo(telegraph.pos.x, telegraph.pos.y);
        ctx.lineTo(px, py);
        ctx.stroke();
        continue;
      }

      if (telegraph.kind === 'cone') {
        const start = telegraph.angle - telegraph.arcSpan * 0.5;
        const end = telegraph.angle + telegraph.arcSpan * 0.5;
        ctx.fillStyle = withAlpha(palette.fill, 0.13 + progress * 0.08);
        ctx.beginPath();
        ctx.moveTo(telegraph.pos.x, telegraph.pos.y);
        ctx.arc(telegraph.pos.x, telegraph.pos.y, telegraph.radius, start, end);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = withAlpha(palette.mid, 0.36 + pulse * 0.3);
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(telegraph.pos.x, telegraph.pos.y, telegraph.radius, start, end);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(palette.hard, 0.84);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(telegraph.pos.x, telegraph.pos.y, telegraph.radius - 6, start, start + (end - start) * progress);
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = withAlpha(palette.fill, 0.12 + progress * 0.08);
      ctx.beginPath();
      ctx.arc(telegraph.pos.x, telegraph.pos.y, telegraph.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = withAlpha(palette.mid, 0.32 + pulse * 0.35);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(telegraph.pos.x, telegraph.pos.y, telegraph.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(palette.hard, 0.64);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(
        telegraph.pos.x,
        telegraph.pos.y,
        telegraph.radius - 4,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress,
      );
      ctx.stroke();
    }
  }

  private drawStageBackground(
    ctx: CanvasRenderingContext2D,
    colorA: string,
    colorB: string,
    accent: string,
    snapshot: GameSnapshot,
    stageIndex: number,
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
  ): void {
    const stageTexture = stageBackgroundSprites[stageIndex];
    let textured = false;

    if (stageTexture && stageTexture.complete && stageTexture.naturalWidth > 0) {
      let pattern = this.stagePatternCache.get(stageIndex);
      if (pattern === undefined) {
        pattern = ctx.createPattern(stageTexture, 'repeat');
        this.stagePatternCache.set(stageIndex, pattern);
      }
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(viewX, viewY, viewWidth, viewHeight);
        textured = true;
      }
    }

    if (!textured) {
      const gradient = ctx.createLinearGradient(0, 0, snapshot.worldWidth, snapshot.worldHeight);
      gradient.addColorStop(0, colorA);
      gradient.addColorStop(1, colorB);
      ctx.fillStyle = gradient;
      ctx.fillRect(viewX, viewY, viewWidth, viewHeight);
    }

    const tint = ctx.createLinearGradient(0, viewY, 0, viewY + viewHeight);
    tint.addColorStop(0, withAlpha(colorA, textured ? 0.14 : 0.28));
    tint.addColorStop(1, withAlpha(colorB, textured ? 0.2 : 0.35));
    ctx.fillStyle = tint;
    ctx.fillRect(viewX, viewY, viewWidth, viewHeight);

    const tile = 128;
    ctx.globalAlpha = 0.025;
    const startY = Math.floor(viewY / tile) * tile;
    const endY = viewY + viewHeight + tile;
    const startX = Math.floor(viewX / tile) * tile;
    const endX = viewX + viewWidth + tile;
    for (let y = startY; y < endY; y += tile) {
      for (let x = startX; x < endX; x += tile) {
        ctx.fillStyle = (x / tile + y / tile) % 2 === 0 ? withAlpha('#ffffff', 0.08) : 'transparent';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    ctx.globalAlpha = 1;

    if (!textured) {
      ctx.strokeStyle = withAlpha(accent, 0.08);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i += 1) {
        const x = ((i + 0.5) / 10) * snapshot.worldWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.sin(i * 0.7) * 80, snapshot.worldHeight);
        ctx.stroke();
      }
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    characterId: CharacterId,
    nowMs: number,
  ): void {
    const cfg = CHARACTER_CONFIGS[characterId];
    const p = snapshot.player;
    const t = nowMs * 0.006;
    const bob = Math.sin(t) * 1.8;
    const attackPulse = clamp(snapshot.playerAttackPulse, 0, 1);
    const attackKick =
      attackPulse *
      (characterId === 'archer'
        ? -4.2
        : characterId === 'warrior'
          ? 2.4
          : -2.2);
    const attackLift = attackPulse * (characterId === 'warrior' ? 2.7 : 1.7);
    const attackRotate =
      attackPulse *
      (characterId === 'warrior'
        ? 0.16
        : characterId === 'archer'
          ? -0.1
          : 0.06);

    ctx.save();
    ctx.translate(Math.round(p.pos.x), Math.round(p.pos.y + bob));

    const spriteCfg = characterSprites[characterId];
    const fallbackSprite = characterFallbackSprites[characterId];
    const isAttackPose = attackPulse > 0.04;

    // Pick the correct sheet based on state
    const activeSheet = isAttackPose ? spriteCfg.attack
      : snapshot.playerMoving ? spriteCfg.walk
        : spriteCfg.idle;

    if (activeSheet.complete && activeSheet.naturalWidth > 0) {
      const cols = spriteCfg.cols; // 4
      const rows = spriteCfg.rows; // 4
      const frameW = activeSheet.naturalWidth / cols;
      const frameH = activeSheet.naturalHeight / rows;
      const speedRatio = Math.max(0.08, snapshot.playerSpeedRatio);

      // Direction row: 0=Down, 1=Up, 2=Left, 3=Right
      let dirRow = 0;
      if (Math.abs(p.lastMoveDir.x) > Math.abs(p.lastMoveDir.y)) {
        dirRow = p.lastMoveDir.x > 0 ? 3 : 2;
      } else {
        dirRow = p.lastMoveDir.y < 0 ? 1 : 0;
      }

      let frameIdx: number;
      if (isAttackPose) {
        const attackProgress = clamp(1 - attackPulse, 0, 0.999);
        frameIdx = Math.min(cols - 1, Math.floor(attackProgress * cols));
      } else {
        frameIdx = snapshot.playerMoving
          ? Math.floor(nowMs * (0.003 + speedRatio * 0.008)) % cols
          : Math.floor(nowMs * 0.002) % cols;
      }
      const sx = frameIdx * frameW;
      const sy = dirRow * frameH;

      const stepPhase = isAttackPose
        ? Math.sin(nowMs * 0.015) * 0.2
        : snapshot.playerMoving
          ? Math.sin(nowMs * (0.007 + speedRatio * 0.012))
          : Math.sin(nowMs * 0.004) * 0.2;
      const moveBob = snapshot.playerMoving ? Math.abs(stepPhase) * (1.5 + speedRatio * 2.0) : stepPhase * 0.6;

      const aspect = frameW / frameH;
      const drawH = Math.max(p.radius * (characterId === 'mage' ? 6.35 : 6.18), 146);
      const drawW = drawH * aspect;

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 6, Math.max(12, drawW * 0.29), 8.5, 0, 0, Math.PI * 2);
      ctx.fill();

      const sanitized = this.getSanitizedSprite(activeSheet);

      ctx.save();
      ctx.translate(0, moveBob - attackLift);
      if (snapshot.playerMoving) {
        ctx.rotate(stepPhase * (0.009 + speedRatio * 0.014) * p.facing + attackRotate * p.facing);
      } else {
        ctx.rotate(attackRotate * p.facing);
      }
      ctx.scale(1, 1);

      ctx.drawImage(
        sanitized,
        sx,
        sy,
        frameW,
        frameH,
        -drawW / 2,
        -drawH * 0.8,
        drawW,
        drawH,
      );
      ctx.restore();

      this.drawPlayerInvincibleRing(ctx, p);

      ctx.restore();

      this.drawPlayerMagnetRing(ctx, p);
      return;
    }

    if (fallbackSprite.complete && fallbackSprite.naturalWidth > 0) {
      const speedRatio = Math.max(0.08, snapshot.playerSpeedRatio);
      const stepPhase = snapshot.playerMoving
        ? Math.sin(nowMs * (0.0108 + speedRatio * 0.018))
        : Math.sin(nowMs * 0.006) * 0.25;
      const trim = this.getTrimmedBounds(fallbackSprite);
      const aspect = trim.sw / trim.sh;
      const drawH = p.radius * 5.52;
      const drawW = drawH * aspect;

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 6, Math.max(12, drawW * 0.32), 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(attackKick * p.facing, stepPhase * (1.2 + speedRatio * 1.3) - attackLift);
      if (snapshot.playerMoving) {
        ctx.rotate(stepPhase * 0.05 * p.facing + attackRotate * p.facing);
      } else {
        ctx.rotate(attackRotate * p.facing);
      }
      ctx.scale(p.facing, 1);
      ctx.drawImage(fallbackSprite, trim.sx, trim.sy, trim.sw, trim.sh, -drawW / 2, -drawH * 0.72, drawW, drawH);
      ctx.restore();

      this.drawPlayerInvincibleRing(ctx, p);

      ctx.restore();

      this.drawPlayerMagnetRing(ctx, p);
      return;
    }

    if (chibiSheetSprite.complete && chibiSheetSprite.naturalWidth > 0) {
      const cols = 3;
      const rows = 4;
      const frameW = chibiSheetSprite.naturalWidth / cols;
      const frameH = chibiSheetSprite.naturalHeight / rows;
      const walkFrames = [6, 7, 8, 7];
      const idleFrames = [7, 7, 7, 7];
      const seq = snapshot.playerMoving ? walkFrames : idleFrames;
      const frameIndex = seq[Math.floor(nowMs * (snapshot.playerMoving ? 0.011 : 0.0035)) % seq.length] ?? 7;
      const sx = (frameIndex % cols) * frameW;
      const sy = Math.floor(frameIndex / cols) * frameH;

      const aspect = frameW / frameH;
      const drawH = p.radius * 5.8;
      const drawW = drawH * aspect;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 6, Math.max(12, drawW * 0.3), 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(attackKick * p.facing, -attackLift);
      if (!snapshot.playerMoving && attackPulse > 0.01) {
        ctx.rotate(attackRotate * p.facing);
      }
      ctx.scale(p.facing, 1);
      ctx.drawImage(chibiSheetSprite, sx, sy, frameW, frameH, -drawW / 2, -drawH * 0.78, drawW, drawH);
      ctx.restore();

      this.drawPlayerInvincibleRing(ctx, p);

      ctx.restore();

      this.drawPlayerMagnetRing(ctx, p);
      return;
    }

    ctx.fillStyle = cfg.bodyColor;
    drawRoundedRect(ctx, -13, -2, 26, 29, 10);
    ctx.fill();
    ctx.restore();

    this.drawPlayerMagnetRing(ctx, p);
  }

  private drawPlayerInvincibleRing(ctx: CanvasRenderingContext2D, player: GameSnapshot['player']): void {
    if (player.invincibleTimer <= 0) {
      return;
    }
    ctx.strokeStyle = 'rgba(255,245,215,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -6, 28, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawPlayerMagnetRing(ctx: CanvasRenderingContext2D, player: GameSnapshot['player']): void {
    ctx.strokeStyle = 'rgba(160,255,220,0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.pos.x, player.pos.y, player.magnetRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  private getTrimmedBounds(image: HTMLImageElement | HTMLCanvasElement): { sx: number; sy: number; sw: number; sh: number } {
    const cached = this.spriteTrimCache.get(image);
    if (cached) {
      return cached;
    }

    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

    const fallback = {
      sx: 0,
      sy: 0,
      sw: width,
      sh: height,
    };

    if (typeof document === 'undefined' || width <= 0 || height <= 0) {
      this.spriteTrimCache.set(image, fallback);
      return fallback;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const trimCtx = canvas.getContext('2d');
    if (!trimCtx) {
      this.spriteTrimCache.set(image, fallback);
      return fallback;
    }

    trimCtx.clearRect(0, 0, canvas.width, canvas.height);
    trimCtx.drawImage(image, 0, 0);
    const pixels = trimCtx.getImageData(0, 0, canvas.width, canvas.height).data;

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3] ?? 0;
        if (alpha <= 10) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      this.spriteTrimCache.set(image, fallback);
      return fallback;
    }

    const bounds = {
      sx: minX,
      sy: minY,
      sw: Math.max(1, maxX - minX + 1),
      sh: Math.max(1, maxY - minY + 1),
    };
    this.spriteTrimCache.set(image, bounds);
    return bounds;
  }

  private drawBladeOrbit(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot, nowMs: number): void {
    const level = snapshot.skillLevels.blade;
    if (level <= 0) {
      return;
    }

    const count = Math.min(6, 1 + level);
    const radius = 62 + level * 9;
    const pulse = (Math.sin(nowMs * 0.009) + 1) * 0.5;

    for (let i = 0; i < count; i += 1) {
      const angle = snapshot.bladeOrbitAngle + (i / count) * Math.PI * 2;
      const x = snapshot.player.pos.x + Math.cos(angle) * radius;
      const y = snapshot.player.pos.y + Math.sin(angle) * radius;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);

      ctx.fillStyle = withAlpha('#fffbe6', 0.85);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 5);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = withAlpha('#f8b26a', 0.95);
      ctx.fillRect(-2.5, 5, 5, 6);

      ctx.strokeStyle = withAlpha('#fff7d1', 0.35 + pulse * 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 13 + pulse * 2.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawBeams(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    for (const beam of snapshot.beams) {
      const minX = Math.min(beam.from.x, beam.to.x);
      const maxX = Math.max(beam.from.x, beam.to.x);
      const minY = Math.min(beam.from.y, beam.to.y);
      const maxY = Math.max(beam.from.y, beam.to.y);
      if (
        maxX < this.viewMinX - 80 ||
        minX > this.viewMaxX + 80 ||
        maxY < this.viewMinY - 80 ||
        minY > this.viewMaxY + 80
      ) {
        continue;
      }
      const alpha = clamp(beam.life / beam.maxLife, 0, 1);
      const beamColor = beam.color || '#f8b4ff';
      ctx.strokeStyle = withAlpha(beamColor, 0.86 * alpha);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();

      ctx.strokeStyle = withAlpha('#ffffff', 0.95 * alpha);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(beamColor, 0.45 * alpha);
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(beam.from.x, beam.from.y);
      ctx.lineTo(beam.to.x, beam.to.y);
      ctx.stroke();
    }
  }

  private drawLightnings(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot, nowMs: number): void {
    for (const strike of snapshot.lightnings) {
      if (!this.isVisible(strike.pos.x, strike.pos.y, strike.radius * 1.25)) {
        continue;
      }
      const alpha = clamp(strike.life / strike.maxLife, 0, 1);
      const segments = 7;
      const startY = strike.pos.y - strike.radius;
      ctx.strokeStyle = withAlpha('#9ef6ff', alpha);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(strike.pos.x, startY);
      for (let i = 1; i <= segments; i += 1) {
        const y = startY + (i / segments) * strike.radius * 1.7;
        const jitter = Math.sin(nowMs * 0.04 + i * 1.7 + strike.id) * 8;
        const x = strike.pos.x + jitter;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.9);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(strike.pos.x, startY);
      for (let i = 1; i <= segments; i += 1) {
        const y = startY + (i / segments) * strike.radius * 1.7;
        const jitter = Math.sin(nowMs * 0.04 + i * 1.7 + strike.id + 9.1) * 5;
        const x = strike.pos.x + jitter;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      const glow = ctx.createRadialGradient(
        strike.pos.x,
        strike.pos.y,
        2,
        strike.pos.x,
        strike.pos.y,
        strike.radius,
      );
      glow.addColorStop(0, withAlpha('#ffffff', alpha * 0.9));
      glow.addColorStop(1, withAlpha('#9ef6ff', 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(strike.pos.x, strike.pos.y, strike.radius * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMonster(ctx: CanvasRenderingContext2D, monster: Monster, nowMs: number, stageIndex: number): void {
    const t = nowMs * 0.005 + monster.id * 0.1;
    const wobble = Math.sin(t) * 2;

    ctx.save();
    ctx.translate(Math.round(monster.pos.x), Math.round(monster.pos.y + wobble));

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, monster.radius * 0.75, monster.radius * 0.75, monster.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    const sprite =
      monster.kind === 'boss'
        ? stageBossSprites[stageIndex] ?? monsterSprites.boss
        : monsterSprites[monster.kind];

    if (sprite.complete && sprite.naturalWidth > 0) {
      const sanitized = this.getSanitizedSprite(sprite, !monster.isBoss);
      const trim = this.getTrimmedBounds(sanitized);
      const aspect = trim.sw / trim.sh;
      const drawH = monster.radius * (monster.isBoss ? 3.95 : 3.4);
      const drawW = drawH * aspect;
      ctx.drawImage(sanitized, trim.sx, trim.sy, trim.sw, trim.sh, -drawW / 2, -drawH * 0.66, drawW, drawH);
      ctx.restore();
      return;
    }

    ctx.fillStyle = monster.color;
    ctx.beginPath();
    ctx.arc(0, 0, monster.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMonsterHp(ctx: CanvasRenderingContext2D, monster: Monster): void {
    const w = monster.radius * 1.65;
    const h = 5;
    const x = monster.pos.x - w / 2;
    const y = monster.pos.y - monster.radius - 14;
    const ratio = clamp(monster.hp / monster.maxHp, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    drawRoundedRect(ctx, x, y, w, h, 3);
    ctx.fill();

    ctx.fillStyle = monster.isBoss ? '#ffd166' : '#6ee7b7';
    drawRoundedRect(ctx, x, y, w * ratio, h, 3);
    ctx.fill();
  }

  private drawProjectiles(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    accentColor: string,
  ): void {
    for (const projectile of snapshot.projectiles) {
      if (!this.isVisible(projectile.pos.x, projectile.pos.y, 110)) {
        continue;
      }
      const lifeRatio = projectile.life / projectile.maxLife;

      if (projectile.kind === 'slash') {
        this.drawSlashProjectile(ctx, projectile, lifeRatio);
      } else if (projectile.kind === 'arrow') {
        this.drawArrowProjectile(ctx, projectile, lifeRatio);
      } else if (projectile.kind === 'magic') {
        this.drawMagicProjectile(ctx, projectile, lifeRatio);
      } else {
        this.drawDefaultProjectile(ctx, projectile, lifeRatio, accentColor);
      }
    }
  }

  private drawSlashProjectile(
    ctx: CanvasRenderingContext2D,
    projectile: Projectile,
    lifeRatio: number,
  ): void {
    const alpha = clamp(lifeRatio * 1.2, 0, 1);
    const angle = projectile.angle ?? Math.atan2(projectile.vel.y, projectile.vel.x);
    const radius = 28 + (1 - lifeRatio) * 16;

    ctx.save();
    ctx.translate(projectile.pos.x, projectile.pos.y);

    // Slash arc trail
    ctx.strokeStyle = withAlpha('#ffd97d', alpha * 0.85);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius, angle - 0.9, angle + 0.9);
    ctx.stroke();

    // Inner glow
    ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.7);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 5, angle - 0.8, angle + 0.8);
    ctx.stroke();

    // Outer glow
    ctx.strokeStyle = withAlpha('#ffae42', alpha * 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 5, angle - 0.7, angle + 0.7);
    ctx.stroke();

    ctx.restore();
  }

  private drawArrowProjectile(
    ctx: CanvasRenderingContext2D,
    projectile: Projectile,
    lifeRatio: number,
  ): void {
    const alpha = clamp(lifeRatio * 1.5, 0, 1);
    const angle = projectile.angle ?? Math.atan2(projectile.vel.y, projectile.vel.x);
    const length = 20;
    const tailLength = 10;

    ctx.save();
    ctx.translate(projectile.pos.x, projectile.pos.y);
    ctx.rotate(angle);

    // Trail glow
    ctx.strokeStyle = withAlpha('#d8c39a', alpha * 0.45);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-length - tailLength, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();

    // Arrow shaft
    ctx.strokeStyle = withAlpha('#8B5E3C', alpha);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.lineTo(length * 0.4, 0);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = withAlpha('#e4e7eb', alpha);
    ctx.beginPath();
    ctx.moveTo(length, 0);
    ctx.lineTo(length * 0.32, -4.5);
    ctx.lineTo(length * 0.32, 4.5);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.strokeStyle = withAlpha('#f4f1bb', alpha * 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-length, -4);
    ctx.lineTo(-length + 6, 0);
    ctx.lineTo(-length, 4);
    ctx.stroke();

    ctx.restore();
  }

  private drawMagicProjectile(
    ctx: CanvasRenderingContext2D,
    projectile: Projectile,
    lifeRatio: number,
  ): void {
    const alpha = clamp(lifeRatio * 1.3, 0, 1);
    const radius = projectile.radius * (0.8 + lifeRatio * 0.4);
    const nowMs = performance.now();
    const pulse = 1 + Math.sin(nowMs * 0.015) * 0.15;

    // Outer glow
    const gradient = ctx.createRadialGradient(
      projectile.pos.x, projectile.pos.y, 1,
      projectile.pos.x, projectile.pos.y, radius * 3 * pulse,
    );
    gradient.addColorStop(0, withAlpha('#e0b0ff', alpha * 0.8));
    gradient.addColorStop(0.5, withAlpha('#9370DB', alpha * 0.4));
    gradient.addColorStop(1, withAlpha('#7B2FBE', 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(projectile.pos.x, projectile.pos.y, radius * 3 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = withAlpha('#f0e6ff', alpha);
    ctx.beginPath();
    ctx.arc(projectile.pos.x, projectile.pos.y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle
    ctx.fillStyle = withAlpha('#ffffff', alpha * 0.9);
    ctx.beginPath();
    ctx.arc(projectile.pos.x, projectile.pos.y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDefaultProjectile(
    ctx: CanvasRenderingContext2D,
    projectile: Projectile,
    lifeRatio: number,
    accentColor: string,
  ): void {
    const radius = projectile.radius * (0.7 + lifeRatio * 0.45);
    const tailX = projectile.pos.x - projectile.vel.x * 0.026;
    const tailY = projectile.pos.y - projectile.vel.y * 0.026;
    ctx.strokeStyle = withAlpha(accentColor, 0.38);
    ctx.lineWidth = radius * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(projectile.pos.x, projectile.pos.y);
    ctx.stroke();
    const gradient = ctx.createRadialGradient(
      projectile.pos.x, projectile.pos.y, 1,
      projectile.pos.x, projectile.pos.y, radius * 2,
    );
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, withAlpha(accentColor, 0.1));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(projectile.pos.x, projectile.pos.y, radius * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(projectile.pos.x, projectile.pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGems(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    for (const gem of snapshot.gems) {
      if (!this.isVisible(gem.pos.x, gem.pos.y, gem.radius + 6)) {
        continue;
      }
      ctx.fillStyle = '#7ef5d6';
      ctx.beginPath();
      ctx.moveTo(gem.pos.x, gem.pos.y - gem.radius);
      ctx.lineTo(gem.pos.x + gem.radius, gem.pos.y);
      ctx.lineTo(gem.pos.x, gem.pos.y + gem.radius);
      ctx.lineTo(gem.pos.x - gem.radius, gem.pos.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(gem.pos.x - 1.5, gem.pos.y - 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    for (const particle of snapshot.particles) {
      if (!this.isVisible(particle.pos.x, particle.pos.y, particle.size + 6)) {
        continue;
      }
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = withAlpha(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(particle.pos.x, particle.pos.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDamageTexts(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    for (const text of snapshot.damageTexts) {
      if (!this.isVisible(text.pos.x, text.pos.y, 36)) {
        continue;
      }
      const alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = text.crit ? 'bold 22px "Jua", sans-serif' : 'bold 18px "Jua", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = text.crit ? '#ffe066' : '#ffffff';
      ctx.fillText(String(text.value), text.pos.x, text.pos.y);
      ctx.globalAlpha = 1;
    }
  }

  private drawSlashes(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    for (const slash of snapshot.slashes) {
      if (!this.isVisible(slash.pos.x, slash.pos.y, slash.radius + 20)) {
        continue;
      }
      const alpha = clamp(slash.life / slash.maxLife, 0, 1);
      ctx.strokeStyle = withAlpha('#fff7d1', alpha * 0.9);
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(
        slash.pos.x,
        slash.pos.y,
        slash.radius,
        slash.angle - 0.75,
        slash.angle + 0.75,
      );
      ctx.stroke();

      ctx.strokeStyle = withAlpha('#ffae42', alpha * 0.8);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(
        slash.pos.x,
        slash.pos.y,
        slash.radius - 6,
        slash.angle - 0.7,
        slash.angle + 0.7,
      );
      ctx.stroke();

      ctx.strokeStyle = withAlpha('#ffffff', alpha * 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        slash.pos.x,
        slash.pos.y,
        slash.radius - 13,
        slash.angle - 0.66,
        slash.angle + 0.66,
      );
      ctx.stroke();
    }
  }

  private drawVignette(
    ctx: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number,
    accent: string,
  ): void {
    const v = ctx.createRadialGradient(
      viewportWidth / 2,
      viewportHeight / 2,
      viewportHeight * 0.12,
      viewportWidth / 2,
      viewportHeight / 2,
      viewportWidth * 0.7,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    ctx.strokeStyle = withAlpha(accent, 0.32);
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, viewportWidth - 20, viewportHeight - 20);
  }

  private drawImpactFlash(
    ctx: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number,
    snapshot: GameSnapshot,
  ): void {
    // Disabled on purpose to remove screen flicker.
    void ctx;
    void viewportWidth;
    void viewportHeight;
    void snapshot;
  }

  private drawMiniMap(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const w = 170;
    const h = 104;
    const x = viewportWidth - w - 22;
    const y = viewportHeight - h - 22;

    ctx.fillStyle = 'rgba(12,14,22,0.62)';
    drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.stroke();

    const sx = w / snapshot.worldWidth;
    const sy = h / snapshot.worldHeight;

    const p = snapshot.player;
    ctx.fillStyle = '#a7f3d0';
    ctx.beginPath();
    ctx.arc(x + p.pos.x * sx, y + p.pos.y * sy, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f97373';
    const limit = Math.min(snapshot.monsters.length, 80);
    for (let i = 0; i < limit; i += 1) {
      const m = snapshot.monsters[i]!;
      ctx.fillRect(x + m.pos.x * sx, y + m.pos.y * sy, 1.5, 1.5);
    }

    ctx.fillStyle = '#7ef5d6';
    const gemLimit = Math.min(snapshot.gems.length, 60);
    for (let i = 0; i < gemLimit; i += 1) {
      const g = snapshot.gems[i]!;
      ctx.fillRect(x + g.pos.x * sx, y + g.pos.y * sy, 1.2, 1.2);
    }
  }

  private drawBossBar(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot, viewportWidth: number): void {
    if (!snapshot.bossActive || snapshot.bossMaxHp <= 0) {
      return;
    }

    const ratio = clamp(snapshot.bossHp / snapshot.bossMaxHp, 0, 1);
    const w = Math.min(620, viewportWidth - 100);
    const x = viewportWidth / 2 - w / 2;
    const y = 22;

    ctx.fillStyle = 'rgba(8,8,12,0.7)';
    drawRoundedRect(ctx, x, y, w, 24, 10);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,98,98,0.95)';
    drawRoundedRect(ctx, x + 3, y + 3, (w - 6) * ratio, 18, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 14px "Jua", sans-serif';
    const label = snapshot.bossName ?? 'BOSS';
    ctx.fillText(label, viewportWidth / 2, y + 16);
  }
}
