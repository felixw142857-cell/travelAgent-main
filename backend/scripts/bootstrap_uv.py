"""从 UV 官方发行包提取项目本地工具，不修改全局 Python 或 PATH。"""

from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

BACKEND_ROOT = Path(__file__).resolve().parents[1]
UV_EXECUTABLE = BACKEND_ROOT / ".tools" / "uv.exe"
UV_RELEASE_URL = (
    "https://github.com/astral-sh/uv/releases/latest/download/"
    "uv-x86_64-pc-windows-msvc.zip"
)


def main() -> None:
    if UV_EXECUTABLE.is_file():
        print(f"Using project-local UV: {UV_EXECUTABLE}")
        return

    with urlopen(UV_RELEASE_URL, timeout=60) as response:  # noqa: S310
        archive = response.read()
    with ZipFile(BytesIO(archive)) as bundle:
        candidates = [
            name
            for name in bundle.namelist()
            if name == "uv.exe" or name.endswith("/uv.exe")
        ]
        if len(candidates) != 1:
            raise RuntimeError("Expected one uv.exe in the official release archive")
        executable = bundle.read(candidates[0])

    UV_EXECUTABLE.parent.mkdir(parents=True, exist_ok=True)
    UV_EXECUTABLE.write_bytes(executable)
    print(f"Installed project-local UV: {UV_EXECUTABLE}")


if __name__ == "__main__":
    main()
