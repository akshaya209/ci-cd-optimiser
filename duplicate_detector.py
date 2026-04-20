"""
duplicate_detector.py
─────────────────────
AST-based inter-test duplicate detection using 3-shingle Jaccard similarity.

Standalone module — can be unit-tested independently of the full pipeline.

Algorithm
---------
1. Parse each test file with Python's ``ast`` module.
2. Extract *meaningful* tokens:
     - Function/method names defined in the file   → ``fn:<n>``
     - Names called as functions                   → ``call:<n>``
     - Assert statement operands (stringified)     → ``assert:<value>``
3. Lowercase + strip leading underscores (normalisation).
4. Build the ordered token sequence and generate all 3-shingles (trigrams).
5. For every pair of files compute Jaccard similarity on their shingle sets:
       similarity = |A ∩ B| / |A ∪ B|
6. If similarity ≥ INTER_TEST_DUP_THRESHOLD the *second* file in the pair
   is marked as a duplicate and removed from the final list.

Fallback (file unreadable / non-existent)
------------------------------------------
When a test file cannot be read (OSError) or parsed (SyntaxError), the
detector falls back to tokenising the **file path string itself** — splitting
on path separators, underscores, dots, and digits — so that near-identical
test paths (e.g. ``test_auth_v1.py`` vs ``test_auth_v2.py``) still produce a
meaningful Jaccard score instead of always returning 0.0.  This prevents the
"silent no-op" bug where every OSError silently zeroes out a file's shingles
and guarantees that duplicate detection works even in CI environments where
test files are listed but not yet checked out.

Edge-cases handled
------------------
- Empty files or files with fewer than 3 tokens → use path-name fallback.
- SyntaxError / any parse failure              → use path-name fallback.
- OSError / file not found                     → use path-name fallback.
- Threshold is env-configurable via INTER_TEST_DUP_THRESHOLD.
"""

from __future__ import annotations

import ast
import logging
import os
import re
from itertools import combinations
from pathlib import Path
from typing import NamedTuple

log = logging.getLogger(__name__)

# ── Configurable threshold ─────────────────────────────────────────────────────
_DEFAULT_THRESHOLD = 0.5
INTER_TEST_DUP_THRESHOLD: float = float(
    os.environ.get("INTER_TEST_DUP_THRESHOLD", _DEFAULT_THRESHOLD)
)

# ── Public result type ─────────────────────────────────────────────────────────


class DuplicateDetectionResult(NamedTuple):
    unique_tests: list[str]
    duplicate_tests: list[str]                      # pruned
    similarity_pairs: list[tuple[str, str, float]]  # (a, b, score) for audit


# ── Internal: AST token extractor ─────────────────────────────────────────────


class _TokenExtractor(ast.NodeVisitor):
    """
    Walk a parsed AST and pull out the signals that indicate test behaviour:
      • Function/method names defined in the file  (def foo  → "fn:foo")
      • Names called as functions                  (foo(...) → "call:foo")
      • Assert statement leaf values               (assert x == y → the
        string repr of each leaf Name/Constant)

    All tokens are lowercased and stripped of leading underscores so that
    helper-name variations (``_helper`` vs ``helper``) don't skew results.
    """

    def __init__(self) -> None:
        self.tokens: list[str] = []

    # ── function / method definitions ─────────────────────────────────────────

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        self.tokens.append(f"fn:{_normalise(node.name)}")
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef  # treat async defs identically

    # ── call sites ────────────────────────────────────────────────────────────

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        name = _call_name(node.func)
        if name:
            self.tokens.append(f"call:{_normalise(name)}")
        self.generic_visit(node)

    # ── assert statements ─────────────────────────────────────────────────────

    def visit_Assert(self, node: ast.Assert) -> None:  # noqa: N802
        for leaf in _assert_leaves(node.test):
            self.tokens.append(f"assert:{_normalise(leaf)}")
        self.generic_visit(node)


# ── Low-level helpers ──────────────────────────────────────────────────────────


def _normalise(name: str) -> str:
    """Lowercase and strip leading underscores."""
    return name.lstrip("_").lower()


def _call_name(node: ast.expr) -> str | None:
    """
    Best-effort extraction of a callable's name from an AST expression.
    Handles plain names (``foo``), attributes (``obj.method``), and
    chained attributes (``mod.sub.func``).
    """
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _assert_leaves(node: ast.expr) -> list[str]:
    """
    Recursively collect leaf operand representations from an assert expression.
    Pulls out Name identifiers and Constant values; ignores operators/structure.
    """
    leaves: list[str] = []

    if isinstance(node, ast.Name):
        leaves.append(node.id)
    elif isinstance(node, ast.Constant):
        leaves.append(str(node.value))
    elif isinstance(node, (ast.Compare, ast.BoolOp, ast.BinOp, ast.UnaryOp)):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.expr):
                leaves.extend(_assert_leaves(child))
    # Intentionally ignore lambdas, comprehensions, etc. — too noisy.
    return leaves


def _extract_tokens(source: str) -> list[str]:
    """
    Parse *source* and return the ordered token sequence.
    Returns an empty list on empty source.
    Raises ``SyntaxError`` on parse failure (caller must catch and log).
    """
    if not source.strip():
        return []
    tree = ast.parse(source)
    extractor = _TokenExtractor()
    extractor.visit(tree)
    return extractor.tokens


def _path_tokens(path: str) -> list[str]:
    """
    Derive tokens from a file path string as a fallback when the file cannot
    be read or parsed.

    Strategy: split the full path on separators (``/``, ``\\``, ``_``, ``-``,
    ``.``), strip leading underscores, lowercase each piece, and prefix with
    ``path:``.  This means ``tests/unit/test_auth_service.py`` produces tokens
    like ``path:tests``, ``path:unit``, ``path:test``, ``path:auth``,
    ``path:service``, ``path:py`` — giving meaningful overlap for tests in
    the same package or with similar names.

    NOTE: numeric suffixes are kept (``v1``, ``v2``) so near-identical versioned
    tests don't get a perfect score when they shouldn't.
    """
    raw = re.split(r"[/\\._\-]", path)
    tokens = []
    for piece in raw:
        piece = piece.lstrip("_").lower()
        if piece:
            tokens.append(f"path:{piece}")
    return tokens


def _shingles(tokens: list[str], n: int = 3) -> frozenset[tuple[str, ...]]:
    """Build the set of n-shingles (n-grams) from *tokens*."""
    if len(tokens) < n:
        return frozenset()
    return frozenset(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


def _jaccard(a: frozenset, b: frozenset) -> float:
    """Jaccard similarity: |A ∩ B| / |A ∪ B|.  Returns 0.0 for empty sets."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ── Public API ─────────────────────────────────────────────────────────────────


def detect_duplicate_tests(
    test_paths: list[str],
    *,
    threshold: float | None = None,
    shingle_size: int = 3,
) -> DuplicateDetectionResult:
    """
    Detect near-duplicate test files using AST tokenisation + Jaccard similarity.

    Parameters
    ----------
    test_paths:
        Ordered list of test file paths to evaluate.  When two files exceed
        the threshold the *later* one (higher index) is pruned, preserving
        the first occurrence found.
    threshold:
        Jaccard similarity at or above which a file is considered a duplicate.
        Defaults to ``INTER_TEST_DUP_THRESHOLD`` (env-configurable via
        the ``INTER_TEST_DUP_THRESHOLD`` environment variable).
    shingle_size:
        n-gram size for shingling.  Default 3 (trigrams).

    Returns
    -------
    DuplicateDetectionResult
        .unique_tests    – files to keep
        .duplicate_tests – files pruned as duplicates
        .similarity_pairs – (file_a, file_b, score) for every pair compared
    """
    effective_threshold = (
        threshold if threshold is not None else INTER_TEST_DUP_THRESHOLD
    )

    log.info(
        "RUNNING DUPLICATE DETECTOR — scanning %d test file(s) "
        "(threshold=%.2f, shingle_size=%d)",
        len(test_paths),
        effective_threshold,
        shingle_size,
    )
    print(
        f"[DUP_DETECTOR] Starting scan: {len(test_paths)} tests, "
        f"threshold={effective_threshold:.2f}"
    )

    # ── Step 1: parse every file and build its shingle set ────────────────────
    shingle_map: dict[str, frozenset] = {}
    source_map: dict[str, str] = {}  # "ast" or "path_fallback"

    for path in test_paths:
        tokens: list[str] = []
        used_source = "ast"

        try:
            source = Path(path).read_text(encoding="utf-8", errors="replace")
            try:
                tokens = _extract_tokens(source)
            except SyntaxError as exc:
                log.warning(
                    "duplicate_detector: SyntaxError in '%s' (%s) — "
                    "falling back to path-name tokenisation",
                    path,
                    exc,
                )
                tokens = []
        except OSError as exc:
            log.warning(
                "duplicate_detector: cannot read '%s' (%s) — "
                "falling back to path-name tokenisation",
                path,
                exc,
            )
            tokens = []

        # ── Fallback: use path-name tokens when file is unreadable or empty ──
        if not tokens:
            tokens = _path_tokens(path)
            used_source = "path_fallback"
            if tokens:
                log.debug(
                    "duplicate_detector: '%s' using path-name fallback (%d tokens)",
                    path,
                    len(tokens),
                )
            else:
                log.warning(
                    "duplicate_detector: '%s' produced zero tokens even from path — "
                    "excluded from similarity comparisons",
                    path,
                )

        file_shingles = _shingles(tokens, n=shingle_size)

        if not file_shingles:
            log.debug(
                "duplicate_detector: '%s' produced fewer than %d tokens "
                "— will not participate in similarity comparisons",
                path,
                shingle_size,
            )

        shingle_map[path] = file_shingles
        source_map[path] = used_source

    # ── Step 2: pairwise Jaccard comparison ───────────────────────────────────
    pruned: set[str] = set()
    similarity_pairs: list[tuple[str, str, float]] = []

    for path_a, path_b in combinations(test_paths, 2):
        # Skip if either member of the pair is already pruned.
        if path_a in pruned or path_b in pruned:
            continue

        shingles_a = shingle_map[path_a]
        shingles_b = shingle_map[path_b]

        score = _jaccard(shingles_a, shingles_b)
        similarity_pairs.append((path_a, path_b, score))

        log.info(
            "duplicate_detector: similarity(%s [%s], %s [%s]) = %.4f",
            Path(path_a).name,
            source_map[path_a],
            Path(path_b).name,
            source_map[path_b],
            score,
        )

        if score >= effective_threshold:
            # path_b appeared later → prune it; path_a is kept as canonical.
            pruned.add(path_b)
            log.info(
                "duplicate_detector: PRUNED duplicate test: %s  "
                "(score=%.4f >= threshold=%.2f, similar to: %s)",
                Path(path_b).name,
                score,
                effective_threshold,
                Path(path_a).name,
            )
            print(
                f"[DUP_DETECTOR] PRUNED: {Path(path_b).name} "
                f"(score={score:.4f} >= {effective_threshold:.2f}, "
                f"duplicate of {Path(path_a).name})"
            )

    # ── Step 3: assemble final result ─────────────────────────────────────────
    unique_tests = [p for p in test_paths if p not in pruned]
    duplicate_tests = [p for p in test_paths if p in pruned]

    log.info(
        "duplicate_detector: complete — "
        "total=%d  duplicates_pruned=%d  final_selected=%d",
        len(test_paths),
        len(duplicate_tests),
        len(unique_tests),
    )
    print(
        f"[DUP_DETECTOR] Done: total={len(test_paths)}, "
        f"pruned={len(duplicate_tests)}, kept={len(unique_tests)}"
    )

    return DuplicateDetectionResult(
        unique_tests=unique_tests,
        duplicate_tests=duplicate_tests,
        similarity_pairs=similarity_pairs,
    )
