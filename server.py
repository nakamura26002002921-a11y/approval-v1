# server.py
# ============================================================
# Usage:
#   pip install -r requirements.txt
#   python3 server.py
# ============================================================

import sqlite3
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

DATABASE = Path("data/server.db")


def get_db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('承認待ち', '承認済み')),
            purpose TEXT NOT NULL,
            command TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()
    db.close()


@app.route("/api/requests", methods=["POST"])
def create_request():
    body = request.get_json()

    server_id = body["id"]
    purpose = body["purpose"]
    command = body["command"]

    db = get_db()

    existing = db.execute(
        "SELECT id FROM requests WHERE id = ?",
        (server_id,)
    ).fetchone()

    if existing is not None:
        db.close()
        return jsonify({
            "error": "指定されたIDは既に存在します"
        }), 409

    db.execute(
        """
        INSERT INTO requests (id, status, purpose, command)
        VALUES (?, ?, ?, ?)
        """,
        (server_id, "承認待ち", purpose, command)
    )
    db.commit()
    db.close()

    return jsonify({
        "id": server_id,
        "status": "承認待ち",
        "purpose": purpose,
        "command": command
    }), 201


@app.route("/api/requests/<server_id>", methods=["GET"])
def get_request(server_id):
    db = get_db()
    row = db.execute(
        """
        SELECT id, status, purpose, command, created_at, updated_at
        FROM requests
        WHERE id = ?
        """,
        (server_id,)
    ).fetchone()
    db.close()

    if row is None:
        return jsonify({
            "error": "指定されたIDは存在しません"
        }), 404

    return jsonify(dict(row))


@app.route("/api/requests", methods=["GET"])
def get_requests():
    db = get_db()
    rows = db.execute(
        """
        SELECT id, status, purpose, command, created_at, updated_at
        FROM requests
        ORDER BY created_at DESC
        """
    ).fetchall()
    db.close()

    return jsonify([dict(row) for row in rows])


@app.route("/api/requests/<server_id>", methods=["PUT"])
def update_request(server_id):
    body = request.get_json()

    db = get_db()

    existing = db.execute(
        "SELECT id FROM requests WHERE id = ?",
        (server_id,)
    ).fetchone()

    if existing is None:
        db.close()
        return jsonify({
            "error": "指定されたIDは存在しません"
        }), 404

    fields = []
    values = []

    if "purpose" in body:
        fields.append("purpose = ?")
        values.append(body["purpose"])

    if "command" in body:
        fields.append("command = ?")
        values.append(body["command"])

    if "status" in body:
        if body["status"] not in ("承認待ち", "承認済み"):
            db.close()
            return jsonify({
                "error": "statusは承認待ちまたは承認済みである必要があります"
            }), 400
        fields.append("status = ?")
        values.append(body["status"])

    if fields:
        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(server_id)
        db.execute(
            f"UPDATE requests SET {', '.join(fields)} WHERE id = ?",
            values
        )
        db.commit()

    row = db.execute(
        """
        SELECT id, status, purpose, command, created_at, updated_at
        FROM requests
        WHERE id = ?
        """,
        (server_id,)
    ).fetchone()
    db.close()

    return jsonify(dict(row))


@app.route("/api/requests/<server_id>", methods=["DELETE"])
def delete_request(server_id):
    db = get_db()

    existing = db.execute(
        "SELECT id FROM requests WHERE id = ?",
        (server_id,)
    ).fetchone()

    if existing is None:
        db.close()
        return jsonify({
            "error": "指定されたIDは存在しません"
        }), 404

    db.execute("DELETE FROM requests WHERE id = ?", (server_id,))
    db.commit()
    db.close()

    return jsonify({"id": server_id, "deleted": True})


@app.route("/api/requests/<server_id>/approve", methods=["POST"])
def approve_request(server_id):
    db = get_db()

    existing = db.execute(
        "SELECT id FROM requests WHERE id = ?",
        (server_id,)
    ).fetchone()

    if existing is None:
        db.close()
        return jsonify({
            "error": "指定されたIDは存在しません"
        }), 404

    db.execute(
        """
        UPDATE requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        ("承認済み", server_id)
    )

    db.commit()

    row = db.execute(
        """
        SELECT id, status, purpose, command, created_at, updated_at
        FROM requests
        WHERE id = ?
        """,
        (server_id,)
    ).fetchone()

    db.close()

    return jsonify(dict(row))


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000)
