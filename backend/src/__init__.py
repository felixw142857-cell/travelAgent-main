"""后端入口，保持模板的 uvicorn src:app 启动方式。"""

from src.main import app, create_app

__all__ = ["app", "create_app"]
