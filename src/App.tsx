import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AudioManager } from './audio/AudioManager';
import { GameEngine } from './game/engine';
import { GameRenderer, WORLD_RENDER_SCALE } from './game/renderer';
import {
  CHARACTER_CONFIGS,
  STAGES,
  type CharacterId,
  type GameSnapshot,
  type InputState,
  type AudioEventType,
  type BossTelegraphKind,
  type UpgradeType,
  type Vec2,
} from './game/types';

type Screen = 'title' | 'select' | 'playing';
type UiFlags = {
  awaitingUpgrade: boolean;
  stageClearReady: boolean;
  gameOver: boolean;
  victory: boolean;
  paused: boolean;
  stageIndex: number;
};

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const HUD_SYNC_INTERVAL_MS = 66;
const CHARACTER_PORTRAITS: Record<CharacterId, string> = {
  warrior: '/assets/characters/warrior.png',
  mage: '/assets/characters/chibi_portrait.png',
  archer: '/assets/characters/archer.png',
};

const formatTime = (seconds: number): string => {
  const sec = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

type LiveSettings = {
  reduceFx: boolean;
  showDamageTexts: boolean;
  showMiniMap: boolean;
  highContrastTelegraphs: boolean;
  shakePercent: number;
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
};

type SettingsPresetId = 'comfort' | 'default' | 'intense';

const SETTINGS_STORAGE_KEY = 'bem_live_settings_v1';
const DEFAULT_SETTINGS: LiveSettings = {
  reduceFx: false,
  showDamageTexts: true,
  showMiniMap: true,
  highContrastTelegraphs: false,
  shakePercent: 100,
  masterVolume: 82,
  bgmVolume: 68,
  sfxVolume: 76,
};

const SETTINGS_PRESETS: Record<SettingsPresetId, { label: string; values: LiveSettings }> = {
  comfort: {
    label: '쾌적',
    values: {
      reduceFx: true,
      showDamageTexts: true,
      showMiniMap: true,
      highContrastTelegraphs: true,
      shakePercent: 55,
      masterVolume: 72,
      bgmVolume: 62,
      sfxVolume: 58,
    },
  },
  default: {
    label: '기본',
    values: { ...DEFAULT_SETTINGS },
  },
  intense: {
    label: '강렬',
    values: {
      reduceFx: false,
      showDamageTexts: true,
      showMiniMap: true,
      highContrastTelegraphs: false,
      shakePercent: 122,
      masterVolume: 92,
      bgmVolume: 74,
      sfxVolume: 86,
    },
  },
};

const loadSettings = (): LiveSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<LiveSettings>;
    return {
      reduceFx: Boolean(parsed.reduceFx),
      showDamageTexts: parsed.showDamageTexts !== false,
      showMiniMap: parsed.showMiniMap !== false,
      highContrastTelegraphs: parsed.highContrastTelegraphs === true,
      shakePercent: clamp(Number(parsed.shakePercent ?? DEFAULT_SETTINGS.shakePercent), 0, 130),
      masterVolume: clamp(Number(parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume), 0, 100),
      bgmVolume: clamp(Number(parsed.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume), 0, 100),
      sfxVolume: clamp(Number(parsed.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume), 0, 100),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const initialViewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('title');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId>('warrior');
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [stageBanner, setStageBanner] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewport, setViewport] = useState(initialViewport);
  const [touchPad, setTouchPad] = useState<{
    id: number;
    start: Vec2;
    current: Vec2;
  } | null>(null);
  const [settings, setSettings] = useState<LiveSettings>(loadSettings);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef(new GameRenderer());
  const audioRef = useRef(new AudioManager());
  const frameRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const prevStageRef = useRef<number>(0);
  const lastHudSyncRef = useRef<number>(0);
  const lastUiFlagsRef = useRef<UiFlags | null>(null);
  const settingsPausedByRef = useRef(false);

  const playUiClick = (): void => {
    const audio = audioRef.current;
    audio.unlock();
    audio.playSfx('ui_click', 1);
  };

  const runUiAction = (action: () => void): void => {
    playUiClick();
    action();
  };

  const startGame = (character: CharacterId): void => {
    const engine = new GameEngine(character);
    engine.setCameraShakeScale(settings.shakePercent / 100);
    engineRef.current = engine;
    const first = engine.getSnapshot();
    prevStageRef.current = first.stageIndex;
    lastHudSyncRef.current = 0;
    lastUiFlagsRef.current = null;
    setTouchPad(null);
    setSnapshot(first);
    setSelectedCharacter(character);
    setSettingsOpen(false);
    setScreen('playing');
    setStageBanner(`${STAGES[first.stageIndex]!.id} 스테이지 시작`);
    lastTsRef.current = 0;
  };

  const syncSnapshotNow = (): void => {
    const now = engineRef.current?.getSnapshot();
    if (!now) {
      return;
    }
    setSnapshot(now);
    lastHudSyncRef.current = performance.now();
    lastUiFlagsRef.current = {
      awaitingUpgrade: now.awaitingUpgrade,
      stageClearReady: now.stageClearReady,
      gameOver: now.gameOver,
      victory: now.victory,
      paused: now.paused,
      stageIndex: now.stageIndex,
    };
  };

  useEffect(() => {
    const onResize = (): void => {
      setViewport(initialViewport());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(
    () => () => {
      audioRef.current.destroy();
    },
    [],
  );

  useEffect(() => {
    if (!stageBanner) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStageBanner('');
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [stageBanner]);

  useEffect(() => {
    audioRef.current.setMasterVolume(settings.masterVolume / 100);
    audioRef.current.setBgmVolume(settings.bgmVolume / 100);
    audioRef.current.setSfxVolume(settings.sfxVolume / 100);
    engineRef.current?.setCameraShakeScale(settings.shakePercent / 100);
  }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (screen !== 'playing') {
      return;
    }

    const keyMap: Record<string, keyof InputState> = {
      KeyW: 'up',
      ArrowUp: 'up',
      KeyS: 'down',
      ArrowDown: 'down',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
    };

    const onKey = (ev: KeyboardEvent, pressed: boolean): void => {
      if (ev.code === 'Escape' && pressed) {
        if (ev.repeat) {
          return;
        }
        ev.preventDefault();
        engineRef.current?.togglePause();
        syncSnapshotNow();
        return;
      }

      const mapped = keyMap[ev.code];
      if (!mapped) {
        return;
      }
      ev.preventDefault();
      engineRef.current?.setInputKey(mapped, pressed);
    };

    const onKeyDown = (ev: KeyboardEvent): void => onKey(ev, true);
    const onKeyUp = (ev: KeyboardEvent): void => onKey(ev, false);
    const onBlur = (): void => {
      const keys: Array<keyof InputState> = ['up', 'down', 'left', 'right'];
      for (const key of keys) {
        engineRef.current?.setInputKey(key, false);
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'playing') {
      return;
    }

    let stopped = false;

    const frame = (ts: number): void => {
      if (stopped) {
        return;
      }

      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) {
        frameRef.current = window.requestAnimationFrame(frame);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        frameRef.current = window.requestAnimationFrame(frame);
        return;
      }

      const dprCap = settings.reduceFx ? 1.25 : 1.5;
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      const targetW = Math.round(width * dpr);
      const targetH = Math.round(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        frameRef.current = window.requestAnimationFrame(frame);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dt = lastTsRef.current === 0 ? 0.016 : (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      engine.update(dt, width / WORLD_RENDER_SCALE, height / WORLD_RENDER_SCALE);
      const next = engine.getSnapshot();
      const audioEvents = engine.consumeAudioEvents();
      const gameplayActive =
        !next.paused &&
        !next.awaitingUpgrade &&
        !next.stageClearReady &&
        !next.gameOver &&
        !next.victory;

      const mergedAudio = new Map<AudioEventType, number>();
      for (const event of audioEvents) {
        const prev = mergedAudio.get(event.type) ?? 0;
        const weight = event.type === 'monster_die' ? 0.35 : 0.75;
        mergedAudio.set(event.type, clamp(prev + event.intensity * weight, 0, 1));
      }

      const hasMajorSkill =
        (mergedAudio.get('skill_lightning') ?? 0) > 0 ||
        (mergedAudio.get('skill_laser') ?? 0) > 0;
      if (hasMajorSkill) {
        const atk = mergedAudio.get('player_attack') ?? 0;
        mergedAudio.set('player_attack', atk * 0.35);
      }

      for (const [type, intensity] of mergedAudio) {
        audioRef.current.playSfx(type, intensity);
      }
      audioRef.current.setLoop('player_move_loop', gameplayActive && next.playerMoving, 0.34);
      audioRef.current.setLoop(
        'monster_swarm_loop',
        gameplayActive && next.monsters.length > 0,
        clamp(next.monsters.length / 30, 0.18, 0.54),
      );

      if (next.stageIndex !== prevStageRef.current) {
        prevStageRef.current = next.stageIndex;
        const stage = STAGES[next.stageIndex];
        if (stage) {
          setStageBanner(`${stage.id} 스테이지 시작`);
        }
      }

      rendererRef.current.render(ctx, next, selectedCharacter, width, height, ts, {
        reducedFx: settings.reduceFx,
        showDamageTexts: settings.showDamageTexts,
        showMiniMap: settings.showMiniMap,
        highContrastTelegraphs: settings.highContrastTelegraphs,
      });
      const flags: UiFlags = {
        awaitingUpgrade: next.awaitingUpgrade,
        stageClearReady: next.stageClearReady,
        gameOver: next.gameOver,
        victory: next.victory,
        paused: next.paused,
        stageIndex: next.stageIndex,
      };
      const prevFlags = lastUiFlagsRef.current;
      const forceSync =
        !prevFlags ||
        prevFlags.awaitingUpgrade !== flags.awaitingUpgrade ||
        prevFlags.stageClearReady !== flags.stageClearReady ||
        prevFlags.gameOver !== flags.gameOver ||
        prevFlags.victory !== flags.victory ||
        prevFlags.paused !== flags.paused ||
        prevFlags.stageIndex !== flags.stageIndex;

      if (forceSync || ts - lastHudSyncRef.current >= HUD_SYNC_INTERVAL_MS) {
        setSnapshot(next);
        lastHudSyncRef.current = ts;
        lastUiFlagsRef.current = flags;
      }
      frameRef.current = window.requestAnimationFrame(frame);
    };

    frameRef.current = window.requestAnimationFrame(frame);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [
    screen,
    selectedCharacter,
    settings.reduceFx,
    settings.showDamageTexts,
    settings.showMiniMap,
    settings.highContrastTelegraphs,
  ]);

  useEffect(() => {
    let trackName: string | null = null;

    if (screen === 'title' || screen === 'select') {
      trackName = 'menu';
    } else if (screen === 'playing' && snapshot) {
      if (snapshot.gameOver || snapshot.victory || snapshot.stageClearReady) {
        trackName = 'results';
      } else if (snapshot.bossActive) {
        trackName = 'boss';
      } else {
        trackName = `stage_${snapshot.stageIndex + 1}`;
      }
    }

    audioRef.current.setBgmTrack(trackName);

    if (screen !== 'playing') {
      audioRef.current.setLoop('player_move_loop', false, 0);
      audioRef.current.setLoop('monster_swarm_loop', false, 0);
    }
  }, [
    screen,
    snapshot?.bossActive,
    snapshot?.gameOver,
    snapshot?.stageClearReady,
    snapshot?.stageIndex,
    snapshot?.victory,
  ]);

  const handleUpgradeSelect = (upgrade: UpgradeType): void => {
    playUiClick();
    engineRef.current?.applyUpgrade(upgrade);
    const now = engineRef.current?.getSnapshot();
    if (now) {
      setSnapshot(now);
    }
  };

  const handleTogglePause = (): void => {
    playUiClick();
    engineRef.current?.togglePause();
    syncSnapshotNow();
  };

  const handleOpenSettings = (): void => {
    playUiClick();
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const now = engine.getSnapshot();
    settingsPausedByRef.current = !now.paused;
    if (!now.paused) {
      engine.togglePause();
    }
    setSettingsOpen(true);
    syncSnapshotNow();
  };

  const handleCloseSettings = (): void => {
    playUiClick();
    const engine = engineRef.current;
    setSettingsOpen(false);
    if (engine && settingsPausedByRef.current) {
      engine.togglePause();
    }
    settingsPausedByRef.current = false;
    syncSnapshotNow();
  };

  const applyPreset = (presetId: SettingsPresetId): void => {
    const preset = SETTINGS_PRESETS[presetId];
    if (!preset) {
      return;
    }
    playUiClick();
    setSettings({ ...preset.values });
  };

  const resetSettings = (): void => {
    playUiClick();
    setSettings({ ...DEFAULT_SETTINGS });
  };

  const handleAdvanceStage = (): void => {
    playUiClick();
    const advanced = engineRef.current?.advanceToNextStage();
    if (!advanced) {
      return;
    }

    const now = engineRef.current?.getSnapshot();
    if (!now) {
      return;
    }

    prevStageRef.current = now.stageIndex;
    setSnapshot(now);
    const stage = STAGES[now.stageIndex];
    if (stage) {
      setStageBanner(`${stage.id} 스테이지 시작`);
    }
    lastTsRef.current = 0;
    lastHudSyncRef.current = performance.now();
    lastUiFlagsRef.current = {
      awaitingUpgrade: now.awaitingUpgrade,
      stageClearReady: now.stageClearReady,
      gameOver: now.gameOver,
      victory: now.victory,
      paused: now.paused,
      stageIndex: now.stageIndex,
    };
  };

  const handlePointerDown = (ev: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (
      screen !== 'playing' ||
      snapshot?.paused ||
      snapshot?.awaitingUpgrade ||
      snapshot?.stageClearReady ||
      snapshot?.gameOver ||
      snapshot?.victory
    ) {
      return;
    }
    const rect = ev.currentTarget.getBoundingClientRect();
    const start = {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
    setTouchPad({
      id: ev.pointerId,
      start,
      current: start,
    });
    engineRef.current?.setTouchVector({ x: 0, y: 0 });
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const handlePointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!touchPad || touchPad.id !== ev.pointerId) {
      return;
    }

    const rect = ev.currentTarget.getBoundingClientRect();
    const current = {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
    const dx = current.x - touchPad.start.x;
    const dy = current.y - touchPad.start.y;
    const mag = Math.hypot(dx, dy);
    const maxMag = 90;
    const ratio = mag > maxMag ? maxMag / mag : 1;

    setTouchPad((prev) =>
      prev
        ? {
            ...prev,
            current,
          }
        : null,
    );

    engineRef.current?.setTouchVector({
      x: dx * ratio,
      y: dy * ratio,
    });
  };

  const clearTouch = (): void => {
    setTouchPad(null);
    engineRef.current?.setTouchVector(null);
  };

  const hud = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const stage = STAGES[snapshot.stageIndex] ?? STAGES[0]!;
    const hpRatio = clamp(snapshot.player.hp / snapshot.player.maxHp, 0, 1);
    const xpRatio = clamp(snapshot.player.exp / snapshot.player.expToNext, 0, 1);
    const objectiveRatio = snapshot.bossActive
      ? 1
      : clamp((stage.duration - snapshot.stageTimeLeft) / Math.max(1, stage.duration), 0, 1);
    const objectiveLabel = snapshot.bossActive
      ? '목표: 보스 격파'
      : `목표: 보스 출현까지 ${Math.ceil(snapshot.stageTimeLeft)}초`;

    return {
      stage,
      hpRatio,
      xpRatio,
      objectiveRatio,
      objectiveLabel,
    };
  }, [snapshot]);

  const bossWarning =
    !!snapshot &&
    !snapshot.bossActive &&
    !snapshot.stageClearReady &&
    !snapshot.gameOver &&
    !snapshot.victory &&
    snapshot.stageTimeLeft <= 10;

  const bossPatternAlert = useMemo(() => {
    if (!snapshot || snapshot.bossTelegraphs.length <= 0) {
      return null;
    }
    const imminent = [...snapshot.bossTelegraphs].sort((a, b) => a.life - b.life)[0];
    if (!imminent) {
      return null;
    }

    const patternInfo: Record<BossTelegraphKind, { icon: string; label: string }> = {
      circle: { icon: '◎', label: '원형 폭발' },
      line: { icon: '━', label: '직선 관통' },
      cone: { icon: '◢', label: '부채 베기' },
    };

    const info = patternInfo[imminent.kind];
    return {
      ...info,
      kind: imminent.kind,
      timeLeft: imminent.life,
    };
  }, [snapshot]);

  const lowHpDanger =
    !!snapshot &&
    !snapshot.gameOver &&
    !snapshot.victory &&
    snapshot.player.hp / snapshot.player.maxHp <= 0.25;

  const quickGuideVisible =
    !!snapshot &&
    snapshot.stageIndex === 0 &&
    snapshot.player.level <= 2 &&
    !snapshot.awaitingUpgrade &&
    !snapshot.stageClearReady &&
    !snapshot.gameOver &&
    !snapshot.victory;

  const stageAutoProgress = snapshot?.stageClearReady
    ? clamp(1 - snapshot.stageAutoAdvanceLeft / 2.8, 0, 1)
    : 0;

  const touchKnob = useMemo(() => {
    if (!touchPad) {
      return { x: 0, y: 0 };
    }

    const dx = clamp(touchPad.current.x - touchPad.start.x, -40, 40);
    const dy = clamp(touchPad.current.y - touchPad.start.y, -40, 40);
    return { x: dx, y: dy };
  }, [touchPad]);

  const nextStageInfo = useMemo(() => {
    if (!snapshot || snapshot.nextStageIndex === null) {
      return null;
    }
    return STAGES[snapshot.nextStageIndex] ?? null;
  }, [snapshot]);

  return (
    <div
      className="app-shell"
      style={{ width: viewport.width, height: viewport.height }}
      onPointerDownCapture={() => audioRef.current.unlock()}
    >
      {screen === 'title' && (
        <section className="title-screen">
          <div className="title-shape title-shape-a" />
          <div className="title-shape title-shape-b" />
          <div className="title-content">
            <p className="eyebrow">React Canvas Survivor</p>
            <h1>치비 서바이버즈</h1>
            <p className="subtitle">
              자동 공격, 레벨업 3선택, 5스테이지 보스전까지 포함된 뱀서류 게임
            </p>
            <button
              className="primary-btn"
              type="button"
              onClick={() => runUiAction(() => setScreen('select'))}
            >
              게임 시작
            </button>
          </div>
        </section>
      )}

      {screen === 'select' && (
        <section className="select-screen">
          <header>
            <h2>캐릭터 선택</h2>
            <p>3명의 치비 영웅 중 하나를 골라 5개 스테이지를 돌파하세요.</p>
          </header>
          <div className="character-grid">
            {(Object.keys(CHARACTER_CONFIGS) as CharacterId[]).map((id) => {
              const cfg = CHARACTER_CONFIGS[id];
              const active = selectedCharacter === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`character-card ${active ? 'active' : ''}`}
                  onClick={() => runUiAction(() => setSelectedCharacter(id))}
                >
                  <div className="portrait" style={{ background: cfg.bodyColor }}>
                    <img src={CHARACTER_PORTRAITS[id]} alt={cfg.name} loading="lazy" />
                  </div>
                  <h3>{cfg.name}</h3>
                  <strong>{cfg.title}</strong>
                  <p>{cfg.description}</p>
                  <dl>
                    <div>
                      <dt>HP</dt>
                      <dd>{cfg.maxHp}</dd>
                    </div>
                    <div>
                      <dt>ATK</dt>
                      <dd>{cfg.damage}</dd>
                    </div>
                    <div>
                      <dt>SPD</dt>
                      <dd>{Math.round(cfg.speed)}</dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>
          <div className="select-actions">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => runUiAction(() => setScreen('title'))}
            >
              뒤로
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={() => runUiAction(() => startGame(selectedCharacter))}
            >
              출전
            </button>
          </div>
        </section>
      )}

      {screen === 'playing' && (
        <section className={`game-screen ${lowHpDanger ? 'game-screen-danger' : ''}`}>
          <canvas
            ref={canvasRef}
            className="game-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearTouch}
            onPointerCancel={clearTouch}
            onContextMenu={(ev) => ev.preventDefault()}
          />

          {snapshot && hud && (
            <>
              <div className={`hud hud-left ${hud.hpRatio <= 0.3 ? 'hud-warning' : ''}`}>
                <div className="hud-head">
                  <div className="hud-portrait">
                    <img
                      src={CHARACTER_PORTRAITS[selectedCharacter]}
                      alt={CHARACTER_CONFIGS[selectedCharacter].name}
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <h3>{CHARACTER_CONFIGS[selectedCharacter].name}</h3>
                    <p>Lv. {snapshot.player.level}</p>
                  </div>
                </div>
                <div className="bar">
                  <span style={{ width: `${hud.hpRatio * 100}%` }} />
                </div>
                <small>
                  HP {Math.ceil(snapshot.player.hp)} / {snapshot.player.maxHp}
                </small>
              </div>

              <div className="hud hud-center">
                <h3>
                  STAGE {hud.stage.id} - {hud.stage.name}
                </h3>
                <p>{formatTime(snapshot.stageTimeLeft)}</p>
                <div className="objective-bar">
                  <span style={{ width: `${hud.objectiveRatio * 100}%` }} />
                </div>
                <small>{hud.objectiveLabel}</small>
              </div>

              <div className="hud hud-right">
                <div className="hud-kpis">
                  <p className="kpi-item">
                    처치 <strong>{snapshot.kills}</strong>
                  </p>
                  <p className="kpi-item">
                    콤보 <strong>{snapshot.combo}</strong>
                  </p>
                  <p className="kpi-item kpi-best">
                    최고 <strong>{snapshot.bestCombo}</strong>
                  </p>
                </div>
                <div className="skill-strip">
                  <div className="skill-chip">
                    <span>번개</span>
                    <strong>Lv.{snapshot.skillLevels.lightning}</strong>
                    <em>
                      {snapshot.skillLevels.lightning > 0
                        ? `CD ${snapshot.skillCooldowns.lightning.toFixed(1)}s`
                        : '잠금'}
                    </em>
                  </div>
                  <div className="skill-chip">
                    <span>칼날</span>
                    <strong>Lv.{snapshot.skillLevels.blade}</strong>
                    <em>
                      {snapshot.skillLevels.blade > 0
                        ? `CD ${snapshot.skillCooldowns.blade.toFixed(1)}s`
                        : '잠금'}
                    </em>
                  </div>
                  <div className="skill-chip">
                    <span>레이저</span>
                    <strong>Lv.{snapshot.skillLevels.laser}</strong>
                    <em>
                      {snapshot.skillLevels.laser > 0
                        ? `CD ${snapshot.skillCooldowns.laser.toFixed(1)}s`
                        : '잠금'}
                    </em>
                  </div>
                </div>
              </div>

              <div className="xp-bar-wrap">
                <div className="xp-bar">
                  <span style={{ width: `${hud.xpRatio * 100}%` }} />
                </div>
                <small>
                  EXP {snapshot.player.exp}/{snapshot.player.expToNext}
                </small>
              </div>

              <div className="top-actions">
                <button className="ghost-btn" type="button" onClick={handleTogglePause}>
                  {snapshot.paused ? '재개 (ESC)' : '일시정지 (ESC)'}
                </button>
                <button className="ghost-btn" type="button" onClick={handleOpenSettings}>
                  설정
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => runUiAction(() => setScreen('select'))}
                >
                  캐릭터 선택
                </button>
              </div>

              <div className="controls-hint">이동: WASD/방향키 또는 화면 드래그</div>
            </>
          )}

          {stageBanner && <div className="stage-banner">{stageBanner}</div>}
          {bossWarning && (
            <div className="boss-warning">보스 출현 임박: {Math.ceil(snapshot?.stageTimeLeft ?? 0)}초</div>
          )}
          {bossPatternAlert && (
            <div className={`boss-pattern-alert boss-pattern-${bossPatternAlert.kind}`}>
              <span className="boss-pattern-icon" aria-hidden>
                {bossPatternAlert.icon}
              </span>
              <strong>{bossPatternAlert.label}</strong>
              <em>{bossPatternAlert.timeLeft.toFixed(1)}s</em>
            </div>
          )}
          {quickGuideVisible && (
            <div className="quick-guide">
              <h4>초반 가이드</h4>
              <p>이동: WASD/방향키 또는 드래그</p>
              <p>목표: 타이머 종료 후 보스 격파</p>
              <p>레벨업 시 스킬(번개/칼날/레이저) 우선 강화 추천</p>
            </div>
          )}

          {touchPad && (
            <div
              className="touch-stick"
              style={{
                left: touchPad.start.x,
                top: touchPad.start.y,
              }}
            >
              <span
                className="knob"
                style={{
                  transform: `translate(${touchKnob.x}px, ${touchKnob.y}px)`,
                }}
              />
            </div>
          )}

          {snapshot?.paused && !settingsOpen && (
            <div className="modal-backdrop">
              <div className="pause-modal">
                <h2>일시정지</h2>
                <p>ESC 또는 버튼으로 게임을 재개할 수 있습니다.</p>
                <button className="primary-btn" type="button" onClick={handleTogglePause}>
                  계속하기
                </button>
              </div>
            </div>
          )}

          {settingsOpen && (
            <div className="modal-backdrop">
              <div className="settings-modal">
                <h2>실시간 설정</h2>
                <p>전투 가독성과 사운드 강도를 취향에 맞게 조정할 수 있습니다.</p>
                <div className="settings-presets" role="group" aria-label="설정 프리셋">
                  <span>프리셋</span>
                  <div className="settings-preset-row">
                    <button type="button" className="ghost-btn settings-preset-btn" onClick={() => applyPreset('comfort')}>
                      {SETTINGS_PRESETS.comfort.label}
                    </button>
                    <button type="button" className="ghost-btn settings-preset-btn" onClick={() => applyPreset('default')}>
                      {SETTINGS_PRESETS.default.label}
                    </button>
                    <button type="button" className="ghost-btn settings-preset-btn" onClick={() => applyPreset('intense')}>
                      {SETTINGS_PRESETS.intense.label}
                    </button>
                  </div>
                </div>
                <div className="settings-grid">
                  <label className="settings-item">
                    <span>이펙트 간소화</span>
                    <input
                      type="checkbox"
                      checked={settings.reduceFx}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          reduceFx: ev.target.checked,
                        }))
                      }
                    />
                  </label>
                  <label className="settings-item">
                    <span>데미지 숫자 표시</span>
                    <input
                      type="checkbox"
                      checked={settings.showDamageTexts}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          showDamageTexts: ev.target.checked,
                        }))
                      }
                    />
                  </label>
                  <label className="settings-item">
                    <span>미니맵 표시</span>
                    <input
                      type="checkbox"
                      checked={settings.showMiniMap}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          showMiniMap: ev.target.checked,
                        }))
                      }
                    />
                  </label>
                  <label className="settings-item">
                    <span>보스 위험영역 고대비</span>
                    <input
                      type="checkbox"
                      checked={settings.highContrastTelegraphs}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          highContrastTelegraphs: ev.target.checked,
                        }))
                      }
                    />
                  </label>

                  <label className="settings-slider">
                    <span>카메라 흔들림 {settings.shakePercent}%</span>
                    <input
                      type="range"
                      min={0}
                      max={130}
                      value={settings.shakePercent}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          shakePercent: Number(ev.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="settings-slider">
                    <span>마스터 볼륨 {settings.masterVolume}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.masterVolume}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          masterVolume: Number(ev.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="settings-slider">
                    <span>BGM 볼륨 {settings.bgmVolume}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.bgmVolume}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          bgmVolume: Number(ev.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="settings-slider">
                    <span>SFX 볼륨 {settings.sfxVolume}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.sfxVolume}
                      onChange={(ev) =>
                        setSettings((prev) => ({
                          ...prev,
                          sfxVolume: Number(ev.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="end-actions">
                  <button className="ghost-btn" type="button" onClick={resetSettings}>
                    기본값 복원
                  </button>
                  <button className="primary-btn" type="button" onClick={handleCloseSettings}>
                    설정 저장 후 복귀
                  </button>
                </div>
              </div>
            </div>
          )}

          {snapshot?.stageClearReady && !snapshot.awaitingUpgrade && nextStageInfo && (
            <div className="modal-backdrop">
              <div className="stageclear-modal">
                <h2>스테이지 {STAGES[snapshot.stageIndex]!.id} 클리어!</h2>
                <p>
                  다음 지역: {nextStageInfo.id} - {nextStageInfo.name}
                </p>
                <p className="autoadvance-label">
                  자동 시작까지 {Math.ceil(snapshot.stageAutoAdvanceLeft)}초
                </p>
                <div className="autoadvance-progress">
                  <span style={{ width: `${stageAutoProgress * 100}%` }} />
                </div>
                <button className="primary-btn" type="button" onClick={handleAdvanceStage}>
                  다음 스테이지 시작
                </button>
              </div>
            </div>
          )}

          {snapshot?.awaitingUpgrade && (
            <div className="modal-backdrop">
              <div className="levelup-modal">
                <h2>레벨 업!</h2>
                <p>
                  강화 1개를 선택하세요.
                  {snapshot.pendingLevelUps > 1 ? ` (남은 선택 ${snapshot.pendingLevelUps})` : ''}
                </p>
                <div className="upgrade-grid">
                  {snapshot.upgradeChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className="upgrade-card"
                      onClick={() => handleUpgradeSelect(choice.id)}
                    >
                      <h3>{choice.name}</h3>
                      <p>{choice.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {snapshot && (snapshot.gameOver || snapshot.victory) && (
            <div className="modal-backdrop">
              <div className="end-modal">
                <h2>{snapshot.victory ? '승리!' : '패배...'}</h2>
                <p>
                  {snapshot.victory
                    ? '데몬 로드를 쓰러뜨렸습니다.'
                    : '다시 도전해서 더 높은 콤보를 노려보세요.'}
                </p>
                <ul>
                  <li>최종 레벨: {snapshot.player.level}</li>
                  <li>총 처치: {snapshot.kills}</li>
                  <li>최고 콤보: {snapshot.bestCombo}</li>
                  <li>도달 스테이지: {snapshot.stageIndex + 1}</li>
                </ul>
                <div className="end-actions">
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => runUiAction(() => startGame(selectedCharacter))}
                  >
                    같은 캐릭터로 재시작
                  </button>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => runUiAction(() => setScreen('select'))}
                  >
                    캐릭터 선택으로
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
