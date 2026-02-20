# BEM Survivor

React + Canvas 기반 뱀서류(서바이버 라이크) 프로토타입 프로젝트입니다.  
3개 캐릭터, 5개 스테이지, 자동 공격/스킬/레벨업/보스전 루프를 포함합니다.

## 주요 기능
- 캐릭터 3종: 전사, 마법사, 궁수
- 스테이지 5개 + 보스전
- 자동 공격 + 스킬 3종(번개/칼날/레이저)
- 레벨업 3선택 업그레이드 시스템
- 보스 텔레그래프 패턴(원형/직선/부채꼴)
- HUD/미니맵/보스 경고 배지
- 실시간 설정(이펙트/데미지 텍스트/미니맵/텔레그래프 대비/볼륨)
- WebAudio 기반 BGM/SFX 믹싱(ducking/loop/볼륨 분리)

## 기술 스택
- `React 18`
- `TypeScript`
- `Vite`
- `HTML5 Canvas` (렌더링)
- `Web Audio API` (사운드)

## 실행 방법
```bash
npm install
npm run dev
```

- 기본 개발 서버: `http://localhost:5173`

### 빌드 / 프리뷰
```bash
npm run build
npm run preview
```

## 조작
- 이동: `WASD` / 방향키 / 모바일 드래그
- 일시정지: `ESC`
- 공격: 자동

## 프로젝트 구조
```text
src/
  App.tsx                 # 화면 상태/입력/오버레이 UI
  game/
    engine.ts             # 게임 로직(루프, 충돌, 스폰, 스킬, 진행)
    renderer.ts           # Canvas 렌더링
    types.ts              # 타입/밸런스 데이터(캐릭터, 스테이지, 업그레이드)
  audio/
    AudioManager.ts       # WebAudio 믹싱/트랙 전환/SFX 재생
    bgm.json              # BGM 메타
    sfx.json              # SFX 메타
public/
  assets/                 # 캐릭터/몬스터/배경/보스
    characters/
      warrior/            # idle.png, walk.png, attack.png
      mage/               # idle.png, walk.png, attack.png
      archer/             # idle.png, walk.png, attack.png
  audio/                  # bgm/sfx wav
scripts/                  # 에셋/오디오/QA/정리 스크립트
docs/                     # 회의록/기획/프롬프트 문서
```

## 스크립트 요약
- `npm run assets:theme` : 배경/캐릭터/몬스터 기본 에셋 생성
- `npm run assets:chibi` : `chibi.jpg` 기반 시트/초상 전처리
- `npm run assets:motion` : 치비 모션 시트 생성
- `npm run assets:audio` : BGM/SFX 생성
- `npm run assets:ai` : OpenAI 이미지 API 기반 에셋 생성(별도 API 키 필요)

## 캐릭터 애니메이션 에셋 스펙
현재 렌더러(`src/game/renderer.ts`)는 직업별로 분리된 4x4 시트를 사용합니다.

- 전사
  - `/assets/characters/warrior/idle.png`
  - `/assets/characters/warrior/walk.png`
  - `/assets/characters/warrior/attack.png`
- 마법사
  - `/assets/characters/mage/idle.png`
  - `/assets/characters/mage/walk.png`
  - `/assets/characters/mage/attack.png`
- 궁수
  - `/assets/characters/archer/idle.png`
  - `/assets/characters/archer/walk.png`
  - `/assets/characters/archer/attack.png`

공통 규격:
- `4열 x 4행` (방향: 하/상/좌/우)
- 상태별 시트 분리(`idle`, `walk`, `attack`)
- PNG 투명 배경 권장

## QA / 검증
- 최소 검증:
```bash
npm run build
```
- 스모크 자동화 스크립트:
  - `scripts/qa_smoke_playwright.mjs`
  - 프리뷰 서버 실행 후 `QA_BASE_URL` 지정해 사용

## 현재 상태 요약
- 코어 게임 루프 및 UX/HUD/설정 시스템은 구현 완료 상태
- 에셋 파이프라인은 여러 라운드 작업이 누적되어 스펙/스크립트가 혼재
- 최근 AI 생성 모션 시트는 노이즈/규격 불일치 이슈가 반복됨

## 업데이트 내역 (2026-02-20)
- 캐릭터 실사용 애니메이션 에셋을 직업별 폴더 구조로 정리
  - `public/assets/characters/{warrior|mage|archer}/{idle|walk|attack}.png`
- 렌더러 캐릭터 경로를 새 구조로 변경 (`src/game/renderer.ts`)
- 배경 렌더를 원본 타일 반복 방식으로 복구하고, 텍스처 배경 시 과한 오버레이/장식선 완화
- 몬스터 스프라이트 누끼/체커보드 제거 로직 강화(aggressive sanitize + sanitized 기준 trim)
- 몬스터/화살 투사체 가독성 개선(크기/트레일/두께 보정)
- 레거시 `refined_*` 루트 파일 및 구 모션시트 참조 정리 방향으로 이관

## 관련 문서
- 프로젝트 분석/향후 플랜: `docs/future_plan_2026-02-16.md`
- Gemini 프롬프트(스타일 고정): `docs/gemini_pro3_asset_prompts_stylelock_2026-02-15.md`
- Gemini 모션 복구 프롬프트: `docs/gemini_pro3_motion_sheet_repair_prompts_2026-02-15.md`
