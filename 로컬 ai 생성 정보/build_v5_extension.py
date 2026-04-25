import os
import zipfile
import shutil

# Connect AI Lab V5 빌드 스크립트
EXTENSION_DIR = "extension"
OUTPUT_VSIX = "Connect-AI-Lab-V5-Ultimate.vsix"

def build_extension():
    if not os.path.exists(EXTENSION_DIR):
        print("[ERROR] extension 폴더를 찾을 수 없습니다.")
        return

    print(f"[INFO] {OUTPUT_VSIX} 빌드 시작...")
    
    with zipfile.ZipFile(OUTPUT_VSIX, 'w', zipfile.ZIP_DEFLATED) as vsix:
        for root, dirs, files in os.walk(EXTENSION_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, EXTENSION_DIR)
                vsix.write(file_path, arcname)
                
    # 추가 메타데이터 파일 포함 (vsixmanifest 등)
    meta_files = ["[Content_Types].xml", "extension.vsixmanifest"]
    for f in meta_files:
        if os.path.exists(f):
            vsix.write(f, f)

    print(f"[SUCCESS] 빌드 완료: {OUTPUT_VSIX}")

if __name__ == "__main__":
    build_extension()
