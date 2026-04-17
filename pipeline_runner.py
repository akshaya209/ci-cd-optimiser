"""
pipeline_runner.py
==================
Green-Ops CI/CD Framework — Full Production Pipeline Entry Point

Wires together ALL components into a single runnable pipeline:
  1. Repo module extraction (CodeBERT embeddings + SHA-256 hashes)
  2. PR diff processing (changed files + similarity comparison)
  3. Dependency graph analysis (import-based module→test mapping)
  4. XGBoost gatekeeper (Pf prediction)
  5. Carbon-aware scheduling
  6. Test selection (exact test files — no demo PRUNE/RUN labels)
  7. Output report generation

This replaces the demo-only main.py entry point while preserving ALL
existing functionality from main.py (decision engine, generative mapper).

USAGE:
    # Full pipeline on a real PR
    python pipeline_runner.py --repo org/repo --pr-number 42

    # Local dry-run with a diff file
    python pipeline_runner.py --repo org/repo --diff path/to/changes.diff

    # Demo mode (preserves original main.py behavior)
    python pipeline_runner.py --demo
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

log = logging.getLogger("greenops.pipeline")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

OUTPUT_DIR = Path(os.environ.get("GREENOPS_OUTPUT", "./greenops_output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# PIPELINE STAGES
# ─────────────────────────────────────────────────────────────────────────────

def stage_extract_modules(
    repo_root: str,
    repo:      str,
    pr_number: int = 0,
    force:     bool = False,
) -> dict:
    """Stage 1: Full repo module extraction + embedding."""
    print("\n" + "─" * 60)
    print("STAGE 1: Repo Module Extraction")
    print("─" * 60)
    from repo_module_extractor import RepoModuleExtractor
    extractor = RepoModuleExtractor(
        repo_root = repo_root,
        db_path   = str(OUTPUT_DIR / "module_registry.sqlite"),
    )
    return extractor.run_full_extraction(
        repo          = repo,
        force_reembed = force,
        pr_number     = pr_number,
    )


def stage_build_dependency_graph(repo_root: str, repo: str) -> str:
    """Stage 2: Build or load dependency graph."""
    print("\n" + "─" * 60)
    print("STAGE 2: Dependency Graph Construction")
    print("─" * 60)
    from dependency_graph_engine import DependencyGraphEngine
    graph_path = str(OUTPUT_DIR / "dependency_graph.json")
    engine = DependencyGraphEngine(repo_root=repo_root)
    if Path(graph_path).exists():
        log.info("Loading cached dependency graph from %s", graph_path)
        engine.load(graph_path)
    else:
        engine.build(repo=repo, save_path=graph_path)
    return graph_path


def stage_select_tests(
    repo:             str,
    repo_root:        str,
    diff_text:        str,
    pr_number:        int,
    carbon_intensity: float,
) -> dict:
    """Stage 3: Intelligent test selection."""
    print("\n" + "─" * 60)
    print("STAGE 3: Test Selection (Embedding + Dep Graph + XGBoost)")
    print("─" * 60)
    from test_selection_engine import TestSelectionEngine
    engine = TestSelectionEngine(
        repo            = repo,
        repo_root       = repo_root,
        db_path         = str(OUTPUT_DIR / "module_registry.sqlite"),
        graph_path      = str(OUTPUT_DIR / "dependency_graph.json"),
        greenops_output = str(OUTPUT_DIR),
    )
    return engine.select_tests(
        diff_text        = diff_text,
        pr_number        = pr_number,
        carbon_intensity = carbon_intensity,
    )


def stage_get_carbon(state: str = "Maharashtra") -> dict:
    """Stage 4: Fetch live carbon intensity."""
    print("\n" + "─" * 60)
    print("STAGE 4: Carbon Intensity")
    print("─" * 60)
    from carbon_inference_engine import CarbonIntensityClient
    client = CarbonIntensityClient(state=state)
    result = client.fetch_intensity_with_source()
    log.info("Carbon: %d gCO2/kWh (source=%s)", result["intensity"], result["source"])
    return result


def stage_schedule(pruning_decision: dict) -> dict:
    """Stage 5: Carbon-aware scheduling."""
    print("\n" + "─" * 60)
    print("STAGE 5: Carbon-Aware Scheduling")
    print("─" * 60)
    try:
        from carbon_aware_scheduler import CarbonAwareScheduler
        scheduler = CarbonAwareScheduler(provider="aws")
        return scheduler.schedule(pruning_decision)
    except Exception as e:
        log.warning("Scheduler unavailable: %s — using identity schedule", e)
        return {
            "schedule_now":           [{"test_name": t} for t in pruning_decision.get("run", [])],
            "schedule_deferred":      [],
            "historic_failure_tests": [],
            "recommendation":         "Scheduler unavailable — running all selected tests",
        }


def stage_generate_report(
    extraction:  dict,
    selection:   dict,
    schedule:    dict,
    carbon:      dict,
    repo:        str,
    pr_number:   int,
) -> str:
    """Stage 6: Write final output report."""
    print("\n" + "─" * 60)
    print("STAGE 6: Output Report")
    print("─" * 60)

    report = {
        "pipeline_version": "greenops-v3-production",
        "repo":             repo,
        "pr_number":        pr_number,

        # Changed modules
        "changed_modules":  selection.get("changed_modules", []),

        # Similarity scores (file_path: cosine_similarity_to_stored)
        "similarity_scores": selection.get("similarity_scores", {}),

        # Hash deltas
        "hash_deltas":      selection.get("hash_deltas", {}),

        # Impacted modules (changed + transitive)
        "impacted_modules": selection.get("impacted_modules", []),

        # EXACT test files to run
        "final_test_files": selection.get("final_tests", []),

        # Pruned test files
        "pruned_tests":     selection.get("pruned_tests", []),

        # Per-test explanations
        "test_explanations": selection.get("explanations", []),

        # Carbon
        "carbon_intensity":   carbon.get("intensity", 0),
        "carbon_source":      carbon.get("source", ""),
        "carbon_threshold_exceeded": carbon.get("intensity", 0) > float(
            os.environ.get("GREENOPS_CARBON_THRESHOLD", "500")
        ),

        # Summary
        "summary": selection.get("summary", {}),

        # Schedule
        "schedule_summary": {
            "tests_immediate":  len(schedule.get("schedule_now", [])),
            "tests_deferred":   len(schedule.get("schedule_deferred", [])),
            "tests_historic":   len(schedule.get("historic_failure_tests", [])),
            "recommendation":   schedule.get("recommendation", ""),
        },
    }

    out_path = OUTPUT_DIR / f"pipeline_report_pr{pr_number}.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    _print_final_report(report)
    return str(out_path)


def _print_final_report(report: dict):
    s = report.get("summary", {})
    print(f"\n{'='*70}")
    print("GREEN-OPS PRODUCTION PIPELINE COMPLETE")
    print(f"{'='*70}")
    print(f"  Repo              : {report['repo']}")
    print(f"  PR                : #{report['pr_number']}")
    print(f"  Carbon            : {report['carbon_intensity']:.0f} gCO2/kWh "
          f"({'⚠ EXCEEDED' if report['carbon_threshold_exceeded'] else '✓ OK'})")
    print()
    print(f"  Changed modules   : {len(report['changed_modules'])}")
    print(f"  Impacted modules  : {len(report['impacted_modules'])}")
    print()
    print(f"  ✅ Tests to RUN   : {len(report['final_test_files'])}")
    print(f"  🚫 Tests PRUNED   : {len(report['pruned_tests'])}")
    print(f"  Pruning rate      : {s.get('pruning_rate', 0):.1%}")
    print(f"  Strategy          : {s.get('selection_strategy', 'N/A')}")
    print()
    if report["final_test_files"]:
        print("  Final test files:")
        for t in report["final_test_files"][:15]:
            exp = next(
                (e for e in report["test_explanations"] if e["test"] == t), {}
            )
            print(f"    → {Path(t).name:<45} {exp.get('reason', '')[:50]}")
        if len(report["final_test_files"]) > 15:
            print(f"    ... and {len(report['final_test_files']) - 15} more")
    print(f"{'='*70}\n")


# ─────────────────────────────────────────────────────────────────────────────
# DEMO MODE (preserves original main.py behaviour)
# ─────────────────────────────────────────────────────────────────────────────

def run_demo():
    """Preserve all demo scenarios from original main.py."""
    print("\n" + "=" * 60)
    print("DEMO MODE — Original main.py Decision Engine + Step 2 Demos")
    print("=" * 60)

    # Import original demo functions
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        from main import demo_decision_engine, demo_step2_pipeline
        demo_decision_engine()
        demo_step2_pipeline()
    except ImportError:
        log.warning("main.py not in path — running inline demo")

        from src.core.decision_engine import DecisionEngine
        engine = DecisionEngine()

        test_cases = [
            (0.90, 10,  350, "High similarity, clean grid"),
            (0.60, 25,  700, "Medium similarity, dirty grid"),
            (0.15, 80,  500, "Low similarity, large change"),
            (0.95, 200, 800, "Very high Pf, dirty grid"),
        ]
        for sim, cs, ci, label in test_cases:
            result = engine.decide(
                similarity=sim, change_size=cs,
                carbon_intensity=ci, module_impact_score=0.7,
            )
            print(f"\n  {label}")
            print(f"    Decision : {result['decision']}")
            print(f"    Pf       : {result['probability']:.3f}")
            print(f"    Reason   : {result['reason']}")

    print("\n" + "=" * 60)
    print("DEMO COMPLETE")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Run full pipeline:  python pipeline_runner.py --repo org/repo")
    print("  2. Set CO2SIGNAL_API_KEY for live carbon data")
    print("  3. Set GITHUB_TOKEN + REPO_NAME + PR_NUMBER for PR integration")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Green-Ops Production CI Pipeline"
    )
    parser.add_argument("--repo",       default=os.environ.get("REPO_NAME", ""),
                        help="org/repo")
    parser.add_argument("--repo-root",  default=".", help="Repository root")
    parser.add_argument("--pr-number",  type=int,
                        default=int(os.environ.get("PR_NUMBER", "0")))
    parser.add_argument("--diff",       default=None,
                        help="Path to .diff file (auto-detected from git if omitted)")
    parser.add_argument("--carbon",     type=float, default=None,
                        help="Override carbon intensity (gCO2/kWh)")
    parser.add_argument("--force-extract", action="store_true",
                        help="Force re-embedding of all files")
    parser.add_argument("--demo",       action="store_true",
                        help="Run demo scenarios from original main.py")
    parser.add_argument("--extract-only", action="store_true",
                        help="Only run module extraction (no diff processing)")
    args = parser.parse_args()

    # Demo mode
    if args.demo:
        run_demo()
        return

    # Validate
    if not args.repo:
        log.error("--repo is required (or set REPO_NAME env var)")
        parser.print_help()
        sys.exit(1)

    repo_root  = str(Path(args.repo_root).resolve())
    repo       = args.repo
    pr_number  = args.pr_number

    # Stage 1: Extract modules
    stage_extract_modules(
        repo_root = repo_root,
        repo      = repo,
        pr_number = pr_number,
        force     = args.force_extract,
    )

    if args.extract_only:
        print("Extraction complete. Exiting (--extract-only).")
        return

    # Stage 2: Dependency graph
    stage_build_dependency_graph(repo_root, repo)

    # Stage 4: Carbon
    if args.carbon is not None:
        carbon = {"intensity": args.carbon, "source": "CLI override", "zone": "override"}
    else:
        carbon = stage_get_carbon()

    # Get diff text
    diff_text = ""
    if args.diff:
        diff_text = Path(args.diff).read_text()
        log.info("Loaded diff from %s (%d chars)", args.diff, len(diff_text))
    else:
        # Try raw diff from greenops_output first
        diff_path = OUTPUT_DIR / f"raw_diff_pr{pr_number}.diff"
        if diff_path.exists():
            diff_text = diff_path.read_text()
            log.info("Loaded diff from %s", diff_path)
        else:
            # Try git
            import subprocess
            try:
                res = subprocess.run(
                    ["git", "diff", "HEAD~1", "HEAD"],
                    capture_output=True, text=True,
                    cwd=repo_root, timeout=30,
                )
                diff_text = res.stdout
                if diff_text:
                    log.info("Loaded diff from git diff HEAD~1 (%d chars)", len(diff_text))
            except Exception as e:
                log.warning("Could not get diff from git: %s", e)

    # Stage 3: Test selection
    selection = stage_select_tests(
        repo             = repo,
        repo_root        = repo_root,
        diff_text        = diff_text,
        pr_number        = pr_number,
        carbon_intensity = float(carbon["intensity"]),
    )

    # Write pruning_decision.json (format expected by carbon_aware_scheduler)
    pruning_decision = {
        "run":    selection["final_tests"],
        "prune":  selection["pruned_tests"],
        "pf_scores": {
            e["test"]: e["pf_score"]
            for e in selection.get("explanations", [])
        },
        "pruning_rate": selection["summary"]["pruning_rate"],
        "historic_failure_tests": [
            e["test"] for e in selection.get("explanations", [])
            if "ALWAYS_RUN" in e.get("reason", "")
        ],
    }
    with open(OUTPUT_DIR / "pruning_decision.json", "w") as f:
        json.dump(pruning_decision, f, indent=2)

    # Stage 5: Schedule
    schedule = stage_schedule(pruning_decision)
    with open(OUTPUT_DIR / "test_schedule.json", "w") as f:
        json.dump(schedule, f, indent=2, default=str)

    # Stage 6: Report
    report_path = stage_generate_report(
        extraction  = {},
        selection   = selection,
        schedule    = schedule,
        carbon      = carbon,
        repo        = repo,
        pr_number   = pr_number,
    )
    print(f"Report saved → {report_path}")


if __name__ == "__main__":
    main()
