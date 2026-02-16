#!/usr/bin/env bash
set -euo pipefail

# 이미지 정리 스크립트 (Gemini 재생성 전에 실행)
# - 기존 코드 기준으로 현재 렌더링에서 직접 필요하지 않은 파일
# - 삭제 전 수동 백업 권장

rm -f public/assets/bosses/boss.png

# 아래 파일은 캐릭터/무브 시트를 전면 교체할 때만 삭제
# rm -f public/assets/characters/chibi_sheet.png
# rm -f public/assets/characters/chibi_motion_sheet.png
# rm -f public/assets/characters/chibi_portrait.png

echo "cleanup done"
