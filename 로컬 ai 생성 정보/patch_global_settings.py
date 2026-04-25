"""
Connect AI Lab V5 - 프로필 독립 설정 패치 스크립트
==================================================
문제: VS Code 프로필 변경 시 Connect AI 설정값이 달라지는 현상
원인: package.json의 contributes.configuration 설정에 scope가 없어
      기본값인 "window" (프로필별 독립) 로 동작
해결: 모든 Connect AI 설정에 "scope": "application" 추가
      → 프로필에 상관없이 전역으로 설정값 공유
"""

import os
import zipfile
import json
import shutil

def patch_scope_to_application():
    base_dir = r"C:\Users\Lee\.connect-ai-brain\로컬 ai 생성 정보"
    
    # V5 Ultimate VSIX 기준으로 패치 (없으면 V4도 시도)
    source_vsix = os.path.join(base_dir, "Connect-AI-Lab-V5-Ultimate.vsix")
    if not os.path.exists(source_vsix):
        source_vsix = os.path.join(base_dir, "connect-ai-lab-2.2.15-Gemini-3.1-Pro-Evolution-V4.vsix")
    
    target_vsix = os.path.join(base_dir, "Connect-AI-Lab-V5-GlobalSettings.vsix")
    temp_dir = os.path.join(base_dir, "temp_scope_patch")

    if not os.path.exists(source_vsix):
        print(f"[오류] 원본 VSIX를 찾을 수 없습니다: {source_vsix}")
        return

    print(f"[정보] 원본 파일: {os.path.basename(source_vsix)}")
    print("[정보] VSIX 압축 해제 중...")

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    with zipfile.ZipFile(source_vsix, 'r') as z:
        z.extractall(temp_dir)

    # package.json 찾기
    pkg_path = os.path.join(temp_dir, "extension", "package.json")
    if not os.path.exists(pkg_path):
        print("[오류] package.json을 찾을 수 없습니다.")
        shutil.rmtree(temp_dir)
        return

    print("[정보] package.json 분석 중...")
    with open(pkg_path, 'r', encoding='utf-8') as f:
        pkg = json.load(f)

    # contributes.configuration.properties 탐색
    config = pkg.get("contributes", {}).get("configuration", {})
    
    # configuration이 리스트일 수도 있음
    if isinstance(config, list):
        configs = config
    else:
        configs = [config]

    total_patched = 0
    already_application = 0
    patched_keys = []

    for cfg in configs:
        props = cfg.get("properties", {})
        print(f"\n[정보] 설정 항목 {len(props)}개 발견:")
        
        for key, value in props.items():
            current_scope = value.get("scope", "(없음 - 기본값 window)")
            print(f"  - {key}")
            print(f"    scope: {current_scope}", end="")
            
            if value.get("scope") == "application":
                print(" → 이미 application (변경 불필요)")
                already_application += 1
            else:
                value["scope"] = "application"
                total_patched += 1
                patched_keys.append(key)
                print(f" → application 으로 변경 ✓")

    if total_patched == 0 and already_application > 0:
        print(f"\n[정보] 모든 설정({already_application}개)이 이미 application scope입니다.")
        print("[정보] 프로필 변경 시 설정이 바뀌는 다른 원인을 확인해야 합니다.")
    
    # 버전 정보 업데이트
    pkg["version"] = "9.9.100"
    pkg["displayName"] = "Connect AI Lab V5 (Global Settings)"
    pkg["name"] = "connect-ai-lab-v5-global"

    with open(pkg_path, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=4, ensure_ascii=False)

    print(f"\n[정보] 총 {total_patched}개 설정에 'scope: application' 적용 완료")

    # vsixmanifest 업데이트
    manifest_path = os.path.join(temp_dir, "extension.vsixmanifest")
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = f.read()
        import re
        manifest = re.sub(r'Version="[^"]+"', 'Version="9.9.100"', manifest)
        manifest = re.sub(r'<Identity Id="[^"]+"', '<Identity Id="connect-ai-lab-v5-global"', manifest)
        manifest = re.sub(r'<DisplayName>[^<]+</DisplayName>', '<DisplayName>Connect AI Lab V5 (Global Settings)</DisplayName>', manifest)
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(manifest)

    # 재조립
    print("[정보] VSIX 재조립 중...")
    with zipfile.ZipFile(target_vsix, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                fp = os.path.join(root, file)
                arcname = os.path.relpath(fp, temp_dir)
                zf.write(fp, arcname)

    shutil.rmtree(temp_dir)

    print(f"\n{'='*60}")
    print(f"[★ 성공] 패치 완료!")
    print(f"  출력 파일: {target_vsix}")
    print(f"  패치된 설정 수: {total_patched}개")
    print(f"\n[설치 방법]")
    print(f"  VS Code → Extensions (Ctrl+Shift+X)")
    print(f"  → '...' 메뉴 → 'Install from VSIX...'")
    print(f"  → Connect-AI-Lab-V5-GlobalSettings.vsix 선택")
    print(f"\n[효과]")
    print(f"  프로필(웹툰/기본값/기타)을 변경해도")
    print(f"  Connect AI 설정값이 동일하게 유지됩니다.")

    # 패치된 설정 목록 출력
    if patched_keys:
        print(f"\n[패치된 설정 목록]")
        for k in patched_keys:
            print(f"  ✓ {k}")

if __name__ == "__main__":
    patch_scope_to_application()
