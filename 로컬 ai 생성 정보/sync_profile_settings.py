import os
import json
import shutil
from datetime import datetime

APPDATA = os.environ.get("APPDATA", "")
VSCODE_USER_DIR = os.path.join(APPDATA, "Code", "User")
PROFILES_DIR = os.path.join(VSCODE_USER_DIR, "profiles")
GLOBAL_SETTINGS = os.path.join(VSCODE_USER_DIR, "settings.json")

# 동기화할 설정 키 (Connect AI 관련)
SYNC_KEYS = [
    "connectai",
    "connect-ai",
    "connect_ai",
]

def sync_settings():
    if not os.path.exists(GLOBAL_SETTINGS):
        print("[ERROR] 기본 설정 파일을 찾을 수 없습니다.")
        return

    with open(GLOBAL_SETTINGS, 'r', encoding='utf-8') as f:
        global_data = json.load(f)

    # 1. 모든 프로필 폴더 찾기
    if os.path.exists(PROFILES_DIR):
        for profile_id in os.listdir(PROFILES_DIR):
            profile_path = os.path.join(PROFILES_DIR, profile_id)
            settings_path = os.path.join(profile_path, "settings.json")
            
            if os.path.exists(settings_path):
                with open(settings_path, 'r', encoding='utf-8') as f:
                    profile_data = json.load(f)
                
                # 글로벌 설정의 Connect AI 관련 내용을 각 프로필에 동기화
                changed = False
                for k, v in global_data.items():
                    if any(p in k.lower() for p in SYNC_KEYS):
                        profile_data[k] = v
                        changed = True
                
                if changed:
                    with open(settings_path, 'w', encoding='utf-8') as f:
                        json.dump(profile_data, f, indent=4, ensure_ascii=False)
                    print(f"[SUCCESS] 프로필 동기화 완료: {profile_id}")

if __name__ == "__main__":
    sync_settings()
