from pathlib import Path
import subprocess

import typer

from . import utils

app = typer.Typer(no_args_is_help=False)


def _resolve_script() -> Path:
    return Path(__file__).resolve().parents[1] / "scripts" / "captcha_setup.sh"


@app.callback(invoke_without_command=True)
def show_menu(
    env: str = typer.Option("/opt/xpert/.env", "--env", help="Env file path."),
):
    """Show captcha setup menu."""
    script = _resolve_script()
    if not script.exists():
        utils.error(f"Captcha setup script not found: {script}")

    try:
        subprocess.run(["/usr/bin/env", "bash", str(script), env], check=True)
    except subprocess.CalledProcessError as exc:
        utils.error(f"Captcha setup failed with exit code {exc.returncode}.")
