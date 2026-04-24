import hashlib
import json
import logging
import os
import math
import mysql.connector
from typing import Optional

log = logging.getLogger("greenops.module_db")

# DB CONFIG (update this!)
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "your_password",
    "database": "greenops"
}


# ─────────────────────────────────────────
# HASH GENERATION 
# ─────────────────────────────────────────
def generate_hash(ast_result: dict) -> str:
    if not isinstance(ast_result, dict):
        return ""

    fingerprint = {
        "functions": sorted([
            f.get("name", "") if isinstance(f, dict) else str(f)
            for f in ast_result.get("functions", [])
        ]),
        "methods": sorted([
            f"{f.get('class_name','')}.{f.get('name','')}" if isinstance(f, dict) else str(f)
            for f in ast_result.get("methods", [])
        ]),
        "imports": sorted(ast_result.get("imports", [])),
        "classes": sorted([
            c.get("name", "") if isinstance(c, dict) else str(c)
            for c in ast_result.get("classes", [])
        ]),
    }

    canonical = json.dumps(fingerprint, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────
# DB CONNECTION
# ─────────────────────────────────────────
def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


# ─────────────────────────────────────────
# STORE MODULE 
# ─────────────────────────────────────────
def store_module(module_info: dict) -> None:
    try:
        conn = get_connection()
        cursor = conn.cursor()

        repo      = module_info.get("repo", "unknown")
        file_path = module_info.get("filepath", "")
        language  = module_info.get("language", "python")
        file_hash = module_info.get("module_hash", "")
        pr_number = module_info.get("pr_number", 0)
        ast_result = module_info.get("ast_result", {})

        value_score = _compute_value_score(ast_result)
        ast_json = json.dumps(ast_result)

        # 1️⃣ Ensure module exists
        cursor.execute("""
            SELECT module_id FROM modules
            WHERE repo=%s AND file_path=%s
        """, (repo, file_path))

        result = cursor.fetchone()

        if result:
            module_id = result[0]
        else:
            cursor.execute("""
                INSERT INTO modules (repo, file_path, language)
                VALUES (%s, %s, %s)
            """, (repo, file_path, language))
            module_id = cursor.lastrowid

        # 2️⃣ Insert PR if not exists
        cursor.execute("""
            INSERT IGNORE INTO pull_requests (pr_id, repo, author)
            VALUES (%s, %s, %s)
        """, (pr_number, repo, "system"))

        # 3️⃣ Upsert module version
        cursor.execute("""
            INSERT INTO module_versions (pr_id, module_id, module_hash, value_score)
            VALUES (%s, %s, %s, %s)
        """, (pr_number, module_id, file_hash, value_score))

        # 4️⃣ Store AST features
        cursor.execute("""
            INSERT INTO ast_features (module_id, pr_id, ast_json)
            VALUES (%s, %s, %s)
        """, (module_id, pr_number, ast_json))

        conn.commit()
        cursor.close()
        conn.close()

        log.info("Stored module: %s", file_path)

    except Exception as e:
        log.error("store_module failed for %s: %s",
                  module_info.get("filepath", "?"), e)


# ─────────────────────────────────────────
# VALUE SCORE (UNCHANGED)
# ─────────────────────────────────────────
def _compute_value_score(ast_result: dict) -> float:
    if not isinstance(ast_result, dict):
        return 0.0

    fns     = len(ast_result.get("functions", []))
    methods = len(ast_result.get("methods", []))
    imports = len(ast_result.get("imports", []))
    lines   = ast_result.get("num_lines", 1)

    return round(
        0.4 * (fns + methods) +
        0.3 * imports +
        0.2 * math.log(lines + 1),
        4,
    )


# ─────────────────────────────────────────
# GET STORED HASH
# ─────────────────────────────────────────
def get_stored_hash(repo: str, file_path: str) -> Optional[str]:
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT mv.module_hash
            FROM module_versions mv
            JOIN modules m ON mv.module_id = m.module_id
            WHERE m.repo=%s AND m.file_path=%s
            ORDER BY mv.id DESC
            LIMIT 1
        """, (repo, file_path))

        result = cursor.fetchone()
        cursor.close()
        conn.close()

        return result[0] if result else None

    except Exception:
        return None


# ─────────────────────────────────────────
# LIST MODULES
# ─────────────────────────────────────────
def list_stored_modules(repo: str) -> list:
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT m.file_path, mv.module_hash, mv.value_score
            FROM modules m
            JOIN module_versions mv ON m.module_id = mv.module_id
            WHERE m.repo=%s
        """, (repo,))

        results = cursor.fetchall()
        cursor.close()
        conn.close()

        return results

    except Exception:
        return []
