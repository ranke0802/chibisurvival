# bem 팀 긴급 수정 결과 (Round 7)

- 일시: 2026-02-15
- 트리거: "캐릭터가 전혀 안 움직인다" 사용자 피드백

## 1) 원인
1. 기존 구조에서 이동/공격 모션 차이가 약하게 보일 수 있었음.
2. 마법사는 2행 시트(Idle/Move) 사용으로 공격 구분이 부족했음.
3. `playerMoving` 판정 임계치가 높아 저속 구간에서 정지로 보일 여지가 있었음.

## 2) 조치
1. 모션 시트 통일
- 모든 캐릭터를 `3행(Idle/Move/Attack)` 시트로 정리.
- 신규 생성:
  - `public/assets/characters/mage_motion_sheet.png`
  - `public/assets/characters/warrior_motion_sheet.png`
  - `public/assets/characters/archer_motion_sheet.png`

2. 렌더러 모션 강화
- 이동 시 상하/좌우 흔들림 진폭 확대로 "걷는 느낌"을 명확히 강화.
- 공격 시 공격행 우선 재생 + 공격 반동 동시 적용.
- 반영: `src/game/renderer.ts`

3. 이동 판정 보정
- 이동 상태 임계치 완화: `speedMag > 18` -> `speedMag > 8`
- 반영: `src/game/engine.ts`

4. 생성 파이프라인 개선
- 재생성 스크립트 강화:
  - `scripts/generate_character_motion_sheets.py`
- 캐릭터별 공격 연출 오버레이(마법 투사체/전사 슬래시/궁수 화살) 포함.

## 3) 검증
1. 빌드 검증: `npm run build` 성공
2. 시트 구조 확인:
- `1600 x 960`, 프레임 `200 x 320`, `8열 x 3행`
