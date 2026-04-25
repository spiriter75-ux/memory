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
# 설정 및 경로 (루트 폴더용)
# ============================================================
VISION_MODEL = "llava-phi3"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

def create_md_file(filename, content):
    """지정된 경로에 마크다운 파일을 생성합니다. (무조건 현재 폴더 기준)"""
    try:
        # 루트에 있으므로 현재 작업 디렉토리를 사용하거나 하드코딩
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[SUCCESS] 파일 생성 완료: {full_path}")
        return True
    except Exception as e:
        print(f"[ERROR] 파일 생성 실패: {str(e)}")
        return False

def github_sync(commit_message="Auto-sync by Connect AI"):
    """작업 디렉토리의 변경사항을 깃허브에 동기화합니다."""
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        os.chdir(base_dir)
        subprocess.run(["git", "add", "."], check=True)
        result = subprocess.run(["git", "commit", "-m", commit_message], capture_output=True, text=True)
        subprocess.run(["git", "push"], check=True)
        print("[SUCCESS] 깃허브 동기화 완료!")
        return True
    except Exception as e:
        print(f"[ERROR] 깃허브 동기화 실패: {str(e)}")
        return False

def search_web(query, max_results=5):
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

def list_files(extension=".md"):
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        files = [f for f in os.listdir(base_dir) if f.endswith(extension)]
        print(json.dumps(files, ensure_ascii=False, indent=2))
        return True
    except Exception as e:
        print(f"[ERROR] 목록 조회 실패: {str(e)}")
        return False

def read_file(filename):
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        with open(full_path, 'r', encoding='utf-8') as f:
            print(f.read())
        return True
    except Exception as e:
        print(f"[ERROR] 읽기 실패: {str(e)}")
        return False

def delete_file(filename):
    try:
        base_dir = r"C:\Users\Lee\.connect-ai-brain"
        pure_filename = os.path.basename(filename.replace('\\', '/'))
        full_path = os.path.join(base_dir, pure_filename)
        os.remove(full_path)
        print(f"[SUCCESS] 삭제 완료: {pure_filename}")
        return True
    except Exception as e:
        print(f"[ERROR] 삭제 실패: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    
    p_create = subparsers.add_parser("create_md_file")
    p_create.add_argument("--filename", required=True)
    p_create.add_argument("--content", required=True)
    
    p_sync = subparsers.add_parser("github_sync")
    p_sync.add_argument("--message", default="Auto-sync by Connect AI")
    
    p_search = subparsers.add_parser("search_web")
    p_search.add_argument("--query", required=True)
    
    p_list = subparsers.add_parser("list_files")
    p_list.add_argument("--ext", default=".md")
    
    p_read = subparsers.add_parser("read_file")
    p_read.add_argument("--filename", required=True)
    
    p_delete = subparsers.add_parser("delete_file")
    p_delete.add_argument("--filename", required=True)

    args = parser.parse_args()
    if args.command == "create_md_file": create_md_file(args.filename, args.content.replace('\\n', '\n'))
    elif args.command == "github_sync": github_sync(args.message)
    elif args.command == "search_web": search_web(args.query)
    elif args.command == "list_files": list_files(args.ext)
    elif args.command == "read_file": read_file(args.filename)
    elif args.command == "delete_file": delete_file(args.filename)

if __name__ == "__main__":
    main()
