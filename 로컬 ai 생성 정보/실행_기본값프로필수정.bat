@echo off
chcp 65001 > nul
echo.
echo ================================================================
echo  Connect AI Lab V5 - 기본값 프로필 수정 + GlobalSettings 빌드
echo ================================================================
echo.
cd /d "c:\Users\Lee\.connect-ai-brain\로컬 ai 생성 정보"
python fix_default_profile_v5.py
echo.
pause
