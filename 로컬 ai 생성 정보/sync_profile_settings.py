"""
Connect AI 프로필 설정 동기화 스크립트
========================================
"웹툰" 프로필의 Connect AI 설정값을 읽어
"기본값(Default)" 프로필 및 전역 설정에 복사합니다.
"""

import os
import json
import glob
import shutil
from datetime import datetime

APPDATA = os.environ.get("APPDATA", "")
VSCODE_USER_DIR = os.path.join(APPDATA, "Code", "User")
PROFILES_DIR = os.path.join(VSCODE_USER_DIR, "profiles")
GLOBAL_SETTINGS = os.path.join(VSCODE_USER_DIR, "settings.json")

TARGET_PROFILE_NAME = "웹툰"  # 복사할 원본 프로필 이름


def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  [오류] {path} 읽기 실패: {e}")
        return None


def save_json(path, data):
    # 백업 먼저
    backup = path + f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if os.path.exists(path):
        shutil.copy2(path, backup)
        print(f"  [백업] {os.path.basename(backup)}")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def find_profiles():
    """VS Code 프로필 디렉토리 목록과 이름 반환"""
    profiles = {}
    if not os.path.exists(PROFILES_DIR):
        print(f"[경고] 프로필 디렉토리 없음: {PROFILES_DIR}")
        return profiles

    for entry in os.listdir(PROFILES_DIR):
        profile_dir = os.path.join(PROFILES_DIR, entry)
        if not os.path.isdir(profile_dir):
            continue

        # profile.json 에서 프로필 이름 읽기
        profile_json_path = os.path.join(profile_dir, "profile.json")
        profile_data = load_json(profile_json_path)
        if profile_data:
            name = profile_data.get("name", entry)
        else:
            name = entry

        settings_path = os.path.join(profile_dir, "settings.json")
        profiles[name] = {
            "dir": profile_dir,
            "settings_path": settings_path,
            "exists": os.path.exists(settings_path)
        }
        print(f"  발견된 프로필: '{name}' → {profile_dir}")

    return profiles


def extract_connectai_settings(settings):
    """Connect AI 관련 설정만 추출"""
    if not settings:
        return {}
    return {k: v for k, v in settings.items()
            if k.lower().startswith("connectai") or "connect-ai" in k.lower() or "connect_ai" in k.lower()}


def main():
    print("=" * 60)
    print("  Connect AI 프로필 설정 동기화 도구")
    print("=" * 60)

    print(f"\n[1] VS Code 설정 경로: {VSCODE_USER_DIR}")
    print(f"[2] 프로필 디렉토리: {PROFILES_DIR}")

    # 프로필 목록 출력
    print(f"\n[3] 프로필 탐색 중...")
    profiles = find_profiles()

    if not profiles:
        print("\n[경고] 프로필을 찾을 수 없습니다.")
        print("  → VS Code에서 프로필을 최소 한 번 이상 사용해야 합니다.")

    # 전역 settings.json 확인
    print(f"\n[4] 전역 설정 파일 확인: {GLOBAL_SETTINGS}")
    global_settings = load_json(GLOBAL_SETTINGS) or {}
    global_connectai = extract_connectai_settings(global_settings)
    print(f"  전역 Connect AI 설정 수: {len(global_connectai)}개")
    for k, v in global_connectai.items():
        val_str = str(v)[:80] + "..." if len(str(v)) > 80 else str(v)
        print(f"    {k}: {val_str}")

    # 웹툰 프로필 설정 읽기
    webtoon_connectai = {}
    webtoon_settings_path = None

    if TARGET_PROFILE_NAME in profiles:
        info = profiles[TARGET_PROFILE_NAME]
        webtoon_settings_path = info["settings_path"]
        print(f"\n[5] '{TARGET_PROFILE_NAME}' 프로필 설정 읽는 중...")
        if info["exists"]:
            webtoon_settings = load_json(webtoon_settings_path) or {}
            webtoon_connectai = extract_connectai_settings(webtoon_settings)
            print(f"  Connect AI 설정 {len(webtoon_connectai)}개 발견:")
            for k, v in webtoon_connectai.items():
                val_str = str(v)[:80] + "..." if len(str(v)) > 80 else str(v)
                print(f"    {k}: {val_str}")
        else:
            print(f"  [경고] settings.json 없음: {webtoon_settings_path}")
    else:
        print(f"\n[경고] '{TARGET_PROFILE_NAME}' 프로필을 찾지 못했습니다.")
        print(f"  발견된 프로필: {list(profiles.keys())}")

    # 소스 결정: 웹툰 프로필 설정이 있으면 사용, 없으면 전역 설정 사용
    source_settings = webtoon_connectai if webtoon_connectai else global_connectai

    if not source_settings:
        print("\n[오류] 복사할 Connect AI 설정값을 찾을 수 없습니다.")
        print("  → '웹툰' 프로필에서 Connect AI 설정을 한 번 저장해 주세요.")
        return

    print(f"\n[6] 복사할 설정 ({len(source_settings)}개):")
    for k, v in source_settings.items():
        val_str = str(v)[:80] + "..." if len(str(v)) > 80 else str(v)
        print(f"  {k}: {val_str}")

    # 전역 settings.json에 적용 (모든 프로필에 기본값으로 적용됨)
    print(f"\n[7] 전역 settings.json에 적용 중...")
    global_settings.update(source_settings)
    save_json(GLOBAL_SETTINGS, global_settings)
    print(f"  ✓ 전역 설정 업데이트 완료: {GLOBAL_SETTINGS}")

    # 기본값 프로필이 있으면 거기도 적용
    # (기본값 프로필은 별도 디렉토리 없이 전역 settings.json 사용)
    # 나머지 모든 프로필 settings.json에도 적용
    print(f"\n[8] 다른 프로필 설정 동기화 중...")
    for name, info in profiles.items():
        if name == TARGET_PROFILE_NAME:
            continue  # 원본 프로필은 건드리지 않음
        if info["exists"]:
            other_settings = load_json(info["settings_path"]) or {}
            other_settings.update(source_settings)
            save_json(info["settings_path"], other_settings)
            print(f"  ✓ '{name}' 프로필 동기화 완료")
        else:
            # settings.json이 없으면 새로 생성
            os.makedirs(info["dir"], exist_ok=True)
            save_json(info["settings_path"], dict(source_settings))
            print(f"  ✓ '{name}' 프로필 settings.json 새로 생성")

    print(f"\n{'='*60}")
    print(f"[★ 완료] Connect AI 설정 동기화 성공!")
    print(f"  이제 '웹툰' ↔ '기본값' 프로필 전환 시")
    print(f"  Connect AI 설정값이 동일하게 유지됩니다.")
    print(f"  VS Code를 재시작하거나 창을 새로고침하면 적용됩니다.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
