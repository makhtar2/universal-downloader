import yt_dlp
import uuid
import threading
import queue
import asyncio
import os
import json
import time
import shutil
import urllib.parse
import subprocess
import secrets
from fastapi import FastAPI, Header, HTTPException, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

app = FastAPI(title="OmniDownloader API", version="2.0.0")

# Secret required to call admin endpoints. Unset by default so the endpoint
# fails closed (403) instead of being open to anyone.
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY")

def validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL invalide : seuls les liens http/https sont acceptés.")

def public_error_message(e: Exception, fallback: str) -> str:
    """Most yt-dlp errors are safe, user-readable strings (e.g. "Video
    unavailable"), so we forward them as-is. Anything that looks like it
    leaked internals (a local path or a traceback) is replaced by a generic
    message instead; the real exception is always logged server-side."""
    msg = str(e)
    if os.getcwd() in msg or "Traceback" in msg or 'File "' in msg:
        return fallback
    return msg

# Enable CORS for development. No cookies/sessions are used, so
# allow_credentials stays off (it's also invalid combined with a wildcard origin).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# In-memory storage for progress queues: task_id -> {"queue": Queue, "created": float}
download_tasks = {}

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format: str = "best"
    playlist_items: str | None = None
    convert_format: str | None = None

# Background thread to clean up downloads folder periodically
def cleanup_worker():
    while True:
        try:
            now = time.time()
            # Clean items older than 30 minutes (1800 seconds)
            max_age = 1800 
            if os.path.exists(DOWNLOAD_DIR):
                for item in os.listdir(DOWNLOAD_DIR):
                    item_path = os.path.join(DOWNLOAD_DIR, item)
                    # Check modified time or creation time
                    mtime = os.path.getmtime(item_path)
                    if now - mtime > max_age:
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                        else:
                            os.remove(item_path)
                        print(f"[Cleanup] Deleted expired download: {item}")

            # Prune orphaned progress queues (e.g. client never polled /api/progress)
            # so download_tasks doesn't grow unbounded in memory.
            stale_ids = [
                tid for tid, info in download_tasks.items()
                if now - info["created"] > max_age
            ]
            for tid in stale_ids:
                download_tasks.pop(tid, None)
            if stale_ids:
                print(f"[Cleanup] Pruned {len(stale_ids)} stale progress task(s)")
        except Exception as e:
            print(f"[Cleanup] Error in cleanup worker: {e}")
        # Run cleanup every 10 minutes
        time.sleep(600)

# Start the cleanup thread in background
cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
cleanup_thread.start()

# Upgrade yt-dlp on startup to make sure we have the latest scraper definitions
def upgrade_ytdlp():
    print("[Startup] Upgrading yt-dlp to prevent extraction errors...")
    try:
        result = subprocess.run(
            ["pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"[Startup] Upgrade successful: {result.stdout.strip()}")
    except Exception as e:
        print(f"[Startup] Failed to upgrade yt-dlp: {e}")

# Run upgrade in a separate thread on startup to avoid blocking API
threading.Thread(target=upgrade_ytdlp, daemon=True).start()

def download_worker(task_id: str, req: DownloadRequest):
    q = download_tasks[task_id]["queue"]

    try:
        validate_url(req.url)
    except ValueError as e:
        q.put({"status": "error", "message": str(e)})
        return

    target_dir = os.path.join(DOWNLOAD_DIR, task_id)
    os.makedirs(target_dir, exist_ok=True)
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            # Remove ANSI colors from percentage string
            percentage = d.get('_percent_str', '0.0%').strip()
            import re
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            percentage = ansi_escape.sub('', percentage)
            
            speed = d.get('_speed_str', 'N/A').strip()
            speed = ansi_escape.sub('', speed)
            
            eta = d.get('_eta_str', 'N/A').strip()
            eta = ansi_escape.sub('', eta)
            
            filename = d.get('filename', '')
            
            q.put({
                "status": "downloading", 
                "percentage": percentage, 
                "speed": speed, 
                "eta": eta, 
                "filename": filename
            })
        elif d['status'] == 'finished':
            q.put({
                "status": "finished", 
                "message": "Téléchargement terminé, traitement en cours..."
            })

    ydl_opts = {
        'outtmpl': f'{target_dir}/%(title)s.%(ext)s',
        'progress_hooks': [progress_hook],
        'nocheckcertificate': True,
        'restrictfilenames': True,  # Keep filenames web-safe (no spaces, special chars)
        # YouTube now requires solving a JS challenge (signature/n-param) to get
        # download URLs. yt-dlp only enables 'deno' by default, which isn't
        # installed here, causing every download to fail with HTTP 403.
        'js_runtimes': {'node': {}},
    }
    
    if req.playlist_items:
        ydl_opts['playlist_items'] = req.playlist_items

    # Format choices
    if req.format == "audio":
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        ydl_opts['merge_output_format'] = 'mp4'
        if req.format == "best":
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
        elif req.format in ["2160", "1080", "720", "480"]:
            ydl_opts['format'] = f'bestvideo[height<={req.format}]+bestaudio/best'
        else:
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            
        if req.convert_format and req.convert_format != 'none':
            if 'postprocessors' not in ydl_opts:
                ydl_opts['postprocessors'] = []
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegVideoConvertor',
                'preferedformat': req.convert_format,
            })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([req.url])
            
            files = os.listdir(target_dir)
            if not files:
                q.put({"status": "error", "message": "Aucun fichier téléchargé."})
                return
                
            if len(files) == 1:
                filename = files[0]
                quoted_filename = urllib.parse.quote(filename)
                q.put({
                    "status": "completed", 
                    "message": "Téléchargement terminé !", 
                    "download_url": f"/api/file/{task_id}/{quoted_filename}"
                })
            else:
                # Zip the directory if multiple files downloaded (e.g. playlist)
                zip_base = os.path.join(DOWNLOAD_DIR, task_id)
                shutil.make_archive(zip_base, 'zip', target_dir)
                q.put({
                    "status": "completed", 
                    "message": "Playlist téléchargée avec succès !", 
                    "download_url": f"/api/file/{task_id}/{task_id}.zip"
                })
                
    except Exception as e:
        print(f"[Error] download failed for task {task_id} ({req.url}): {e}")
        q.put({
            "status": "error",
            "message": public_error_message(e, "Le téléchargement a échoué. Vérifiez le lien ou réessayez plus tard."),
        })

@app.post("/api/info")
def get_video_info(request: InfoRequest):
    try:
        validate_url(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ydl_opts = {
        'nocheckcertificate': True,
        'quiet': True,
        'extract_flat': True,
        'js_runtimes': {'node': {}},
        'skip_download': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(request.url, download=False)
            
            # Detect platform from URL for custom branding in UI
            platform = "unknown"
            url_lower = request.url.lower()
            if "youtube.com" in url_lower or "youtu.be" in url_lower:
                platform = "youtube"
            elif "instagram.com" in url_lower:
                platform = "instagram"
            elif "tiktok.com" in url_lower:
                platform = "tiktok"
            elif "linkedin.com" in url_lower:
                platform = "linkedin"
            elif "twitter.com" in url_lower or "x.com" in url_lower:
                platform = "x"
            elif "facebook.com" in url_lower or "fb.watch" in url_lower:
                platform = "facebook"
            
            if info_dict.get('_type') == 'playlist':
                entries = []
                for idx, entry in enumerate(info_dict.get('entries', [])):
                    if entry:
                        entries.append({
                            "index": idx + 1,
                            "title": entry.get('title', 'Vidéo inconnue'),
                            "duration": entry.get('duration_string', ''),
                            "id": entry.get('id', '')
                        })
                return {
                    "is_playlist": True,
                    "title": info_dict.get('title', 'Playlist inconnue'),
                    "channel": info_dict.get('uploader', 'Chaîne inconnue'),
                    "entries": entries,
                    "thumbnail": '',
                    "platform": platform
                }
            else:
                return {
                    "is_playlist": False,
                    "title": info_dict.get('title', 'Vidéo inconnue'),
                    "thumbnail": info_dict.get('thumbnail', ''),
                    "duration": info_dict.get('duration_string', ''),
                    "channel": info_dict.get('uploader', 'Chaîne inconnue'),
                    "platform": platform
                }
    except Exception as e:
        print(f"[Error] /api/info failed for {request.url}: {e}")
        raise HTTPException(
            status_code=400,
            detail=public_error_message(e, "Impossible de récupérer les informations de cette vidéo."),
        )

@app.post("/api/download")
def start_download(request: DownloadRequest):
    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {"queue": queue.Queue(), "created": time.time()}

    t = threading.Thread(target=download_worker, args=(task_id, request))
    t.start()

    return {"task_id": task_id}

@app.get("/api/progress")
async def download_progress(request: Request, task_id: str):
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="Tâche introuvable")

    q = download_tasks[task_id]["queue"]

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    data = q.get_nowait()
                    yield {"data": json.dumps(data)}

                    if data["status"] in ["completed", "error"]:
                        break
                except queue.Empty:
                    await asyncio.sleep(0.2)
        finally:
            # Free the queue once the stream ends, whether it finished
            # normally or the client disconnected early.
            download_tasks.pop(task_id, None)

    return EventSourceResponse(event_generator())

# Serve the downloaded files
@app.get("/api/file/{task_id}/{filename:path}")
def download_file(task_id: str, filename: str, background_tasks: BackgroundTasks):
    # Unquote URL path segments
    filename = urllib.parse.unquote(filename)
    
    if filename.endswith(".zip"):
        file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.zip")
        dir_path = os.path.join(DOWNLOAD_DIR, task_id)
    else:
        file_path = os.path.join(DOWNLOAD_DIR, task_id, filename)
        dir_path = os.path.join(DOWNLOAD_DIR, task_id)

    # Reject any path that escapes DOWNLOAD_DIR (path traversal via filename/task_id)
    download_root = os.path.realpath(DOWNLOAD_DIR)
    real_file_path = os.path.realpath(file_path)
    if os.path.commonpath([real_file_path, download_root]) != download_root:
        raise HTTPException(status_code=400, detail="Chemin de fichier invalide.")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Le fichier n'existe pas ou a expiré.")

    def cleanup():
        try:
            # Let the response complete, wait a brief moment, then cleanup
            time.sleep(2)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                os.remove(file_path)
            if os.path.exists(dir_path) and os.path.isdir(dir_path):
                shutil.rmtree(dir_path)
            # Also remove zipped archive if it exists
            zip_file = os.path.join(DOWNLOAD_DIR, f"{task_id}.zip")
            if os.path.exists(zip_file):
                os.remove(zip_file)
            print(f"[Cleanup] Cleaned up directory and archives for task: {task_id}")
        except Exception as e:
            print(f"[Cleanup] Error doing immediate task cleanup: {e}")
            
    background_tasks.add_task(cleanup)
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")

# Admin endpoint to trigger manual update of yt-dlp
@app.post("/api/admin/update-ytdlp")
def manual_update_ytdlp(x_admin_key: str | None = Header(default=None)):
    if not ADMIN_API_KEY or not secrets.compare_digest(x_admin_key or "", ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    try:
        result = subprocess.run(
            ["pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            check=True
        )
        return {
            "status": "success",
            "message": "Mise à jour réussie !",
            "details": result.stdout.strip()
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Échec de la mise à jour: {str(e)}"}
        )

# Mount static files (served at the root)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.get("/sw.js")
def get_sw():
    return FileResponse("static/sw.js", media_type="application/javascript")

@app.get("/manifest.json")
def get_manifest():
    return FileResponse("static/manifest.json", media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
