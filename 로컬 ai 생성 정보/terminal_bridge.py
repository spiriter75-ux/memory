import os
import sys
import argparse
import subprocess
import json
import base64
import urllib.request
import urllib.error

try:
    from duckduckgo_search import DDGS
except ImportError:
    pass

# ============================================================
# 비전 모델 설정 (필요 시 변경)
# 추천 모델: llava-phi3 (경량), llava:7b (표준), moondream (초경량)
# ============================================================
VISION_MODEL = "llava-phi3"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

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

def search_web(query, max_results=5):
    """웹 검색을 수행하고 결과를 JSON 형태로 로컬 AI에게 반환합니다."""
    try:
        results = []
        with DDGS() as ddgs:
            # 검색어로 웹 검색 수행
            for r in ddgs.text(query, max_results=max_results, region='kr-kr'):
                results.append({
                    "title": r.get("title", ""),
                    "link": r.get("href", ""),
                    "snippet": r.get("body", "") # 검색 내용 요약
                })
        
        # 로컬 AI가 읽고 분석하기 쉽도록 JSON 형태로 출력
        output = json.dumps(results, ensure_ascii=False, indent=2)
        print(output)
        return True
    except Exception as e:
        print(f"[ERROR] 웹 검색 실패: {str(e)}")
        return False

def analyze_image(image_path, prompt="이 이미지를 자세히 분석하고 한국어로 설명해줘", model=None):
    """
    Ollama 비전 모델을 사용해 이미지를 분석합니다.
    Connect AI에서 이미지 분석 명령을 받으면 자동으로 호출됩니다.
    
    Args:
        image_path: 분석할 이미지 파일 경로 (로컬) 또는 URL
        prompt: AI에게 전달할 분석 지시사항
        model: 사용할 Ollama 비전 모델 (기본값: VISION_MODEL 전역 설정)
    """
    use_model = model if model else VISION_MODEL

    # 1) 이미지 로드 → Base64 인코딩
    try:
        if image_path.startswith("http://") or image_path.startswith("https://"):
            # URL에서 이미지 다운로드
            with urllib.request.urlopen(image_path) as resp:
                image_data = resp.read()
            print(f"[INFO] URL에서 이미지 다운로드 완료: {image_path}")
        else:
            # 로컬 파일 읽기
            if not os.path.exists(image_path):
                print(f"[ERROR] 이미지 파일을 찾을 수 없습니다: {image_path}")
                return False
            with open(image_path, "rb") as f:
                image_data = f.read()
            print(f"[INFO] 로컬 이미지 로드 완료: {image_path} ({len(image_data)//1024}KB)")
        
        image_b64 = base64.b64encode(image_data).decode("utf-8")
    except Exception as e:
        print(f"[ERROR] 이미지 로드 실패: {e}")
        return False

    # 2) Ollama API 호출
    payload = {
        "model": use_model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False
    }

    print(f"[INFO] Ollama 비전 모델 호출 중... (모델: {use_model})")
    print(f"[INFO] 분석 요청: {prompt}")
    print("-" * 50)

    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_API_URL,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        
        analysis = result.get("response", "[분석 결과 없음]")
        print(f"[분석 결과]\n{analysis}")
        print("-" * 50)
        print(f"[SUCCESS] 이미지 분석 완료 (모델: {use_model})")

        # 결과를 파일로도 저장 (Connect AI가 읽을 수 있도록)
        result_path = os.path.join(
            r"C:\Users\Lee\.connect-ai-brain",
            "vision_analysis_result.md"
        )
        with open(result_path, "w", encoding="utf-8") as f:
            f.write(f"# 이미지 분석 결과\n\n")
            f.write(f"**파일:** `{image_path}`  \n")
            f.write(f"**모델:** `{use_model}`  \n")
            f.write(f"**요청:** {prompt}  \n\n")
            f.write(f"---\n\n{analysis}\n")
        print(f"[INFO] 분석 결과 저장됨: {result_path}")
        return True

    except urllib.error.URLError as e:
        print(f"[ERROR] Ollama 서버에 연결할 수 없습니다: {e}")
        print(f"[HELP] 다음 명령으로 Ollama를 시작하세요: ollama serve")
        print(f"[HELP] 비전 모델 설치: ollama pull {use_model}")
        return False
    except Exception as e:
        print(f"[ERROR] 이미지 분석 실패: {e}")
        return False


def list_files(extension=".md"):
    """지식 창고 폴더의 파일 목록을 나열합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        if not os.path.exists(base_dir):
            print(f"[ERROR] 지식 창고 폴더가 존재하지 않습니다: {base_dir}")
            return False
        files = [f for f in os.listdir(base_dir) if f.endswith(extension)]
        print(f"[SUCCESS] {len(files)}개의 파일을 찾았습니다.")
        print(json.dumps(files, ensure_ascii=False, indent=2))
        return True
    except Exception as e:
        print(f"[ERROR] 파일 목록 조회 실패: {str(e)}")
        return False

def read_file(filename):
    """지식 창고 폴더에서 특정 파일의 내용을 읽습니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        # 파일명만 추출하여 경로 이탈 방지
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        
        if not os.path.exists(full_path):
            print(f"[ERROR] 파일을 찾을 수 없습니다: {full_path}")
            return False
            
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
            print(f"--- FILE CONTENT START: {pure_filename} ---")
            print(content)
            print("--- FILE CONTENT END ---")
        return True
    except Exception as e:
        print(f"[ERROR] 파일 읽기 실패: {str(e)}")
        return False

def delete_file(filename):
    """지식 창고 폴더에서 특정 파일을 삭제합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        
        if not os.path.exists(full_path):
            print(f"[ERROR] 삭제할 파일을 찾을 수 없습니다: {full_path}")
            return False
            
        os.remove(full_path)
        print(f"[SUCCESS] 파일이 삭제되었습니다: {pure_filename}")
        return True
    except Exception as e:
        print(f"[ERROR] 파일 삭제 실패: {str(e)}")
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

    # 3. search_web 명령어
    parser_search = subparsers.add_parser("search_web", help="웹 검색 기능 (DuckDuckGo)")
    parser_search.add_argument("--query", required=True, help="검색어")
    parser_search.add_argument("--max_results", type=int, default=5, help="가져올 최대 검색 결과 수")

    # 4. analyze_image 명령어 (비전 기능)
    parser_vision = subparsers.add_parser("analyze_image", help="이미지 비전 분석 기능 (Ollama 비전 모델 사용)")
    parser_vision.add_argument("--image", required=True, help="분석할 이미지 경로 또는 URL")
    parser_vision.add_argument("--prompt", default="이 이미지를 자세히 분석하고 한국어로 설명해줘",
                               help="AI에게 전달할 분석 지시사항")
    parser_vision.add_argument("--model", default=None,
                               help=f"사용할 Ollama 비전 모델 (기본값: {VISION_MODEL})")

    # 5. list_files 명령어
    parser_list = subparsers.add_parser("list_files", help="지식 창고 파일 목록 조회")
    parser_list.add_argument("--ext", default=".md", help="파일 확장자 (기본값: .md)")

    # 6. read_file 명령어
    parser_read = subparsers.add_parser("read_file", help="지식 창고 파일 내용 읽기")
    parser_read.add_argument("--filename", required=True, help="읽을 파일명")

    # 7. delete_file 명령어
    parser_delete = subparsers.add_parser("delete_file", help="지식 창고 파일 삭제")
    parser_delete.add_argument("--filename", required=True, help="삭제할 파일명")

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
        
    elif args.command == "search_web":
        search_web(args.query, args.max_results)

    elif args.command == "analyze_image":
        analyze_image(args.image, args.prompt, args.model)

    elif args.command == "list_files":
        list_files(args.ext)

    elif args.command == "read_file":
        read_file(args.filename)

    elif args.command == "delete_file":
        delete_file(args.filename)

if __name__ == "__main__":
    main()
