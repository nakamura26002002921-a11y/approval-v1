# orchestrator_api.py
# ============================================================
# Pyodide上（ブラウザ内Python）で実行される、
# orchestrator_server-v1 のREST APIを叩くクライアントロジック。
#
# JavaScript側(app.js)からは pyodide.runPythonAsync 経由で
# ここに定義した関数を呼び出す。
# HTTP通信自体は pyodide-http パッケージが差し込む fetch 経由の
# requests 互換レイヤーを使う。
# ============================================================

import json
import requests

_base_url = ""


def set_base_url(url: str) -> None:
    """API のベースURL（例: https://xxxxx.trycloudflare.com）を設定する。"""
    global _base_url
    _base_url = url.rstrip("/")


def _endpoint(path: str) -> str:
    if not _base_url:
        raise RuntimeError("APIのURLが設定されていません")
    return f"{_base_url}{path}"


def _to_json_str(response) -> str:
    """requests の Response を JSON文字列にして返す（JS側でparseする）。"""
    try:
        data = response.json()
    except ValueError:
        data = {"error": f"不正な応答です (status={response.status_code})"}
    return json.dumps({"status": response.status_code, "ok": response.ok, "data": data})


def check_health() -> str:
    """疎通確認。ルート ("/") にGETし、name/statusを含む応答を期待する。"""
    try:
        response = requests.get(_endpoint("/"), timeout=10)
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def list_requests() -> str:
    try:
        response = requests.get(_endpoint("/api/requests"), timeout=15)
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def get_request(request_id: str) -> str:
    try:
        response = requests.get(_endpoint(f"/api/requests/{request_id}"), timeout=15)
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def create_request(request_id: str, purpose: str, command: str) -> str:
    try:
        response = requests.post(
            _endpoint("/api/requests"),
            json={"id": request_id, "purpose": purpose, "command": command},
            timeout=15,
        )
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def update_request(request_id: str, purpose: str, command: str, status: str) -> str:
    try:
        response = requests.put(
            _endpoint(f"/api/requests/{request_id}"),
            json={"purpose": purpose, "command": command, "status": status},
            timeout=15,
        )
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def delete_request(request_id: str) -> str:
    try:
        response = requests.delete(_endpoint(f"/api/requests/{request_id}"), timeout=15)
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})


def approve_request(request_id: str) -> str:
    try:
        response = requests.post(_endpoint(f"/api/requests/{request_id}/approve"), timeout=15)
        return _to_json_str(response)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"status": 0, "ok": False, "data": {"error": str(exc)}})
