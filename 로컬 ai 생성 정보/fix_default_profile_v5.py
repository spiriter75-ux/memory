"""
Connect AI Lab V5 - 기본값 프로필 완전 수정 + GlobalSettings VSIX 빌드
=======================================================================
목적:
  1. V5 Ultimate VSIX → package.json 모든 설정에 scope:application 적용
     → Connect-AI-Lab-V5-HTMLFixed-GlobalSettings.vsix 생성
  2. 전역 settings.json(기본값 프로필) 에서 유튜버 악성 Connect AI 설정 제거
  3. 웹툰 프로필의 깨끗한 설정을 기본값/모든 프로필에 동기화

실행 방법:
  cd "c:\\Users\\Lee\\.connect-ai-brain\\로컬 ai 생성 정보"
  python fix_default_profile_v5.py
"""

import os
import json
import zipfile
import shutil
import re
from datetime import datetime

BASE_DIR = r"C:\Users\Lee\.connect-ai-brain\로컬 ai 생성 정보"
APPDATA = os.environ.get("APPDATA", "")
VSCODE_USER_DIR = os.path.join(APPDATA, "Code", "User")
PROFILES_DIR = os.path.join(VSCODE_USER_DIR, "profiles")
GLOBAL_SETTINGS = os.path.join(VSCODE_USER_DIR, "settings.json")

SOURCE_VSIX = os.path.join(BASE_DIR, "Connect-AI-Lab-V5-Ultimate.vsix")
TARGET_VSIX = os.path.join(BASE_DIR, "Connect-AI-Lab-V5-HTMLFixed-GlobalSettings.vsix")
TEMP_DIR    = os.path.join(BASE_DIR, "temp_v5_patch")

WEBTOON_PROFILE_NAME = "웹툰"

# 유튜버/악성 Connect AI 관련 키워드 (제거 대상)
MALICIOUS_PATTERNS = [
    "youtu",
    "youtube",
    "채널",
    "구독",
    "링크",
]

CONNECTAI_PATTERNS = ["connectai", "connect-ai", "connect_ai", "connectailab"]


# ─────────────────────────────────────────────────────────────────────────────
def is_connectai_key(key: str) -> bool:
    k = key.lower()
    return any(p in k for p in CONNECTAI_PATTERNS)


def is_malicious_value(value) -> bool:
    """값에 유튜버/악성 URL이 포함되어 있는지 확인"""
    val_str = str(value).lower()
    return any(p in val_str for p in MALICIOUS_PATTERNS)


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
        print(f"  [백업] {os.path.basename(backup)}")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"  [저장] {os.path.basename(path)}")


def find_profile_dir(name):
    if not os.path.exists(PROFILES_DIR):
        return None
    for entry in os.listdir(PROFILES_DIR):
        pd = os.path.join(PROFILES_DIR, entry)
        if not os.path.isdir(pd):
            continue
        pj = os.path.join(pd, "profile.json")
        if os.path.exists(pj):
            pdata = load_json(pj)
            if pdata.get("name") == name:
                return pd
    return None


# ─────────────────────────────────────────────────────────────────────────────
def step1_build_global_vsix():
    """VSIX에 scope:application 패치 → HTMLFixed-GlobalSettings.vsix 생성"""
    print("\n" + "="*65)
    print("[STEP 1] V5 VSIX → scope:application 패치 (기본값 프로필 적용)")
    print("="*65)

    if not os.path.exists(SOURCE_VSIX):
        print(f"  [오류] 원본 VSIX 없음: {SOURCE_VSIX}")
        return False

    print(f"  원본: {os.path.basename(SOURCE_VSIX)}")

    # 임시 디렉토리 초기화
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR)
    os.makedirs(TEMP_DIR)

    # VSIX 압축 해제
    print("  압축 해제 중...")
    with zipfile.ZipFile(SOURCE_VSIX, 'r') as z:
        z.extractall(TEMP_DIR)

    # package.json 패치
    pkg_path = os.path.join(TEMP_DIR, "extension", "package.json")
    if not os.path.exists(pkg_path):
        print("  [오류] package.json 없음")
        shutil.rmtree(TEMP_DIR)
        return False

    with open(pkg_path, 'r', encoding='utf-8') as f:
        pkg = json.load(f)

    config = pkg.get("contributes", {}).get("configuration", {})
    configs = config if isinstance(config, list) else [config]

    total_patched = 0
    already_ok = 0
    patched_keys = []
    removed_malicious = []

    for cfg in configs:
        props = cfg.get("properties", {})
        print(f"\n  설정 항목 {len(props)}개 검사:")

        for key, value in list(props.items()):
            current_scope = value.get("scope", "(없음-window)")

            # 악성 기본값 검사 (default 값에 유튜브 URL 등 포함 여부)
            default_val = value.get("default", "")
            if is_malicious_value(default_val):
                print(f"    ✗ [악성제거] {key}: default={str(default_val)[:60]}")
                value["default"] = ""  # 악성 기본값 제거
                removed_malicious.append(key)

            # scope 패치
            if value.get("scope") == "application":
                already_ok += 1
            else:
                value["scope"] = "application"
                total_patched += 1
                patched_keys.append(key)
                print(f"    ✓ {key}: {current_scope} → application")

    # 버전/이름 업데이트
    original_version = pkg.get("version", "unknown")
    pkg["version"] = "9.9.200"
    pkg["displayName"] = "Connect AI Lab V5 (HTML Fixed + Global Settings)"
    pkg["name"] = "connect-ai-lab-v5-global"
    print(f"\n  버전: {original_version} → 9.9.200")
    print(f"  이름: Connect AI Lab V5 (HTML Fixed + Global Settings)")

    with open(pkg_path, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=4, ensure_ascii=False)

    # vsixmanifest 업데이트
    manifest_path = os.path.join(TEMP_DIR, "extension.vsixmanifest")
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = f.read()
        manifest = re.sub(r'Version="[^"]+"', 'Version="9.9.200"', manifest)
        manifest = re.sub(r'<Identity Id="[^"]+"', '<Identity Id="connect-ai-lab-v5-global"', manifest)
        manifest = re.sub(
            r'<DisplayName>[^<]+</DisplayName>',
            '<DisplayName>Connect AI Lab V5 (HTML Fixed + Global Settings)</DisplayName>',
            manifest
        )
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(manifest)

    # VSIX 재조립
    print(f"\n  VSIX 재조립 중...")
    with zipfile.ZipFile(TARGET_VSIX, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(TEMP_DIR):
            for file in files:
                fp = os.path.join(root, file)
                arcname = os.path.relpath(fp, TEMP_DIR)
                zf.write(fp, arcname)

    shutil.rmtree(TEMP_DIR)

    print(f"\n  ★ VSIX 생성 완료!")
    print(f"    파일: {os.path.basename(TARGET_VSIX)}")
    print(f"    scope:application 적용: {total_patched}개")
    print(f"    이미 적용됨: {already_ok}개")
    if removed_malicious:
        print(f"    악성 기본값 제거: {len(removed_malicious)}개")
        for k in removed_malicious:
            print(f"      - {k}")

    return True


# ─────────────────────────────────────────────────────────────────────────────
def step2_clean_default_profile():
    """기본값 프로필(전역 settings.json)에서 악성 Connect AI 설정 제거"""
    print("\n" + "="*65)
    print("[STEP 2] '기본값' 프로필 악성 Connect AI 설정 제거")
    print("="*65)
    print(f"  파일: {GLOBAL_SETTINGS}")

    if not os.path.exists(GLOBAL_SETTINGS):
        print("  [경고] 전역 settings.json 없음")
        return {}

    settings = load_json(GLOBAL_SETTINGS)
    connectai_keys = [k for k in settings if is_connectai_key(k)]

    if not connectai_keys:
        print("  Connect AI 설정 없음 → 이미 깨끗함")
        return {}

    print(f"\n  발견된 Connect AI 설정 ({len(connectai_keys)}개):")
    removed = {}
    kept = {}

    for k in connectai_keys:
        v = settings[k]
        val_str = str(v)[:80] + "..." if len(str(v)) > 80 else str(v)
        if is_malicious_value(v):
            print(f"    ✗ [악성-제거] {k}: {val_str}")
            removed[k] = v
            del settings[k]
        else:
            print(f"    ✓ [유지] {k}: {val_str}")
            kept[k] = v

    if removed:
        print(f"\n  → {len(removed)}개 악성 설정 제거됨")
        save_json_with_backup(GLOBAL_SETTINGS, settings)
    else:
        print("\n  악성 설정 없음 → 변경 없음")

    return kept


# ─────────────────────────────────────────────────────────────────────────────
def step3_sync_webtoon_to_default(default_kept: dict):
    """웹툰 프로필 설정을 기본값 프로필에 동기화"""
    print("\n" + "="*65)
    print("[STEP 3] '웹툰' 프로필 → '기본값' 프로필 동기화")
    print("="*65)

    webtoon_dir = find_profile_dir(WEBTOON_PROFILE_NAME)
    if not webtoon_dir:
        print(f"  [경고] '{WEBTOON_PROFILE_NAME}' 프로필 디렉토리 없음")
        print(f"  현재 프로필 목록:")
        if os.path.exists(PROFILES_DIR):
            for entry in os.listdir(PROFILES_DIR):
                pd = os.path.join(PROFILES_DIR, entry)
                pj = os.path.join(pd, "profile.json")
                if os.path.exists(pj):
                    pdata = load_json(pj)
                    print(f"    - '{pdata.get('name','?')}' ({entry})")
        print("\n  → 웹툰 프로필이 없으므로 동기화 생략")
        return {}

    wt_settings_path = os.path.join(webtoon_dir, "settings.json")
    wt_settings = load_json(wt_settings_path)
    wt_connectai = {k: v for k, v in wt_settings.items() if is_connectai_key(k)}

    if not wt_connectai:
        print(f"  [경고] '{WEBTOON_PROFILE_NAME}' 프로필에 Connect AI 설정 없음")
        return {}

    print(f"  '{WEBTOON_PROFILE_NAME}' 설정 {len(wt_connectai)}개:")
    for k, v in wt_connectai.items():
        val_str = str(v)[:80] + "..." if len(str(v)) > 80 else str(v)
        print(f"    ✓ {k}: {val_str}")

    # 기본값 프로필에 적용
    gs = load_json(GLOBAL_SETTINGS) if os.path.exists(GLOBAL_SETTINGS) else {}
    gs.update(wt_connectai)
    save_json_with_backup(GLOBAL_SETTINGS, gs)
    print(f"\n  ✓ '기본값' 프로필에 {len(wt_connectai)}개 설정 적용")

    # 다른 named 프로필들도 동기화
    print(f"\n  다른 프로필 동기화:")
    if os.path.exists(PROFILES_DIR):
        for entry in os.listdir(PROFILES_DIR):
            pd = os.path.join(PROFILES_DIR, entry)
            if not os.path.isdir(pd):
                continue
            pj = os.path.join(pd, "profile.json")
            pdata = load_json(pj) if os.path.exists(pj) else {}
            pname = pdata.get("name", entry)
            if pname == WEBTOON_PROFILE_NAME:
                continue
            ps = os.path.join(pd, "settings.json")
            other = load_json(ps) if os.path.exists(ps) else {}
            # 기존 악성 Connect AI 제거 후 웹툰 설정 적용
            for k in list(other.keys()):
                if is_connectai_key(k):
                    del other[k]
            other.update(wt_connectai)
            os.makedirs(pd, exist_ok=True)
            save_json_with_backup(ps, other)
            print(f"    ✓ '{pname}' 프로필 동기화 완료")

    return wt_connectai


# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 65)
    print("  Connect AI Lab V5 - 기본값 프로필 완전 수정 도구")
    print("  (HTML Bug Fixed + Global Settings + 악성 설정 제거)")
    print("=" * 65)

    # STEP 1: VSIX 빌드
    vsix_ok = step1_build_global_vsix()

    # STEP 2: 기본값 프로필 악성 설정 제거
    kept = step2_clean_default_profile()

    # STEP 3: 웹툰 → 기본값 동기화
    synced = step3_sync_webtoon_to_default(kept)

    # 최종 요약
    print("\n" + "=" * 65)
    print("  ★ 모든 작업 완료!")
    print("=" * 65)

    if vsix_ok:
        print(f"\n  [VSIX] {os.path.basename(TARGET_VSIX)}")
        print(f"         → VS Code에서 설치: Ctrl+Shift+X → '...' → Install from VSIX")

    print(f"\n  [설정] 기본값 프로필 동기화: {len(synced)}개 설정 적용됨")
    print(f"\n  [다음 단계]")
    print(f"  1. 기존 Connect AI Lab 확장 제거 (VS Code Extensions에서)")
    print(f"  2. {os.path.basename(TARGET_VSIX)} 설치")
    print(f"  3. VS Code 재시작 또는 Ctrl+Shift+P → Reload Window")
    print(f"  4. 기본값 / 웹툰 프로필 전환해도 동일한 설정 유지 확인")
    print("=" * 65)


if __name__ == "__main__":
    main()
