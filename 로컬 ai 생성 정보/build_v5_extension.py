import os
import zipfile
import json
import shutil
import re

# ============================================================
# 비전 모델 설정 (필요 시 변경)
# 주요 선택지: llava-phi3 (경량), llava:7b (표준), moondream (초경량)
# ============================================================
DEFAULT_VISION_MODEL = "llava-phi3"
TERMINAL_BRIDGE_PATH = r"C:\Users\Lee\.connect-ai-brain\로컈 ai 생성 정보\terminal_bridge.py"

def build_v5_ultimate():
    base_dir = r"C:\Users\Lee\.connect-ai-brain\로컬 ai 생성 정보"
    source_vsix = os.path.join(base_dir, "connect-ai-lab-2.2.15-Gemini-3.1-Pro-Evolution-V4.vsix")
    target_vsix = os.path.join(base_dir, "Connect-AI-Lab-V5-Ultimate.vsix")
    temp_dir = os.path.join(base_dir, "temp_vsix_build")

    if not os.path.exists(source_vsix):
        print(f"[오류] 원본 VSIX 파일을 찾을 수 없습니다: {source_vsix}")
        return

    print("[정보] 원본 VSIX 파일 압축 해제 중...")
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    with zipfile.ZipFile(source_vsix, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)

    # 1. package.json 업데이트
    package_json_path = os.path.join(temp_dir, "extension", "package.json")
    if os.path.exists(package_json_path):
        print("[정보] package.json 패치 중...")
        with open(package_json_path, 'r', encoding='utf-8') as f:
            pkg_data = json.load(f)
        
        pkg_data["name"] = "connect-ai-lab-v5-ultimate"
        pkg_data["displayName"] = "Connect AI Lab V5 (HTML Bug Fixed)"
        pkg_data["version"] = "9.9.99"

        with open(package_json_path, 'w', encoding='utf-8') as f:
            json.dump(pkg_data, f, indent=4, ensure_ascii=False)
    else:
        print("[경고] package.json 파일을 찾을 수 없습니다.")

    # 2. extension.js 업데이트
    ext_js_path = os.path.join(temp_dir, "extension", "extension.js")
    if not os.path.exists(ext_js_path):
        # 만약 out 폴더에 있다면
        ext_js_path = os.path.join(temp_dir, "extension", "out", "extension.js")

    if os.path.exists(ext_js_path):
        print(f"[정보] {os.path.basename(ext_js_path)} 코드 패치 중...")
        with open(ext_js_path, 'r', encoding='utf-8') as f:
            js_content = f.read()

        # HTML 엔티티 이스케이프 복구 및 작업 디렉토리 강제 고정 코드 삽입
        # 기존의 terminal.sendText(commandText) 부분을 찾아 교체합니다.
        patch_code = r"""
        // --- Connect AI Lab V5 Ultimate Patch Start ---
        commandText = commandText.replace(/```/g, '');
        commandText = commandText.replace(/&quot;/g, '"'); // 쌍따옴표 이스케이프 복구
        commandText = commandText.replace(/&#39;/g, "'"); // 홀따옴표 이스케이프 복구
        commandText = commandText.trim();
        
        // 작업 디렉토리 강제 고정 후 실행
        const safeCommand = `cd C:\\Users\\Lee\\.connect-ai-brain ; ` + commandText;
        terminal.sendText(safeCommand\1
        // --- Connect AI Lab V5 Ultimate Patch End ---
        """
        
        js_content, count = re.subn(r'terminal\.sendText\(\s*commandText(.*?\))', patch_code.strip(), js_content)
        
        if count > 0:
            print(f"[정보] 자바스크립트 코드에 패치를 성공적으로 적용했습니다. ({count}회 교체됨)")
        else:
            print("[경고] 'terminal.sendText(commandText)' 형태를 찾을 수 없어 자동 패치에 실패했습니다. 코드가 다를 수 있습니다.")

        with open(ext_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)

    # 3-A. 비전(이미지 분석) 명령 자동 라우팅 패치
    if os.path.exists(ext_js_path):
        print("[정보] 비전 명령 자동 라우팅 패치 적용 중...")
        with open(ext_js_path, 'r', encoding='utf-8') as f:
            js_content = f.read()

        # 이미지 분석 명령어를 감지하면 terminal_bridge.py analyze_image로 자동 라우팅하는 JS 코드
        vision_patch = r"""
// --- Connect AI Lab V5 Vision Patch Start ---
// 이미지 분석 관련 키워드 감지 → Ollama 비전 모델 자동 호출
const visionKeywords = [
    /이미지\s*(분석|설명|인식|확인|봐|봐줘|해석|읽어)/i,
    /사진\s*(분석|설명|인식|확인|봐|봐줘|해석|읽어)/i,
    /그림\s*(분석|설명|인식|확인|봐|봐줘|해석|읽어)/i,
    /\.(jpg|jpeg|png|gif|bmp|webp)\b/i,
    /analyze.{0,10}image/i,
    /vision.*analyz/i
];
const imagePathMatch = commandText.match(/([A-Za-z]:\\[^\s'"]+\.(?:jpg|jpeg|png|gif|bmp|webp)|https?:\/\/[^\s'"]+\.(?:jpg|jpeg|png|gif|bmp|webp))/i);
const isVisionCommand = visionKeywords.some(kw => kw.test(commandText)) && imagePathMatch;
if (isVisionCommand) {
    const imagePath = imagePathMatch[1];
    const bridgePath = String.raw`"""BRIDGE_PATH"""`;
    const visionCmd = `cd C:\\Users\\Lee\\.connect-ai-brain && python "${bridgePath}" analyze_image --image "${imagePath}" --prompt "이 이미지를 자세히 분석하고 한국어로 설명해줘"`;
    terminal.sendText(visionCmd);
} else {
// --- Connect AI Lab V5 Vision Patch End (original sendText below) ---
""".replace('BRIDGE_PATH', TERMINAL_BRIDGE_PATH.replace('\\', '\\\\'))

        # sendText 호출 직전에 비전 라우팅 코드 삽입 (else 블록 마무리는 원본 sendText 이후 닫음)
        js_content_vision, count_v = re.subn(
            r'(terminal\.sendText\()',
            vision_patch + r'\1',
            js_content,
            count=1
        )
        if count_v > 0:
            # else 블록 닫기 추가
            js_content_vision = js_content_vision.replace(
                '// --- Connect AI Lab V5 Vision Patch End (original sendText below) ---',
                '// --- Connect AI Lab V5 Vision Patch End (original sendText below) ---',
                1
            )
            # sendText 호출 다음 ';' 이후에 } 추가
            js_content_vision = re.sub(
                r'(terminal\.sendText\([^;]+;)',
                r'\1\n}',
                js_content_vision,
                count=1
            )
            js_content = js_content_vision
            print(f"[정보] 비전 라우팅 패치 적용 성공 ({count_v}곳)")
        else:
            print("[경고] 비전 패치 삽입 위치를 찾지 못했습니다. extension.js 구조를 수동으로 확인하세요.")

        with open(ext_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
    else:
        print("[경고] extension.js 파일을 찾을 수 없습니다. 비전 패치 생략됨.")


    # 3-B. 글씨 크기 16px 패치 (CSS 파일 및 WebView HTML 인라인 스타일)
    print("[정보] 글씨 크기 16px 패치 적용 중...")
    font_patch_count = 0

    # CSS 파일 탐색 후 font-size 교체 또는 body에 추가
    for root, dirs, files in os.walk(temp_dir):
        for file in files:
            if file.endswith('.css'):
                css_path = os.path.join(root, file)
                with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
                    css_content = f.read()
                # 기존 font-size 값을 16px로 교체
                new_css, n = re.subn(r'font-size\s*:\s*[\d.]+px', 'font-size: 16px', css_content)
                # body 또는 :root에 font-size가 없으면 맨 앞에 주입
                if n == 0:
                    new_css = 'body, * { font-size: 16px !important; }\n' + css_content
                    n = 1
                with open(css_path, 'w', encoding='utf-8') as f:
                    f.write(new_css)
                font_patch_count += n
                print(f"  [CSS] {file} → {n}곳 패치")

    # extension.js WebView HTML 문자열 내 font-size 교체 또는 <style> 주입
    if os.path.exists(ext_js_path):
        with open(ext_js_path, 'r', encoding='utf-8') as f:
            js_content = f.read()
        # 인라인 font-size 값 교체
        new_js, n = re.subn(r'font-size\s*:\s*[\d.]+px', 'font-size: 16px', js_content)
        # <head> 태그 바로 뒤에 전역 스타일 주입 (WebView HTML 대상)
        style_inject = '<style>body,div,p,span,li,td,input,textarea,button{font-size:16px !important;}</style>'
        new_js2, n2 = re.subn(r'(<head[^>]*>)', r'\1' + style_inject, new_js)
        if n2 > 0:
            new_js = new_js2
            font_patch_count += n2
            print(f"  [JS] WebView <head>에 font-size:16px 스타일 주입 ({n2}곳)")
        elif n > 0:
            print(f"  [JS] 인라인 font-size → 16px 교체 ({n}곳)")
            font_patch_count += n
        else:
            print("  [JS] font-size 선언을 찾지 못해 <head> 주입 시도 생략됨 (WebView HTML 구조 확인 필요)")
        with open(ext_js_path, 'w', encoding='utf-8') as f:
            f.write(new_js)

    print(f"[정보] 글씨 크기 패치 완료 (총 {font_patch_count}곳 적용)")

    # 4. extension.vsixmanifest 업데이트
    manifest_path = os.path.join(temp_dir, "extension.vsixmanifest")
    if os.path.exists(manifest_path):
        print("[정보] extension.vsixmanifest 패치 중...")
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest_content = f.read()
        
        manifest_content = re.sub(r'<Identity Id="[^"]+"', r'<Identity Id="connect-ai-lab-v5-ultimate"', manifest_content)
        manifest_content = re.sub(r'Version="[^"]+"', r'Version="9.9.99"', manifest_content)
        manifest_content = re.sub(r'<DisplayName>[^<]+</DisplayName>', r'<DisplayName>Connect AI Lab V5 (HTML Bug Fixed)</DisplayName>', manifest_content)
        
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(manifest_content)

    print("[정보] V5 Ultimate VSIX 파일로 재조립 중...")
    def zipdir(path, ziph):
        for root, dirs, files in os.walk(path):
            for file in files:
                file_path = os.path.join(root, file)
                # zip 파일 내에서의 상대 경로 지정
                arcname = os.path.relpath(file_path, path)
                ziph.write(file_path, arcname)

    with zipfile.ZipFile(target_vsix, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipdir(temp_dir, zipf)

    print(f"\n[★ 성공] 빌드 완료! 최종 파일이 생성되었습니다: {target_vsix}")
    
    # 임시 폴더 삭제
    shutil.rmtree(temp_dir)

if __name__ == "__main__":
    build_v5_ultimate()
