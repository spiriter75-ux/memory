"""
Connect AI 프로필 완전 교체 스크립트
========================================
동작:
  1. "기본값" 프로필(전역 settings.json)에서 Connect AI 관련 설정 전부 삭제
  2. "웹툰" 프로필의 모든 설정을 "기본값" 프로필에 덮어쓰기

목적: 기본값 프로필에 있는 유튜버 강제 링크/설정을 제거하고
      웹툰 프로필의 깨끗한 설정으로 완전 교체
"""

import os
import json
import shutil
from datetime import datetime

APPDATA = os.environ.get("APPDATA", "")
VSCODE_USER_DIR = os.path.join(APPDATA, "Code", "User")
PROFILES_DIR = os.path.join(VSCODE_USER_DIR, "profiles")
GLOBAL_SETTINGS = os.path.join(VSCODE_USER_DIR, "settings.json")  # 기본값 프로필

TARGET_PROFILE_NAME = "웹툰"

# Connect AI 관련 설정 키 패턴
CONNECTAI_PATTERNS = [
    "connectai",
    "connect-ai",
    "connect_ai",
    "connectailab",
]

def backup_file(file_path):
    if os.path.exists(file_path):
        backup_path = f"{file_path}.{datetime.now().strftime('%Y%m%d_%H%M%S')}.bak"
        shutil.copy2(file_path, backup_path)
        print(f"[INFO] 백업 생성: {backup_path}")

def clean_and_replace():
    # 1. 대상 프로필(웹툰)의 settings.json 찾기
    target_profile_settings = None
    if os.path.exists(PROFILES_DIR):
        for profile_id in os.listdir(PROFILES_DIR):
            profile_path = os.path.join(PROFILES_DIR, profile_id)
            profile_name_file = os.path.join(profile_path, "name")
            if os.path.exists(profile_name_file):
                with open(profile_name_file, 'r', encoding='utf-8') as f:
                    if f.read().strip() == TARGET_PROFILE_NAME:
                        target_profile_settings = os.path.join(profile_path, "settings.json")
                        break
    
    if not target_profile_settings or not os.path.exists(target_profile_settings):
        print(f"[ERROR] '{TARGET_PROFILE_NAME}' 프로필을 찾을 수 없습니다.")
        return

    # 2. 전역 설정 백업 및 로드
    backup_file(GLOBAL_SETTINGS)
    with open(GLOBAL_SETTINGS, 'r', encoding='utf-8') as f:
        global_data = json.load(f)

    # 3. 웹툰 프로필 설정 로드
    with open(target_profile_settings, 'r', encoding='utf-8') as f:
        target_data = json.load(f)

    # 4. 기존 글로벌 설정에서 Connect AI 관련 키 모두 삭제
    cleaned_global = {k: v for k, v in global_data.items() if not any(p in k.lower() for p in CONNECTAI_PATTERNS)}
    
    # 5. 웹툰 프로필의 설정으로 덮어쓰기
    cleaned_global.update(target_data)

    # 6. 저장
    with open(GLOBAL_SETTINGS, 'w', encoding='utf-8') as f:
        json.dump(cleaned_global, f, indent=4, ensure_ascii=False)
    
    print(f"[SUCCESS] '{TARGET_PROFILE_NAME}' 프로필의 설정이 기본값 프로필에 적용되었습니다.")

if __name__ == "__main__":
    clean_and_replace()
