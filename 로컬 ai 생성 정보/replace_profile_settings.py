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

# Connect AI 관련 설정 키 패턴 (소문자로 비교)
CONNECTAI_PATTERNS = [
    "connectai",
    "connect-ai",
    "connect_ai",
    "connectailab",
]


def is_connectai_key(key):
    key_lower = key.lower()
    return any(p in key_lower for p in CONNECTAI_PATTERNS)


def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  [오류] 읽기 실패 ({path}): {e}")
        return {}


def save_json_with_backup(path, data):
    if os.path.exists(path):
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup = path + f".bak_{ts}"
        shutil.copy2(path, backup)
        print(f"  [백업 생성] {os.path.basename(backup)}")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"  [저장 완료] {path}")


def find_profile_dir(name):
    """이름으로 프로필 디렉토리 찾기"""
    if not os.path.exists(PROFILES_DIR):
        return None
    for entry in os.listdir(PROFILES_DIR):
        profile_dir = os.path.join(PROFILES_DIR, entry)
        if not os.path.isdir(profile_dir):
            continue
        pj = os.path.join(profile_dir, "profile.json")
        if os.path.exists(pj):
            pdata = load_json(pj)
            if pdata.get("name") == name:
                return profile_dir
    return None


def main():
    print("=" * 65)
    print("  Connect AI 프로필 완전 교체 도구")
    print("  기본값 → 웹툰 설정으로 완전 교체 + 유해 링크 제거")
    print("=" * 65)

    # ── STEP 1: 웹툰 프로필 설정 읽기 ──────────────────────────────
    print(f"\n[STEP 1] '{TARGET_PROFILE_NAME}' 프로필 설정 읽기")
    webtoon_dir = find_profile_dir(TARGET_PROFILE_NAME)

    if webtoon_dir:
        webtoon_settings_path = os.path.join(webtoon_dir, "settings.json")
        print(f"  경로: {webtoon_settings_path}")
        webtoon_settings = load_json(webtoon_settings_path)
    else:
        print(f"  [경고] '{TARGET_PROFILE_NAME}' 프로필 디렉토리를 찾지 못했습니다.")
        print(f"  탐색 경로: {PROFILES_DIR}")
        print(f"\n  발견된 프로필 목록:")
        if os.path.exists(PROFILES_DIR):
            for entry in os.listdir(PROFILES_DIR):
                pd = os.path.join(PROFILES_DIR, entry)
                pj = os.path.join(pd, "profile.json")
                if os.path.exists(pj):
                    pdata = load_json(pj)
                    print(f"    - '{pdata.get('name', '?')}' ({entry})")
        webtoon_settings = {}

    if not webtoon_settings:
        print(f"  [오류] '{TARGET_PROFILE_NAME}' 프로필 설정을 읽을 수 없습니다. 종료합니다.")
        return

    webtoon_connectai = {k: v for k, v in webtoon_settings.items() if is_connectai_key(k)}
    print(f"  '{TARGET_PROFILE_NAME}' Connect AI 설정 {len(webtoon_connectai)}개 발견:")
    for k, v in webtoon_connectai.items():
        val_str = str(v)[:90] + "..." if len(str(v)) > 90 else str(v)
        print(f"    ✓ {k}: {val_str}")

    # ── STEP 2: 기본값 프로필 Connect AI 설정 확인 및 삭제 ─────────
    print(f"\n[STEP 2] '기본값' 프로필 Connect AI 설정 확인 및 삭제")
    print(f"  파일: {GLOBAL_SETTINGS}")
    default_settings = load_json(GLOBAL_SETTINGS)

    default_connectai = {k: v for k, v in default_settings.items() if is_connectai_key(k)}

    if default_connectai:
        print(f"  삭제 대상 ({len(default_connectai)}개):")
        for k, v in default_connectai.items():
            val_str = str(v)[:90] + "..." if len(str(v)) > 90 else str(v)
            print(f"    ✗ {k}: {val_str}")

        # 기본값 프로필에서 Connect AI 설정 전부 제거
        for k in list(default_connectai.keys()):
            del default_settings[k]
        print(f"\n  → {len(default_connectai)}개 삭제됨 (유튜버 링크 포함)")
    else:
        print(f"  '기본값' 프로필에 Connect AI 설정 없음")

    # ── STEP 3: 웹툰 설정을 기본값 프로필에 적용 ───────────────────
    print(f"\n[STEP 3] '{TARGET_PROFILE_NAME}' Connect AI 설정 → '기본값' 프로필에 적용")
    default_settings.update(webtoon_connectai)
    save_json_with_backup(GLOBAL_SETTINGS, default_settings)
    print(f"  → {len(webtoon_connectai)}개 설정 적용 완료")

    # ── STEP 4: 다른 named 프로필도 동기화 ─────────────────────────
    print(f"\n[STEP 4] 다른 프로필들도 동기화")
    if os.path.exists(PROFILES_DIR):
        for entry in os.listdir(PROFILES_DIR):
            pd = os.path.join(PROFILES_DIR, entry)
            if not os.path.isdir(pd):
                continue
            pj = os.path.join(pd, "profile.json")
            pdata = load_json(pj) if os.path.exists(pj) else {}
            pname = pdata.get("name", entry)

            if pname == TARGET_PROFILE_NAME:
                continue  # 웹툰 프로필은 건드리지 않음

            ps = os.path.join(pd, "settings.json")
            other = load_json(ps) if os.path.exists(ps) else {}

            # 기존 Connect AI 설정 제거 후 웹툰 설정 적용
            for k in list(other.keys()):
                if is_connectai_key(k):
                    del other[k]
            other.update(webtoon_connectai)

            os.makedirs(pd, exist_ok=True)
            save_json_with_backup(ps, other)
            print(f"  ✓ '{pname}' 프로필 동기화 완료")

    # ── 완료 ────────────────────────────────────────────────────────
    print(f"\n{'='*65}")
    print(f"[★ 완료] 모든 프로필에 '{TARGET_PROFILE_NAME}' 설정 적용 완료!")
    print(f"")
    print(f"  적용 내용:")
    print(f"  ✓ '기본값' 프로필 기존 Connect AI 설정 삭제 ({len(default_connectai)}개 제거)")
    print(f"  ✓ '{TARGET_PROFILE_NAME}' Connect AI 설정 적용 ({len(webtoon_connectai)}개)")
    print(f"  ✓ 유튜버 강제 링크 제거됨")
    print(f"")
    print(f"  → VS Code 재시작 또는 Ctrl+Shift+P → 'Reload Window' 실행")
    print(f"{'='*65}")


if __name__ == "__main__":
    main()
