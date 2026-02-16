# bem 팀 고도화 회의 및 수정 결과 (Round 6)

- 일시: 2026-02-15
- 이슈: "캐릭터별 모션 시트가 동일하게 느껴지고, 이동/공격 모션 구분이 약함"

## 1) 원인 진단
1. 전사/궁수 모션 시트가 2행(Idle/Move) 구조였고, 렌더러도 2행만 사용.
2. 공격 타이밍은 캐릭터 전체 트랜스폼만 적용되어 실제 "공격 전용 프레임"이 없었음.

## 2) 수정 내용
1. 전사/궁수 모션 시트를 3행으로 재생성
- 구조: `Idle(0) / Move(1) / Attack(2)`
- 파일:
  - `public/assets/characters/warrior_motion_sheet.png` (1600x960)
  - `public/assets/characters/archer_motion_sheet.png` (1600x960)

2. 렌더러가 공격행을 실제 사용하도록 변경
- 공격 펄스 시 `Attack row`를 우선 재생하고, 공격 전용 프레임 시퀀스 적용.
- 반영: `src/game/renderer.ts`

3. 공격 모션 노출 시간 보정
- 공격 펄스 감쇠 속도 완화로 공격 프레임 인지 시간 확보.
- 반영: `src/game/engine.ts`

4. 재생성 스크립트 추가
- `scripts/generate_character_motion_sheets.py`
- 향후 동일 이슈 재발 방지를 위한 재현 가능한 생성 파이프라인 확보.

## 3) 검증
1. 빌드: `npm run build` 통과
2. 확인 포인트:
- 전사/궁수 공격 시 이동행이 아닌 공격행이 재생되는지
- 공격 타이밍에서 캐릭터별(베기/사격) 연출 차이가 보이는지
