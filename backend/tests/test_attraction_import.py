"""导入脚本的网络降级与已有数据保护。"""

import json
import sys
from io import BytesIO

import pytest

from scripts import fetch_osm_attractions as importer


def test_fetch_tracks_successful_mirror_and_rejects_partial_response(monkeypatch):
    requested = []
    elements = [{"id": 123, "type": "node", "tags": {"name": "景点"}}]
    responses = iter(
        [
            {"remark": "runtime error: Query timed out", "elements": elements},
            {
                "elements": elements,
                "osm3s": {"timestamp_osm_base": "2026-10-17T12:00:00Z"},
            },
        ]
    )

    def urlopen(request, timeout):
        requested.append(request.full_url)
        assert timeout > 0
        return BytesIO(json.dumps(next(responses)).encode())

    monkeypatch.setattr(importer.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(importer.time, "sleep", lambda seconds: None)
    metadata = {}
    endpoints = ["https://first.example/api", "https://second.example/api"]
    actual = importer.fetch_city(
        "广州", retries=2, landmarks_only=True, endpoints=endpoints, metadata=metadata
    )
    assert actual == elements
    assert requested == endpoints
    assert metadata["endpoint"] == endpoints[1]
    assert metadata["query_mode"] == "landmarks"
    assert metadata["osm_snapshot_at"] == "2026-10-17T12:00:00Z"


def test_empty_import_preserves_existing_city_file(monkeypatch, tmp_path):
    path = tmp_path / "guangzhou.json"
    previous = '{"city":"广州","items":[{"id":"previous"}]}\n'
    path.write_text(previous, encoding="utf-8")
    monkeypatch.setattr(importer, "OUT_DIR", tmp_path)
    monkeypatch.setattr(importer, "fetch_city", lambda *args, **kwargs: [])
    monkeypatch.setattr(sys, "argv", ["fetch_osm_attractions.py", "--city", "广州"])
    with pytest.raises(RuntimeError, match="未返回可用景点"):
        importer.main()
    assert path.read_text(encoding="utf-8") == previous
