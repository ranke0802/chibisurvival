# Gemini Pro 3 이미지 생성 프롬프트 (스타일 고정 버전)

- 기준일: 2026-02-15
- 목적: 현재 프로젝트 비주얼 유지 + 에셋 교체용 프롬프트 제공
- 기준 레퍼런스(고정): `public/assets/characters/chibi.jpg`

## 1) 공통 사용 규칙
1. Gemini Pro 3에 `chibi.jpg`를 반드시 함께 첨부한다.
2. 모든 캐릭터/몬스터는 레퍼런스와 동일한 픽셀 밀도, 외곽선, 명암 단계(과한 그라데이션 금지)를 유지한다.
3. 기본 금지:
- 반실사, 3D 렌더 느낌, 에어브러시/흐림, 과한 안티앨리어싱
- 텍스트, 워터마크, UI 프레임, 배경 소품
4. 스프라이트는 중심 정렬 + 투명 배경 PNG로 생성한다(배경 텍스처 제외).

## 2) Gemini 입력용 공통 프롬프트 (복붙)
아래를 먼저 붙이고, 에셋별 개별 프롬프트를 뒤에 이어 붙인다.

```text
Use the attached reference image as the STRICT style anchor.
Create pixel-art game assets in the same chibi visual language:
big head, compact body, clean dark outline, readable silhouette at 32~96px.

Hard constraints:
- top-down game sprite style
- crisp pixel edges, no blur, no painterly shading
- transparent background unless explicitly requesting a tile texture
- no text, no watermark, no frame
- keep proportion and palette harmony consistent with the reference character

Output:
- PNG
- centered subject
- full body fully visible
```

## 3) 캐릭터 단일 스프라이트 프롬프트

### 3.1 전사 (`public/assets/characters/warrior.png`, 1024x1024, transparent)
```text
Create one full-body pixel-art chibi warrior in the exact same style as the attached reference mage.
Top-down game sprite, red-black armor outfit, short cape, compact sword-ready stance.
Cute but sturdy silhouette, large head, tiny body, clear boots and gauntlets.
Transparent background, centered sprite, no shadow outside the sprite itself.
```

### 3.2 궁수 (`public/assets/characters/archer.png`, 1024x1024, transparent)
```text
Create one full-body pixel-art chibi archer in the exact same style as the attached reference mage.
Top-down game sprite, green-brown ranger outfit, small quiver, bow-ready stance.
Cute but agile silhouette, large head, tiny body, readable arms and bow hand shape.
Transparent background, centered sprite, no text.
```

### 3.3 마법사 베이스 (`public/assets/characters/mage.png`, 1024x1024, transparent)
```text
Create one full-body pixel-art chibi mage that matches the attached approved reference design.
Keep the same vibe: red hair, purple robe, witch hat, cute face proportions.
Top-down game sprite, neutral standing pose, clean silhouette for gameplay.
Transparent background, centered sprite.
```

### 3.4 마법사 초상 (`public/assets/characters/chibi_portrait.png`, 1024x1024, transparent)
```text
Create a bust portrait pixel-art sprite of the same approved reference mage.
Keep exact style consistency: hat, hair color, face shape, eye style, robe palette.
Framed for UI portrait usage, but do not draw any external frame or text.
Transparent background, centered.
```

## 4) 모션 시트 프롬프트 (핵심)

## 공통 규격
- 파일: PNG
- 캔버스: `1600x960`
- 레이아웃: `8 columns x 3 rows`
- 프레임 크기: `200x320`
- 행 정의:
1. Row 0: Idle
2. Row 1: Move (walk)
3. Row 2: Attack
- 캐릭터는 각 프레임 중앙 기준으로 발 위치가 크게 튀지 않게 정렬
- 배경 완전 투명

### 4.1 전사 모션 시트 (`public/assets/characters/warrior_motion_sheet.png`)
```text
Generate a pixel-art sprite sheet for a chibi warrior, style-locked to the attached reference.
Canvas 1600x960, 8 columns x 3 rows, transparent background.

Row 0 (Idle): subtle breathing and tiny cloth sway.
Row 1 (Move): clear left-right leg stepping, torso counter sway, arm swing.
Row 2 (Attack): distinct sword slash sequence with readable wind-up -> swing -> follow-through -> recovery.

Important:
- each frame must be visibly different (not just tiny wobble)
- preserve pixel-art crispness and same style family as reference
- keep proportions consistent across all 24 frames
```

### 4.2 궁수 모션 시트 (`public/assets/characters/archer_motion_sheet.png`)
```text
Generate a pixel-art sprite sheet for a chibi archer, style-locked to the attached reference.
Canvas 1600x960, 8 columns x 3 rows, transparent background.

Row 0 (Idle): calm stance, slight breathing.
Row 1 (Move): clear stepping cycle with visible lower-body gait and light upper sway.
Row 2 (Attack): bow draw sequence with clear stages:
prepare -> draw string -> full draw -> release arrow -> recoil -> recover.

Important:
- attack row must look fundamentally different from move row
- maintain readability at small size (32~64px)
- crisp pixels, no blur
```

### 4.3 마법사 모션 시트 (`public/assets/characters/mage_motion_sheet.png`)
```text
Generate a pixel-art sprite sheet for the same approved mage character from the attached reference.
Canvas 1600x960, 8 columns x 3 rows, transparent background.

Row 0 (Idle): subtle breathing and robe/hat micro-motion.
Row 1 (Move): visible walk cycle with alternating legs and upper-body counter movement.
Row 2 (Attack): magic casting sequence:
wind-up -> hand raise -> orb charge -> cast release -> after-cast recovery.

Important:
- keep face and costume identity close to the approved reference
- all 24 frames should be style-consistent and intentionally animated
```

## 5) 몬스터 프롬프트

### 5.1 슬라임 (`public/assets/monsters/slime.png`, 1024x1024, transparent)
```text
Pixel-art chibi slime monster, top-down game sprite, same style family as reference character.
Simple but cute silhouette, readable eyes, jelly body with clear outline, transparent background.
```

### 5.2 박쥐 (`public/assets/monsters/bat.png`, 1024x1024, transparent)
```text
Pixel-art chibi bat monster, top-down game sprite, wing silhouette clearly readable at small size.
Dark indigo palette, cute but hostile face, transparent background.
```

### 5.3 스켈레톤 (`public/assets/monsters/skeleton.png`, 1024x1024, transparent)
```text
Pixel-art chibi skeleton monster, top-down game sprite, skull and limbs clearly separated.
Cute-horror style matching the reference world, clean outline, transparent background.
```

### 5.4 전갈 (`public/assets/monsters/scorpion.png`, 1024x1024, transparent)
```text
Pixel-art chibi scorpion monster, top-down game sprite, clear pincers and tail arc silhouette.
Desert palette, readable at 32~64px, transparent background.
```

### 5.5 미라 (`public/assets/monsters/mummy.png`, 1024x1024, transparent)
```text
Pixel-art chibi mummy monster, top-down sprite, wrapped cloth bands and dark eye sockets.
Cute but eerie, clean outline, transparent background.
```

### 5.6 불꽃 정령 (`public/assets/monsters/flame.png`, 1024x1024, transparent)
```text
Pixel-art flame elemental monster, top-down sprite, white-hot core with orange-red flame petals.
Readable silhouette, transparent background.
```

## 6) 보스 프롬프트

### 6.1 킹 슬라임 (`public/assets/bosses/king_slime.png`)
```text
Pixel-art boss slime king, top-down sprite, larger mass silhouette, crown-like feature, same style family.
Transparent background, readable boss-scale design.
```

### 6.2 가고일 로드 (`public/assets/bosses/gargoyle_lord.png`)
```text
Pixel-art gargoyle lord boss, top-down sprite, stone wings and horned silhouette, high readability.
Transparent background.
```

### 6.3 사막 포식자 (`public/assets/bosses/desert_predator.png`)
```text
Pixel-art desert predator boss, top-down sprite, giant claw/tail silhouette, desert armor motif.
Transparent background.
```

### 6.4 마그마 골렘 (`public/assets/bosses/magma_golem.png`)
```text
Pixel-art magma golem boss, top-down sprite, rocky body with lava cracks, heavy silhouette.
Transparent background.
```

### 6.5 데몬 로드 (`public/assets/bosses/demon_lord.png`)
```text
Pixel-art demon lord final boss, top-down sprite, horned silhouette, dark-crimson palette, readable details.
Transparent background.
```

## 7) 배경 타일 프롬프트 (seamless)

공통 규격:
- 1024x1024
- 타일 반복 가능한 seamless texture
- 캐릭터/오브젝트 없음

### 7.1 숲 (`public/assets/backgrounds/stage_1.png`)
```text
Seamless top-down pixel-art forest ground texture, mossy tones, subtle variation, no characters.
```

### 7.2 동굴 (`public/assets/backgrounds/stage_2.png`)
```text
Seamless top-down pixel-art cave floor texture, cool gray-blue stone pattern, no characters.
```

### 7.3 사막 (`public/assets/backgrounds/stage_3.png`)
```text
Seamless top-down pixel-art desert floor texture, dune streaks and dry cracks, no characters.
```

### 7.4 화산 (`public/assets/backgrounds/stage_4.png`)
```text
Seamless top-down pixel-art volcanic floor texture, lava cracks and dark rock, no characters.
```

### 7.5 성채 (`public/assets/backgrounds/stage_5.png`)
```text
Seamless top-down pixel-art dark castle floor texture, rune-like tile accents, no characters.
```

## 8) 후처리 체크리스트 (생성 후)
1. 배경 투명 PNG인지 확인(배경형 텍스처 제외).
2. 스프라이트 여백 과다 여부 확인(캐릭터가 화면 중앙에 충분히 크게 위치).
3. 모션 시트에서 행 구분이 명확한지 확인:
- Row1과 Row2가 같은 동작처럼 보이면 재생성.
4. 게임 축소 배율(대략 64px)에서 실루엣이 읽히는지 확인.
5. 파일 경로를 기존 프로젝트 경로 그대로 덮어쓰기.
