@echo off
echo [Connect AI] 기본값 프로필 수정 스크립트를 실행합니다...
python fix_default_profile_v5.py
python replace_profile_settings.py
python sync_profile_settings.py
echo [완료] 모든 작업이 끝났습니다. VS Code를 재시작하세요.
pause
