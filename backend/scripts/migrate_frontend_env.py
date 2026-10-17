"""将已有前端凭据迁入后端；不打印密钥，不覆盖已配置的后端凭据。"""

import re
from pathlib import Path

from dotenv import dotenv_values, set_key

BACKEND_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ENV = BACKEND_ROOT.parent / "frontend" / ".env.local"
BACKEND_ENV = BACKEND_ROOT / ".env"


def main() -> None:
    if not BACKEND_ENV.exists():
        BACKEND_ENV.write_text(
            (BACKEND_ROOT / ".env.example").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
    source = dotenv_values(FRONTEND_ENV) if FRONTEND_ENV.exists() else {}
    target = dotenv_values(BACKEND_ENV)
    first_model_migration = bool(
        source.get("VITE_DEEPSEEK_API_KEY")
    ) and not target.get("DEEPSEEK_API_KEY")
    moved = []
    for old, new in {
        "VITE_DEEPSEEK_API_KEY": "DEEPSEEK_API_KEY",
        "VITE_DEEPSEEK_BASE_URL": "DEEPSEEK_BASE_URL",
        "VITE_DEEPSEEK_MODEL": "DEEPSEEK_MODEL",
        "VITE_QWEATHER_API_KEY": "QWEATHER_API_KEY",
        "VITE_QWEATHER_API_HOST": "QWEATHER_API_HOST",
    }.items():
        value = source.get(old)
        if value and (
            not target.get(new)
            or (first_model_migration and new.startswith("DEEPSEEK_"))
        ):
            set_key(BACKEND_ENV, new, value)
            target[new] = value
        if not value or value == target.get(new):
            moved.append(old)

    for key, value in dotenv_values(BACKEND_ROOT / ".env.example").items():
        if key not in target and value is not None:
            set_key(BACKEND_ENV, key, value)

    if FRONTEND_ENV.exists():
        lines = FRONTEND_ENV.read_text(encoding="utf-8").splitlines()
        pattern = re.compile(r"^\s*(?:export\s+)?(" + "|".join(moved) + r")\s*=")
        lines = [line for line in lines if not pattern.match(line)]
        remaining = dotenv_values(FRONTEND_ENV)
        if "BACKEND_URL" not in remaining:
            lines.append("BACKEND_URL=http://127.0.0.1:8001")
        if "VITE_API_BASE_URL" not in remaining:
            lines.append("VITE_API_BASE_URL=")
        updated = "\n".join(lines) + "\n"
        if updated != FRONTEND_ENV.read_text(encoding="utf-8"):
            FRONTEND_ENV.write_text(updated, encoding="utf-8")
    print("Environment migration complete; credential values were not displayed.")
    conflicts = [
        key
        for key in source
        if key.startswith(("VITE_DEEPSEEK_", "VITE_QWEATHER_")) and key not in moved
    ]
    if conflicts:
        print(
            "Different existing backend settings were preserved; frontend entries retained:",
            ", ".join(conflicts),
        )


if __name__ == "__main__":
    main()
