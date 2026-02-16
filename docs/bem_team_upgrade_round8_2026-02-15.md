# bem 팀 수정 결과 (Round 8)

- 일시: 2026-02-15
- 피드백: "모션 시트가 새 동작이 아니라 단순 변형처럼 보임"

## 1) 변경 요약
1. 모션 시트 생성 로직 전면 교체
- 기존: 단일 스프라이트 전체 변형 중심
- 변경: 부위 분리(머리/몸통/양팔/양다리) 합성 기반 포즈 생성

2. 동작 구조
- 8열 x 3행:
  - Idle
  - Move (걷기 스텝)
  - Attack (클래스별 다른 키포즈)

3. 클래스별 공격 모션 차별화
- 마법사: 캐스팅/오브 방출
- 전사: 전진 베기/슬래시 아크
- 궁수: 활 당김/화살 발사

## 2) 반영 파일
- 생성 스크립트: `scripts/generate_character_motion_sheets.py`
- 생성 결과:
  - `public/assets/characters/mage_motion_sheet.png`
  - `public/assets/characters/warrior_motion_sheet.png`
  - `public/assets/characters/archer_motion_sheet.png`

## 3) 검증
1. 빌드: `npm run build` 성공
2. 시트 규격: `1600 x 960` (`200 x 320`, `8 x 3`)
