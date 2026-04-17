import os
import json
import logging
import subprocess
from flask import Flask, jsonify, send_from_directory, request

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GreenOps.Dashboard")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "greenops_output")
STATIC_DIR = os.path.join(BASE_DIR, "static")

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
        # Fallback to a mock graph for demo if file doesn't exist
        mock_graph = {
            "module_graph": {
                "src/auth.py": ["src/models/user.py", "src/db.py"],
                "src/models/user.py": ["src/db.py"],
                "src/api/routes.py": ["src/auth.py", "src/models/user.py"],
                "tests/test_auth.py": ["src/auth.py"],
                "tests/test_api.py": ["src/api/routes.py"]
            },
            "test_map": {
                "src/auth.py": ["tests/test_auth.py"],
                "src/api/routes.py": ["tests/test_api.py"]
            },
            "test_files": ["tests/test_auth.py", "tests/test_api.py"]
        }
        return jsonify(mock_graph)
    
    with open(graph_path, "r") as f:
        return jsonify(json.load(f))

@app.route("/api/report")
def get_report():
    # Find the latest pipeline report
    if not os.path.exists(OUTPUT_DIR):
        # Mock report
        return jsonify({
            "summary": {
                "carbon_intensity": 450.5,
                "carbon_threshold": 500,
                "carbon_threshold_exceeded": False,
                "tests_selected": 12,
                "tests_pruned": 45,
                "pruning_rate": 0.789,
                "carbon_source": "Tamil Nadu (Mock)"
            },
            "timings_ms": {"total_ms": 1240, "dep_graph_ms": 230},
            "repo": "example/repo",
            "pr_number": 123,
            "changed_modules": ["src/auth.py"]
        })

    reports = [f for f in os.listdir(OUTPUT_DIR) if f.startswith("pipeline_report_pr")]
    if not reports:
        return jsonify({"error": "No reports found"}), 404
    
    # Simple sort to get latest
    reports.sort(reverse=True)
    with open(os.path.join(OUTPUT_DIR, reports[0]), "r") as f:
        return jsonify(json.load(f))

@app.route("/api/run-simulation", methods=["POST"])
def run_simulation():
    try:
        # Run main.py as a simulation
        result = subprocess.run(["python3", os.path.join(PROJECT_ROOT, "main.py")], capture_output=True, text=True)
        return jsonify({"status": "success", "output": result.stdout})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
