import os
import json
import shutil
from datetime import datetime

APPDATA = os.environ.get("APPDATA", "")
GLOBAL_SETTINGS = os.path.join(APPDATA, "Code", "User", "settings.json")

def fix_profile():
    if not os.path.exists(GLOBAL_SETTINGS):
        return

    with open(GLOBAL_SETTINGS, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # V5 버전에 맞춘 프로필 수정 로직
    # (과거 로그에서 추출된 핵심 패치 내용 적용)
    keywords_to_remove = ["youtuber", "unintended_link"]
    cleaned_data = {k: v for k, v in data.items() if not any(kw in str(v).lower() for kw in keywords_to_remove)}

    with open(GLOBAL_SETTINGS, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
    
    print("[SUCCESS] V5 프로필 수정 완료")

if __name__ == "__main__":
    fix_profile()
