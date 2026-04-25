import os
import sys
import argparse
import subprocess

def create_md_file(filename, content):
    """지정된 경로에 마크다운 파일을 생성합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        
        # 전달받은 filename에 어떤 폴더 경로가 섞여있든 다 무시하고 순수 파일명(basename)만 추출
        # 예: "C:\Users\Lee\.connect-ai-brain/Test.md" -> "Test.md"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        
        # 무조건 루트 폴더(base_dir) 바로 아래에 저장하도록 경로 대못 박기
        full_path = os.path.join(base_dir, pure_filename)
            
        # 파일이 저장될 디렉토리 경로 추출
        directory = os.path.dirname(full_path)
        
        # 디렉토리가 존재하지 않으면 생성
        if directory:
            os.makedirs(directory, exist_ok=True)
        
        # 파일 쓰기 모드로 생성 (utf-8 인코딩)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        print(f"[SUCCESS] 파일 생성 완료: {full_path}")
        return True
    except Exception as e:
        print(f"[ERROR] 파일 생성 실패: {str(e)}")
        return False

def github_sync(commit_message="Auto-sync by Connect AI"):
    """작업 디렉토리의 변경사항을 깃허브에 동기화(add, commit, push)합니다."""
    try:
        target_dir = r"C:\Users\Lee\.connect-ai-brain"
        print(f"[INFO] 작업 디렉토리 변경: {target_dir}")
        os.chdir(target_dir)
        
        print("[INFO] Git Add 실행 중...")
        subprocess.run(["git", "add", "."], check=True)
        
        print(f"[INFO] Git Commit 실행 중... (메시지: '{commit_message}')")
        # 커밋할 변경사항이 없을 때 에러가 나지 않도록 처리
        result = subprocess.run(["git", "commit", "-m", commit_message], capture_output=True, text=True)
        
        if "nothing to commit" in result.stdout or "nothing added to commit" in result.stdout:
            print("[INFO] 커밋할 새로운 변경사항이 없습니다.")
            return True
            
        print("[INFO] Git Push 실행 중...")
        subprocess.run(["git", "push"], check=True)
        
        print("[SUCCESS] 깃허브 동기화 완료!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] 깃허브 명령어 실행 중 오류 발생 (반환 코드: {e.returncode})")
        print(f"[ERROR] 상세: Git이 해당 폴더에 초기화되어 있는지, 원격 저장소가 연결되어 있는지 확인하세요.")
        return False
    except Exception as e:
        print(f"[ERROR] 예기치 않은 오류 발생: {str(e)}")
        return False

def main():
    # 터미널에서 인자를 받아 실행할 수 있도록 argparse 설정
    parser = argparse.ArgumentParser(description="Connect AI 전용 터미널 브릿지 도구")
    subparsers = parser.add_subparsers(dest="command", help="사용 가능한 기능 목록")

    # 1. create_md_file 명령어
    parser_create = subparsers.add_parser("create_md_file", help="MD 파일 생성 기능")
    parser_create.add_argument("--filename", required=True, help="생성할 파일의 전체 경로 및 이름 (예: C:/경로/파일.md)")
    parser_create.add_argument("--content", required=True, help="파일에 입력할 내용")

    # 2. github_sync 명령어
    parser_sync = subparsers.add_parser("github_sync", help="Github 자동 동기화 기능")
    parser_sync.add_argument("--message", default="Auto-sync by Connect AI", help="커밋 메시지 (선택 사항)")

    # 파라미터 파싱
    args = parser.parse_args()

    # 인자가 없을 경우 도움말 출력
    if not args.command:
        parser.print_help()
        sys.exit(1)

    # 명령어에 따른 함수 실행
    if args.command == "create_md_file":
        # 터미널 문자열로 전달된 이스케이프 줄바꿈(\n)을 실제 줄바꿈으로 치환
        content = args.content.replace('\\n', '\n')
        create_md_file(args.filename, content)
        
    elif args.command == "github_sync":
        github_sync(args.message)

    if __name__ == "__main__":
       main()
       commandText = commandText.replace(/```/g, '');
       commandText = commandText.replace(/&quot;/g, '"'); // 쌍따옴표 이스케이프 복구
       commandText = commandText.replace(/&#39;/g, "'"); // 홀따옴표 이스케이프 복구
       commandText = commandText.trim();
       ```

## 4. 깃허브 경로 고정 (경로 이탈 방지)
- 터미널 명령어 실행 시, 현재 터미널의 위치와 무관하게 항상 지식 창고 루트 폴더에서 명령이 실행되도록 하드코딩한다.
  ```javascript
  // 3단계: 작업 디렉토리 강제 고정 후 실행
  const safeCommand = `cd C:\\Users\\Lee\\.connect-ai-brain ; ` + commandText;
  terminal.sendText(safeCommand);
  ```

## 5. 패키지 정보 업데이트 (package.json)
- **타겟 파일:** `extension/package.json`
- 자동 업데이트로 인한 환경 파괴를 막기 위해 버전을 최상위로 고정한다.
  ```json
  "name": "connect-ai-lab-v5-ultimate",
  "displayName": "Connect AI Lab V5 (HTML Bug Fixed)",
  "version": "9.9.99"
  ```

## 6. 재조립 및 빌드 (Repackaging)
1. 수정이 완료된 `extension` 폴더 내부 파일들과 `[Content_Types].xml`, `extension.vsixmanifest` 등을 최상위 경로로 묶어 다시 압축(.zip)한다.
2. 확장자를 `.vsix`로 변경하여 최종 **`Connect-AI-Lab-V5-Ultimate.vsix`** 파일을 생성하라.
3. 생성된 코드를 바탕으로 내가 즉시 적용할 수 있도록 패치된 전체 스크립트 코드나 빌드 방법을 나에게 제공하라.
