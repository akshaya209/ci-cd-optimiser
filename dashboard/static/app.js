/* ============================================================================
   GREENOPS FRONTEND v2.0 — Fixed & Complete
   All dashboard metrics populated from real pipeline logic.
   New LLM Explain page. Real vis-network graph. Proper error handling.
   ============================================================================ */

class GreenOpsApp {
  constructor() {
    this.state = {
      pipelineResult: null,
      loading: false,
      error: null,
      currentPage: 'dashboard',
    };
    this.chartInstance    = null;
    this.networkInstance  = null;
    this.diffText         = null;
    this.init();
  }

  init() {
    this.attachEventListeners();
    this.setActivePage('dashboard');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ══════════════════════════════════════════════════════════════════════════

  attachEventListeners() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setActivePage(e.currentTarget.dataset.page);
      });
    });
    document.getElementById('run-button').addEventListener('click', () => this.runPipeline());
    document.getElementById('diff-upload').addEventListener('change', (e) => this.handleDiffUpload(e));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════

  setActivePage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      this.state.currentPage = page;
      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
      });
      if (this.state.pipelineResult) this.renderPageContent(page);
    }
  }

  renderPageContent(page) {
    switch (page) {
      case 'dashboard':   this.renderDashboard();   break;
      case 'dependency':  this.renderDependency();   break;
      case 'carbon':      this.renderCarbon();        break;
      case 'ml':          this.renderML();             break;
      case 'cicd':        this.renderCICD();           break;
      case 'explain':     this.renderExplain();        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIPELINE EXECUTION
  // ══════════════════════════════════════════════════════════════════════════

  async runPipeline() {
    this.state.loading = true;
    this.setButtonLoading(true);
    this.updateStatus('loading', 'Running pipeline…');

    try {
      const payload = this.getPipelinePayload();
      const resp = await fetch('/api/pipeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'Pipeline failed');
      }

      this.state.pipelineResult = await resp.json();
      this.state.error = null;
      this.updateStatus('success', 'Pipeline completed ✓');
      this.showToast('Pipeline executed successfully', 'success');
      this.renderPageContent(this.state.currentPage);
    } catch (err) {
      this.state.error = err.message;
      this.updateStatus('error', 'Pipeline failed');
      this.showToast(err.message, 'error');
    } finally {
      this.state.loading = false;
      this.setButtonLoading(false);
    }
  }

  getPipelinePayload() {
    return {
      repo:             document.getElementById('repo-input').value.trim() || '',
      pr:               parseInt(document.getElementById('pr-input').value) || 0,
      base_branch:      document.getElementById('base-input').value.trim() || 'main',
      diff_text:        this.diffText || '',
      region:           document.getElementById('region-select').value,
      carbon_threshold: parseFloat(document.getElementById('carbon-threshold-input').value) || 500,
    };
  }

  handleDiffUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.diffText = e.target.result;
      this.showToast(`Diff loaded: ${file.name} (${(file.size/1024).toFixed(1)} KB)`, 'success');
    };
    reader.readAsText(file);
  }

  setButtonLoading(loading) {
    const btn  = document.getElementById('run-button');
    const text = btn.querySelector('.btn-text');
    btn.disabled = loading;
    text.textContent = loading ? 'Running…' : 'Run Pipeline';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1: DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  renderDashboard() {
    const r = this.state.pipelineResult;
    if (!r) return;

    // FIX: All metric values populated from real data
    this._setText('dashboard-decision', r.final_decision || '—');
    this._setText('dashboard-strategy', r.selection_strategy || 'Selection Strategy');
    this._setText('dashboard-pf',       this.fmtPct(r.probability_of_failure));
    this._setText('dashboard-carbon',   this.fmtCarbon(r.current_carbon_intensity));
    this._setText('dashboard-carbon-src', r.carbon_source || 'Current Grid');
    this._setText('dashboard-saved',    r.tests_saved != null ? `${r.tests_saved} tests` : '—');
    this._setText('dashboard-runtime',  r.runtime_reduction || '—');
    this._setText('dashboard-status',   r.status || 'completed');

    // Apply color to decision
    const decEl = document.getElementById('dashboard-decision');
    if (decEl) {
      decEl.className = 'metric-value';
      if (r.final_decision === 'SMART_SELECTIVE') decEl.classList.add('metric-success');
      else if (r.final_decision === 'CARBON_DEFERRED') decEl.classList.add('metric-warning');
      else decEl.classList.add('metric-info');
    }

    // PR banner
    const prMeta = r.pr_meta || {};
    const prBanner = document.getElementById('pr-banner');
    if (prBanner && prMeta.title) {
      prBanner.style.display = 'block';
      prBanner.innerHTML = `
        <strong>PR:</strong> ${this._esc(prMeta.title)} &nbsp;·&nbsp;
        <strong>State:</strong> ${prMeta.state} &nbsp;·&nbsp;
        <strong>Author:</strong> ${prMeta.user} &nbsp;·&nbsp;
        <strong>+${prMeta.additions}/-${prMeta.deletions}</strong> lines
      `;
    }

    // AI summary on dashboard
    const summary = r.overall_summary || (r.explanation && r.explanation.overall_summary);
    const summaryBox = document.getElementById('llm-summary-box');
    if (summaryBox && summary) {
      summaryBox.style.display = 'block';
      this._setText('llm-overall-summary', summary);
    }

    this.renderPipelineChart();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2: DEPENDENCY
  // ══════════════════════════════════════════════════════════════════════════

  renderDependency() {
    const r = this.state.pipelineResult;
    if (!r) return;

    const changedList  = r.changed_files_list || Object.keys(r.changed_files || {});
    const graphStats   = r.module_graph_stats  || {};

    this._setText('dep-files-count',  changedList.length);
    this._setText('dep-source-count', graphStats.total_source_files ?? '—');
    this._setText('dep-tests-count',  graphStats.total_test_files   ?? '—');
    this._setText('dep-edges-count',  graphStats.total_edges        ?? '—');

    // Changed files list
    const filesEl = document.getElementById('changed-files-list');
    if (filesEl) {
      if (changedList.length === 0) {
        filesEl.innerHTML = '<p class="no-data">No changes detected</p>';
      } else {
        filesEl.innerHTML = changedList.map(f => `
          <div class="list-item">
            <span class="file-icon">${this._fileIcon(f)}</span>
            <strong>${this._esc(f)}</strong>
          </div>`).join('');
      }
    }

    // Similarity table with pf scores
    this.renderSimilarityTable();

    // Real dependency graph
    this.renderDependencyGraph();
  }

  renderSimilarityTable() {
    const r     = this.state.pipelineResult;
    const tbody = document.getElementById('similarity-tbody');
    if (!tbody || !r) return;
    const scores = r.similarity_scores || [];
    if (scores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No similarity scores available</td></tr>';
      return;
    }
    tbody.innerHTML = scores.map(s => `
      <tr>
        <td title="${this._esc(s.module)}">${this._short(s.module, 30)}</td>
        <td title="${this._esc(s.test)}">${this._short(s.test, 30)}</td>
        <td>${this.fmtPct(s.score)}</td>
        <td>${this.fmtPct(s.pf)}</td>
        <td class="${s.included ? 'badge-run' : 'badge-prune'}">${s.included ? '✓ RUN' : '✗ SKIP'}</td>
      </tr>`).join('');
  }

  renderDependencyGraph() {
    const r         = this.state.pipelineResult;
    const container = document.getElementById('dependency-graph');
    if (!container || !r) return;

    const depGraph   = r.dependency_graph || { nodes: [], edges: [] };
    const nodeList   = depGraph.nodes || [];
    const edgeList   = depGraph.edges || [];
    const changed    = new Set(r.changed_files_list || []);
    const testFiles  = new Set((r.selected_tests || []).concat(r.pruned_tests || []));

    if (nodeList.length === 0) {
      container.innerHTML = '<p style="padding:20px;text-align:center;color:#a8adb8;">No dependency data available — ensure GITHUB_TOKEN is set</p>';
      return;
    }

    // Use vis-network if available
    if (typeof vis !== 'undefined') {
      const nodes = new vis.DataSet(nodeList.slice(0, 60).map((node, idx) => {
        let color = { background: '#2d3142', border: '#4a5568' };
        if (changed.has(node))   color = { background: '#ef4444', border: '#ff6b6b' };
        else if (testFiles.has(node)) color = { background: '#10b981', border: '#34d399' };
        else if (this._isTestPath(node)) color = { background: '#10b981', border: '#34d399' };
        return { id: idx, label: this._short(node, 20), title: node, color, font: { color: '#e8ecf1' } };
      }));

      const nodeIndex = {};
      nodeList.slice(0, 60).forEach((n, i) => { nodeIndex[n] = i; });

      const edges = new vis.DataSet(
        edgeList
          .filter(([a, b]) => nodeIndex[a] !== undefined && nodeIndex[b] !== undefined)
          .slice(0, 150)
          .map(([a, b], i) => ({
            id: i,
            from: nodeIndex[a],
            to:   nodeIndex[b],
            arrows: 'to',
            color: { color: 'rgba(0,217,255,0.25)', highlight: '#00d9ff' },
          }))
      );

      if (this.networkInstance) this.networkInstance.destroy();
      this.networkInstance = new vis.Network(container, { nodes, edges }, {
        physics: { enabled: true, solver: 'forceAtlas2Based', stabilization: { iterations: 100 } },
        interaction: { hover: true, zoomView: true },
        layout: { improvedLayout: true },
      });
    } else {
      // Fallback text display
      container.innerHTML = `<div style="padding:16px;color:#a8adb8;">
        <p><strong>${nodeList.length}</strong> nodes, <strong>${edgeList.length}</strong> edges</p>
        <p style="margin-top:8px;">vis-network not loaded — displaying text summary</p>
        <ul style="margin-top:8px;font-size:12px;">${nodeList.slice(0,20).map(n=>`<li>${this._esc(n)}</li>`).join('')}</ul>
      </div>`;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3: CARBON
  // ══════════════════════════════════════════════════════════════════════════

  renderCarbon() {
    const r = this.state.pipelineResult;
    if (!r) return;

    this._setText('carbon-intensity-now',   this.fmtCarbon(r.current_carbon_intensity));
    this._setText('carbon-source-api',      r.carbon_source || '—');
    const threshold = r.carbon_threshold || 500;
    const intensity = r.current_carbon_intensity || 0;
    const exceeded  = intensity > threshold;
    this._setText('carbon-threshold-status', exceeded ? '⚠ Exceeded' : '✓ Within Limit');
    this._setText('carbon-action',           r.carbon_action || 'Proceed');

    // Schedule info
    const schedEl = document.getElementById('carbon-schedule-info');
    if (schedEl) {
      schedEl.innerHTML = `
        <div class="carbon-info-grid">
          <div><strong>Zone:</strong> ${r.region || document.getElementById('region-select').value}</div>
          <div><strong>Intensity:</strong> ${intensity} gCO₂/kWh</div>
          <div><strong>Threshold:</strong> ${threshold} gCO₂/kWh</div>
          <div><strong>Action:</strong> ${r.carbon_action}</div>
          <div><strong>Recommendation:</strong> ${exceeded
            ? '⚠ Delay non-critical tests to lower carbon window (e.g. off-peak hours)'
            : '✓ Carbon intensity acceptable — proceed with optimized test selection'}</div>
        </div>`;
    }

    const details = {
      current_intensity: intensity,
      threshold,
      carbon_source:       r.carbon_source,
      action:              r.carbon_action,
      tests_pruned_for_carbon: r.pruned_count,
      region:  document.getElementById('region-select').value,
      timestamp: new Date().toISOString(),
    };
    this._setText('carbon-details', JSON.stringify(details, null, 2));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4: ML
  // ══════════════════════════════════════════════════════════════════════════

  renderML() {
    const r = this.state.pipelineResult;
    if (!r) return;

    const pf = r.probability_of_failure || 0;
    this._setText('ml-pf-score',     this.fmtPct(pf));
    this._setText('ml-risk-level',   pf > 0.7 ? 'High' : pf > 0.4 ? 'Medium' : 'Low');
    this._setText('ml-gate-decision', r.gate_decision || r.final_decision || '—');
    this._setText('ml-confidence',   this.fmtPct(1 - pf));

    // ML features table
    const tbody = document.getElementById('ml-features-tbody');
    if (tbody) {
      const feats = r.ml_features || [];
      if (feats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">No features</td></tr>';
      } else {
        tbody.innerHTML = feats.map(f => `
          <tr>
            <td>${this._esc(String(f.name))}</td>
            <td>${this._esc(String(f.value))}</td>
            <td class="impact-${f.impact || 'low'}">${f.impact || 'low'}</td>
          </tr>`).join('');
      }
    }

    // Explanation JSON
    const mlExpl = {
      model:               'XGBoost Probability of Failure (composite)',
      probability_of_failure: pf,
      gate_decision:       r.gate_decision,
      selection_strategy:  r.selection_strategy,
      features_used:       r.ml_features || [],
      xgboost_weights: {
        similarity:      '30%',
        dependency_path: '25%',
        hash_changed:    '20%',
        transitive_depth:'15%',
        carbon_factor:   '10%',
      },
      timestamp: new Date().toISOString(),
    };
    this._setText('ml-explanation', JSON.stringify(mlExpl, null, 2));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 5: CI/CD
  // ══════════════════════════════════════════════════════════════════════════

  renderCICD() {
    const r    = this.state.pipelineResult;
    if (!r) return;
    const repo = document.getElementById('repo-input').value || 'local';
    const pr   = parseInt(document.getElementById('pr-input').value);

    this._setText('cicd-trigger',        pr > 0 ? 'GitHub PR' : 'Local/Diff');
    this._setText('cicd-repo',           repo);
    this._setText('cicd-selected-count', r.selected_tests?.length ?? '—');
    this._setText('cicd-pruned-count',   r.pruned_tests?.length ?? '—');

    // Selected tests with pf badge
    const selEl = document.getElementById('cicd-selected-tests');
    if (selEl) {
      const sel = r.selected_tests || [];
      selEl.innerHTML = sel.length === 0
        ? '<p class="no-data">No tests selected</p>'
        : sel.map(t => {
            const d = (r.test_details || {})[t] || {};
            const reason = d.in_dep_path ? '🔗 dep' : d.hash_changed ? '🔥 changed' : `~${(d.similarity||0).toFixed(2)} sim`;
            return `<div class="test-item run"><span class="test-name">${this._esc(t)}</span><span class="test-badge">${reason}</span></div>`;
          }).join('');
    }

    // Pruned tests with reason
    const prnEl = document.getElementById('cicd-pruned-tests');
    if (prnEl) {
      const prn = r.pruned_tests || [];
      prnEl.innerHTML = prn.length === 0
        ? '<p class="no-data">No tests pruned</p>'
        : prn.map(t => {
            const d = (r.test_details || {})[t] || {};
            return `<div class="test-item pruned"><span class="test-name">${this._esc(t)}</span><span class="test-badge">pf=${(d.pf||0).toFixed(2)}</span></div>`;
          }).join('');
    }

    const testList = (r.selected_tests || []).join(' ');
    this._setText('cicd-command', testList ? `pytest ${testList}` : 'pytest --collect-only');

    const summary = {
      total_tests: r.total_tests,
      selected:    r.selected_tests?.length,
      pruned:      r.pruned_tests?.length,
      reduction:   r.runtime_reduction,
      final_decision: r.final_decision,
      carbon_intensity: `${r.current_carbon_intensity} gCO₂/kWh`,
      selection_strategy: r.selection_strategy,
    };
    this._setText('cicd-summary', JSON.stringify(summary, null, 2));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 6: LLM EXPLAIN (new)
  // ══════════════════════════════════════════════════════════════════════════

  renderExplain() {
    const r = this.state.pipelineResult;
    if (!r) return;

    const explanation = r.explanation || {};
    const summary     = r.overall_summary || explanation.overall_summary || 'No summary available.';
    const testExpls   = r.test_explanations || explanation.test_explanations || [];

    this._setText('explain-summary', summary);

    const tbody = document.getElementById('explain-tbody');
    if (tbody) {
      if (testExpls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">No explanations generated</td></tr>';
      } else {
        tbody.innerHTML = testExpls.map(e => `
          <tr>
            <td title="${this._esc(e.test)}">${this._short(e.test, 35)}</td>
            <td class="${e.decision === 'RUN' ? 'badge-run' : 'badge-prune'}">${e.decision}</td>
            <td class="explain-reason">${this._esc(e.reason || '')}</td>
          </tr>`).join('');
      }
    }

    this._setText('explain-raw', JSON.stringify(explanation, null, 2));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHARTS
  // ══════════════════════════════════════════════════════════════════════════

  renderPipelineChart() {
    const r      = this.state.pipelineResult;
    const canvas = document.getElementById('pipeline-chart');
    if (!canvas || !r) return;

    const stages = r.stage_timings || {};
    const labels = Object.keys(stages).map(l => l.replace(/_/g, ' ').toUpperCase());
    const data   = Object.values(stages);

    if (this.chartInstance) this.chartInstance.destroy();

    this.chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Stage Duration (ms)',
          data,
          backgroundColor: 'rgba(0, 217, 255, 0.65)',
          borderColor:     '#00d9ff',
          borderWidth:     2,
          borderRadius:    4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: true, labels: { color: '#e8ecf1' } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#a8adb8' }, grid: { color: 'rgba(45,49,66,0.3)' } },
          x: { ticks: { color: '#a8adb8', maxRotation: 35 }, grid: { color: 'rgba(45,49,66,0.3)' } },
        },
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS & TOAST
  // ══════════════════════════════════════════════════════════════════════════

  updateStatus(status, text) {
    const dot    = document.getElementById('status-dot');
    const label  = document.getElementById('status-text');
    const loader = document.getElementById('status-loader');
    dot.className = 'status-dot';
    if (status === 'loading') { dot.classList.add('loading'); loader.style.display = 'block'; }
    else if (status === 'error') { dot.classList.add('error'); loader.style.display = 'none'; }
    else { dot.classList.add('success'); loader.style.display = 'none'; }
    label.textContent = text;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className   = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  fmtPct(v) {
    if (v === null || v === undefined) return '—';
    // If value is already 0–1 range, multiply; if >1 assume already pct
    const pct = v <= 1 ? v * 100 : v;
    return `${pct.toFixed(1)}%`;
  }

  fmtCarbon(v) {
    if (v === null || v === undefined) return '—';
    return `${Number(v).toFixed(0)} gCO₂/kWh`;
  }

  _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === null || value === undefined) ? '—' : String(value);
  }

  _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _short(s, maxLen) {
    if (!s) return '';
    if (s.length <= maxLen) return this._esc(s);
    return this._esc('…' + s.slice(-(maxLen - 1)));
  }

  _fileIcon(path) {
    if (path.endsWith('.py'))  return '🐍';
    if (path.endsWith('.js') || path.endsWith('.ts')) return '📜';
    if (path.includes('test')) return '🧪';
    return '📄';
  }

  _isTestPath(p) {
    return /test[s_]|_test\.|\.spec\.|\.test\./.test(p.toLowerCase());
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
let app;
document.addEventListener('DOMContentLoaded', () => { app = new GreenOpsApp(); });

function copyCommand() {
  const cmd = document.getElementById('cicd-command').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    if (app) app.showToast('Command copied to clipboard', 'success');
  });
}
