import atexit
import os
import subprocess
from pathlib import Path

from app import app
from config import DEBUG, VITE_BASE_API, DASHBOARD_PATH
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

base_dir = Path(__file__).parent
build_dir = base_dir / 'build'
statics_dir = build_dir / 'statics'
assets_dir = build_dir / 'assets'


def build():
    proc = subprocess.Popen(
        ['npm', 'run', 'build', '--',  '--outDir', build_dir, '--assetsDir', 'statics'],
        env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
        cwd=base_dir
    )
    proc.wait()
    with open(build_dir / 'index.html', 'r') as file:
        html = file.read()
    with open(build_dir / '404.html', 'w') as file:
        file.write(html)


def run_dev():
    proc = subprocess.Popen(
        ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--clearScreen', 'false', '--base', os.path.join(DASHBOARD_PATH, '')],
        env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
        cwd=base_dir
    )

    atexit.register(proc.terminate)


def run_build():
    if not build_dir.is_dir() or not statics_dir.is_dir():
        build()

    # Use dashboard path for Koyeb compatibility  
    mount_path = "/dashboard/"
    print(f"Mounting dashboard at {mount_path} from {build_dir}")
    print(f"Statics directory: {statics_dir}")
    print(f"Build dir exists: {build_dir.is_dir()}")
    print(f"Statics dir exists: {statics_dir.is_dir()}")
    
    app.mount(
        mount_path,
        StaticFiles(directory=build_dir, html=True),
        name="dashboard"
    )
    if statics_dir.is_dir():
        app.mount(
            '/statics/',
            StaticFiles(directory=statics_dir, html=True),
            name="statics"
        )
    else:
        print(f"Statics dir missing, skipping mount: {statics_dir}")

    if assets_dir.is_dir():
        app.mount(
            '/assets/',
            StaticFiles(directory=assets_dir, html=True),
            name="assets"
        )
    else:
        print(f"Assets dir missing, skipping mount: {assets_dir}")

    @app.api_route("/site.webmanifest", methods=["GET", "HEAD"], include_in_schema=False)
    def site_webmanifest_alias():
        manifest_path = statics_dir / "favicon" / "site.webmanifest"
        if manifest_path.is_file():
            return FileResponse(manifest_path, media_type="application/manifest+json")
        raise HTTPException(status_code=404, detail="Manifest not found")


@app.on_event("startup")
def startup():
    if DEBUG:
        run_dev()
    else:
        run_build()
