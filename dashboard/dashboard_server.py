import os
import json
import logging
import subprocess
import threading
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GreenOps.Dashboard")

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
# pipeline_runner writes to .greenops/output by default
OUTPUT_DIR   = os.path.join(PROJECT_ROOT, ".greenops", "output")
STATIC_DIR   = os.path.join(BASE_DIR, "static")

_pipeline_state = {"status": "idle", "log": None}


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory(STATIC_DIR, path)


@app.route("/api/graph")
def get_graph():
    graph_path = os.path.join(OUTPUT_DIR, "dependency_graph.json")
    if not os.path.exists(graph_path):
        mock_graph = {
            "module_graph": {
                "src/auth.py":        ["src/models/user.py", "src/db.py"],
                "src/models/user.py": ["src/db.py"],
                "src/api/routes.py":  ["src/auth.py", "src/models/user.py"],
                "tests/test_auth.py": ["src/auth.py"],
                "tests/test_api.py":  ["src/api/routes.py"],
            },
            "test_map": {
                "src/auth.py":       ["tests/test_auth.py"],
                "src/api/routes.py": ["tests/test_api.py"],
            },
            "test_files": ["tests/test_auth.py", "tests/test_api.py"],
        }
        return jsonify(mock_graph)
    with open(graph_path) as f:
        return jsonify(json.load(f))


@app.route("/api/report")
def get_report():
    """Return latest pipeline_report_pr*.json or synthesise from pipeline.log."""
    if os.path.exists(OUTPUT_DIR):
        reports = [f for f in os.listdir(OUTPUT_DIR) if f.startswith("pipeline_report_pr")]
        if reports:
            reports.sort(reverse=True)
            with open(os.path.join(OUTPUT_DIR, reports[0])) as f:
                return jsonify(json.load(f))

        log_path = os.path.join(OUTPUT_DIR, "pipeline.log")
        if os.path.exists(log_path):
            with open(log_path) as f:
                data = json.load(f)
            summary = data.get("summary", {})
            carbon  = data.get("carbon", {})
            stages  = data.get("stages", {})
            return jsonify({
                "repo":            data.get("repo", ""),
                "pr_number":       data.get("pr_number", 0),
                "changed_modules": data.get("changed_modules", []),
                "final_tests":     data.get("selected_tests", []),
                "pruned_tests":    data.get("pruned_tests", []),
                "summary": {
                    "carbon_intensity":          carbon.get("intensity", summary.get("carbon_intensity", 0)),
                    "carbon_threshold":          summary.get("carbon_threshold", 500),
                    "carbon_threshold_exceeded": summary.get("carbon_threshold_exceeded", False),
                    "tests_selected":            summary.get("tests_selected", 0),
                    "tests_pruned":              summary.get("tests_pruned", 0),
                    "pruning_rate":              summary.get("pruning_rate", 0),
                    "carbon_source":             carbon.get("source", ""),
                    "carbon_zone":               carbon.get("zone", ""),
                    "confidence":                summary.get("confidence", 0),
                    "selection_strategy":        summary.get("selection_strategy", ""),
                },
                "timings_ms": {
                    "total_ms":             int(data.get("elapsed_seconds", 0) * 1000),
                    "dep_graph_ms":         stages.get("dep_graph_ms", 0),
                    "module_extraction_ms": stages.get("module_extraction_ms", 0),
                    "carbon_fetch_ms":      stages.get("carbon_fetch_ms", 0),
                    "test_selection_ms":    stages.get("test_selection_ms", 0),
                },
                "stages": stages,
                "carbon": carbon,
            })

    # Static India-region demo fallback
    return jsonify({
        "repo":            "akshaya209/ci-cd-optimiser",
        "pr_number":       1,
        "changed_modules": ["src/auth.py", "src/models/user.py"],
        "final_tests":     ["tests/test_auth.py", "tests/test_api.py"],
        "pruned_tests":    ["tests/test_helper.py", "tests/test_ui_smoke.py", "tests/test_legacy.py"],
        "summary": {
            "carbon_intensity":          710.0,
            "carbon_threshold":          500.0,
            "carbon_threshold_exceeded": True,
            "tests_selected":            8,
            "tests_pruned":              24,
            "pruning_rate":              0.75,
            "carbon_source":             "Ember 2024 static (IN-SO)",
            "carbon_zone":               "IN-SO",
            "confidence":                0.87,
            "selection_strategy":        "PRUNED",
        },
        "timings_ms": {
            "total_ms":             2140,
            "dep_graph_ms":         380,
            "module_extraction_ms": 520,
            "carbon_fetch_ms":      90,
            "test_selection_ms":    840,
        },
        "stages": {
            "diff_fetch_ms":          120,
            "module_extraction_ms":   520,
            "dep_graph_ms":           380,
            "carbon_fetch_ms":        90,
            "test_selection_ms":      840,
            "scheduling_ms":          190,
        },
        "carbon": {
            "intensity": 710.0,
            "zone":      "IN-SO",
            "source":    "Ember 2024 static (IN-SO)",
        },
        "ast_summary": {
            "status":          "completed",
            "files_parsed":    14,
            "functions_found": 62,
            "classes_found":   9,
        },
        "embedding_summary": {
            "status":           "completed",
            "modules_embedded": 14,
            "vectors_stored":   14,
            "cache_hits":       3,
        },
        "test_details": [
            {"test": "tests/test_auth.py",     "sim_score": "0.942", "pf_score": "0.880", "status": "RUN"},
            {"test": "tests/test_api.py",      "sim_score": "0.815", "pf_score": "0.620", "status": "RUN"},
            {"test": "tests/test_helper.py",   "sim_score": "0.120", "pf_score": "0.050", "status": "PRUNE"},
            {"test": "tests/test_ui_smoke.py", "sim_score": "0.085", "pf_score": "0.042", "status": "PRUNE"},
            {"test": "tests/test_legacy.py",   "sim_score": "0.060", "pf_score": "0.030", "status": "PRUNE"},
        ],
    })


@app.route("/api/pipeline-log")
def get_pipeline_log():
    log_path = os.path.join(OUTPUT_DIR, "pipeline.log")
    if not os.path.exists(log_path):
        return jsonify({"error": "pipeline.log not found"}), 404
    with open(log_path) as f:
        return jsonify(json.load(f))


@app.route("/api/run", methods=["POST"])
def run_pipeline():
    """Accept { repo, pr_number } and launch pipeline_runner.py in background."""
    body      = request.get_json(silent=True) or {}
    repo      = body.get("repo", "").strip()
    pr_number = str(body.get("pr_number", "0")).strip()

    if not repo:
        return jsonify({"status": "error", "message": "repo is required"}), 400

    _pipeline_state["status"] = "running"
    _pipeline_state["log"]    = None

    env = os.environ.copy()
    env["REPO_NAME"]            = repo
    env["PR_NUMBER"]            = pr_number
    env["GREENOPS_CARBON_ZONE"] = env.get("GREENOPS_CARBON_ZONE", "IN-SO")
    env["GREENOPS_OUTPUT"]      = OUTPUT_DIR

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    def _run():
        try:
            result = subprocess.run(
                ["python3", os.path.join(PROJECT_ROOT, "pipeline_runner.py"),
                 "--repo", repo, "--pr", pr_number],
                capture_output=True, text=True, env=env,
            )
            _pipeline_state["status"] = "done" if result.returncode == 0 else "error"
            _pipeline_state["log"]    = result.stdout + result.stderr
        except Exception as exc:
            _pipeline_state["status"] = "error"
            _pipeline_state["log"]    = str(exc)

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"status": "started"})


@app.route("/api/run-status")
def run_status():
    return jsonify({"status": _pipeline_state["status"]})


@app.route("/api/run-simulation", methods=["POST"])
def run_simulation():
    try:
        result = subprocess.run(
            ["python3", os.path.join(PROJECT_ROOT, "main.py")],
            capture_output=True, text=True,
        )
        return jsonify({"status": "success", "output": result.stdout})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
