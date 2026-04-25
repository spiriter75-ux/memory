import os
import json
import shutil
from datetime import datetime

APPDATA = os.environ.get("APPDATA", "")
GLOBAL_SETTINGS = os.path.join(APPDATA, "Code", "User", "settings.json")

def patch_settings():
    if not os.path.exists(GLOBAL_SETTINGS):
        print("[ERROR] 설정 파일을 찾을 수 없습니다.")
        return

    # 백업
    backup_path = f"{GLOBAL_SETTINGS}.patch.{datetime.now().strftime('%Y%m%d_%H%M%S')}.bak"
    shutil.copy2(GLOBAL_SETTINGS, backup_path)

    with open(GLOBAL_SETTINGS, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 예: 특정 설정 강제 패치 (필요시 내용 수정)
    # data["connectai.mode"] = "advanced"
    
    with open(GLOBAL_SETTINGS, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    
    print(f"[SUCCESS] 전역 설정 패치 완료. 백업: {backup_path}")

if __name__ == "__main__":
    patch_settings()
