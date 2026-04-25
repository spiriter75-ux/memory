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
# 설정 및 경로
# ============================================================
VISION_MODEL = "llava-phi3"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

def create_md_file(filename, content):
    """지정된 경로에 마크다운 파일을 생성합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        directory = os.path.dirname(full_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
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
        os.chdir(target_dir)
        subprocess.run(["git", "add", "."], check=True)
        result = subprocess.run(["git", "commit", "-m", commit_message], capture_output=True, text=True)
        if "nothing to commit" in result.stdout or "nothing added to commit" in result.stdout:
            return True
        subprocess.run(["git", "push"], check=True)
        print("[SUCCESS] 깃허브 동기화 완료!")
        return True
    except Exception as e:
        print(f"[ERROR] 깃허브 동기화 실패: {str(e)}")
        return False

def search_web(query, max_results=5):
    """웹 검색을 수행하고 결과를 JSON 형태로 반환합니다."""
    try:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results, region='kr-kr'):
                results.append({"title": r.get("title", ""), "link": r.get("href", ""), "snippet": r.get("body", "")})
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return True
    except Exception as e:
        print(f"[ERROR] 웹 검색 실패: {str(e)}")
        return False

def analyze_image(image_path, prompt="이 이미지를 자세히 분석하고 한국어로 설명해줘", model=None):
    use_model = model if model else VISION_MODEL
    try:
        if image_path.startswith("http"):
            with urllib.request.urlopen(image_path) as resp: image_data = resp.read()
        else:
            with open(image_path, "rb") as f: image_data = f.read()
        image_b64 = base64.b64encode(image_data).decode("utf-8")
        payload = {"model": use_model, "prompt": prompt, "images": [image_b64], "stream": False}
        req = urllib.request.Request(OLLAMA_API_URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        analysis = result.get("response", "[분석 결과 없음]")
        print(f"[분석 결과]\n{analysis}")
        return True
    except Exception as e:
        print(f"[ERROR] 이미지 분석 실패: {e}")
        return False

def list_files(extension=".md"):
    """지식 창고 폴더의 파일 목록을 나열합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        files = [f for f in os.listdir(base_dir) if f.endswith(extension)]
        print(json.dumps(files, ensure_ascii=False, indent=2))
        return True
    except Exception as e:
        print(f"[ERROR] 파일 목록 조회 실패: {str(e)}")
        return False

def read_file(filename):
    """지식 창고 폴더에서 특정 파일의 내용을 읽습니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        with open(full_path, 'r', encoding='utf-8') as f:
            print(f"--- FILE CONTENT START: {pure_filename} ---")
            print(f.read())
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
        os.remove(full_path)
        print(f"[SUCCESS] 파일 삭제 완료: {pure_filename}")
        return True
    except Exception as e:
        print(f"[ERROR] 파일 삭제 실패: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Connect AI 터미널 브릿지")
    subparsers = parser.add_subparsers(dest="command")
    
    p_create = subparsers.add_parser("create_md_file")
    p_create.add_argument("--filename", required=True)
    p_create.add_argument("--content", required=True)
    
    p_sync = subparsers.add_parser("github_sync")
    p_sync.add_argument("--message", default="Auto-sync by Connect AI")
    
    p_search = subparsers.add_parser("search_web")
    p_search.add_argument("--query", required=True)
    p_search.add_argument("--max_results", type=int, default=5)
    
    p_vision = subparsers.add_parser("analyze_image")
    p_vision.add_argument("--image", required=True)
    p_vision.add_argument("--prompt", default="이 이미지를 자세히 분석하고 한국어로 설명해줘")
    p_vision.add_argument("--model", default=None)
    
    p_list = subparsers.add_parser("list_files")
    p_list.add_argument("--ext", default=".md")
    
    p_read = subparsers.add_parser("read_file")
    p_read.add_argument("--filename", required=True)
    
    p_delete = subparsers.add_parser("delete_file")
    p_delete.add_argument("--filename", required=True)

    args = parser.parse_args()
    if not args.command: parser.print_help(); sys.exit(1)
    
    if args.command == "create_md_file": create_md_file(args.filename, args.content.replace('\\n', '\n'))
    elif args.command == "github_sync": github_sync(args.message)
    elif args.command == "search_web": search_web(args.query, args.max_results)
    elif args.command == "analyze_image": analyze_image(args.image, args.prompt, args.model)
    elif args.command == "list_files": list_files(args.ext)
    elif args.command == "read_file": read_file(args.filename)
    elif args.command == "delete_file": delete_file(args.filename)

if __name__ == "__main__":
    main()
