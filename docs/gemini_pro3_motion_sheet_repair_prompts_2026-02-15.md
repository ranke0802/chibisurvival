# Gemini Pro 3 모션시트 복구 프롬프트 (노이즈 억제/규격 고정)

- 목적: `archer_motion_sheet.png`, `chibi_motion_sheet.png`, `warrior_motion_sheet.png` 재생성
- 기준 스타일: `public/assets/characters/chibi.jpg` (반드시 첨부)

## 1) 공통 지시문 (매번 먼저 붙여넣기)
```text
Use the attached reference image as STRICT style anchor.
Generate a pixel-art sprite sheet for a top-down chibi game character.

Hard constraints:
- exact canvas size: 1600x960
- exact layout: 8 columns x 3 rows
- each frame size: 200x320
- row 0 = idle, row 1 = move, row 2 = attack
- transparent background only
- crisp pixel art, no anti-aliased blur
- no dithering noise, no random white dots, no halo pixels around silhouette
- no text, no watermark, no UI elements

Animation constraints:
- all 8 frames in each row must be visibly distinct
- move row must show clear alternating leg/arm motion
- attack row must be clearly different from move row (wind-up -> strike/release -> recovery)
- feet baseline should remain consistent to avoid jitter

Output:
- one single PNG sprite sheet only
```

## 2) 캐릭터별 프롬프트

## 2.1 궁수 시트
- 저장 경로: `public/assets/characters/archer_motion_sheet.png`
```text
Character: chibi archer, green-brown ranger outfit, bow and quiver.
Style must match the attached reference mage.

Row details:
- Row 0 Idle: subtle breathing and cloth sway.
- Row 1 Move: clear walk cycle, alternating left/right leg stride, upper body counter-sway.
- Row 2 Attack: bow attack sequence with clear stages:
  prepare -> draw string -> full draw -> release -> recoil -> return.

Quality lock:
- remove all isolated noisy pixels around the sprite
- keep clean dark outline with stable thickness
- avoid over-detailed texture noise in clothes/hair
```

## 2.2 마법사 시트
- 저장 경로: `public/assets/characters/chibi_motion_sheet.png`
```text
Character: the approved mage design from reference (red hair, purple hat/robe, same identity).

Row details:
- Row 0 Idle: breathing + tiny hat/robe micro motion.
- Row 1 Move: clear walk cycle (legs visibly alternate).
- Row 2 Attack: casting sequence:
  wind-up -> hand raise -> orb charge -> cast release -> recovery.

Quality lock:
- preserve face/hat/hair identity close to reference
- no blur, no glow haze, no white edge artifacts
- silhouette must remain readable at 64px display size
```

## 2.3 전사 시트
- 저장 경로: `public/assets/characters/warrior_motion_sheet.png`
```text
Character: chibi warrior, red armor, short cape, sword and small shield.
Style must match the attached reference mage.

Row details:
- Row 0 Idle: subtle breathing and cape micro movement.
- Row 1 Move: heavy but clear step cycle with alternating legs and arm swing.
- Row 2 Attack: sword slash combo sequence:
  wind-up -> forward slash -> follow-through -> recovery.

Quality lock:
- no random white speckles in transparent area
- no broken contour pixels along outline
- keep strong readable silhouette and stable proportions
```

## 3) 실패 시 재시도 문구 (추가)
노이즈가 보이면 아래 문구를 마지막에 추가:

```text
Retry with stricter cleanup:
- eliminate all single-pixel and two-pixel isolated artifacts outside the character body
- keep only intentional outline and interior pixels
- transparent background must be perfectly clean
```

## 4) 생성 후 수동 체크
1. 이미지 크기 `1600x960`인지 확인
2. 투명 배경에 흰 점/색 점 노이즈 없는지 확인
3. Row1(이동)과 Row2(공격)가 눈으로 봐도 완전히 다른 동작인지 확인
4. 프레임 간 캐릭터 중심이 과도하게 튀지 않는지 확인
