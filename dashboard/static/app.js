/* ============================================================
   GreenOps Dashboard — app.js
   Carbon-Aware CI/CD Test Suite Reduction
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── State ──────────────────────────────────────────────────────────────────
  let cy = null;
  const state = {
    graphData:  null,
    reportData: null,
    polling:    null,
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const runBtn            = $('run-btn');
  const repoInput         = $('repo-input');
  const prInput           = $('pr-input');
  const pipelineChip      = $('pipeline-status-chip');

  // sidebar metrics
  const carbonVal         = $('carbon-val');
  const carbonBadge       = $('carbon-badge');
  const carbonZoneLabel   = $('carbon-zone-label');
  const carbonSourceLabel = $('carbon-source-label');
  const savingsVal        = $('savings-val');
  const totalTestsVal     = $('total-tests-val');
  const savingsPct        = $('savings-pct');
  const pruningBar        = $('pruning-bar');
  const repoName          = $('repo-name');
  const prNumber          = $('pr-number');

  // Carbon detail card
  const carbonDetailVal   = $('carbon-detail-val');
  const carbonZone        = $('carbon-zone');
  const carbonRegion      = $('carbon-region');
  const carbonSource      = $('carbon-source');
  const carbonThreshold   = $('carbon-threshold');
  const carbonFetchMs     = $('carbon-fetch-ms');
  const carbonStrategy    = $('carbon-strategy');
  const carbonStageBadge  = $('carbon-stage-badge');

  // AST card
  const astBadge          = $('ast-badge');
  const astFiles          = $('ast-files');
  const astFunctions      = $('ast-functions');
  const astClasses        = $('ast-classes');
  const astTime           = $('ast-time');

  // Embed card
  const embedBadge        = $('embed-badge');
  const embedModules      = $('embed-modules');
  const embedVectors      = $('embed-vectors');
  const embedCache        = $('embed-cache');
  const embedTime         = $('embed-time');

  // Pruning card
  const pSelected         = $('p-selected');
  const pPruned           = $('p-pruned');
  const pTotal            = $('p-total');
  const pRate             = $('p-rate');
  const confBar           = $('conf-bar');
  const confVal           = $('conf-val');
  const pruningBadge      = $('pruning-stage-badge');

  const testList          = $('test-list');
  const insightList       = $('insight-list');

  // Node detail overlay
  const nodeDetails       = $('node-details');
  const detailName        = $('detail-node-name');
  const detailType        = $('detail-node-type');
  const detailSim         = $('detail-sim-score');
  const detailPf          = $('detail-pf-score');
  const detailStatus      = $('detail-status');

  // ── Stepper helpers ────────────────────────────────────────────────────────
  const STEPS = ['input','dep_graph','ast','embed','carbon','selection','pruning'];

  function setStep(stepId, status) {
    const el = document.querySelector(`[data-step="${stepId}"]`);
    if (!el) return;
    el.classList.remove('done','active','error');
    if (status) el.classList.add(status);
  }

  function markAllDone() {
    STEPS.forEach(s => setStep(s, 'done'));
  }

  function markUpTo(stepId) {
    const idx = STEPS.indexOf(stepId);
    STEPS.forEach((s, i) => {
      if (i < idx)       setStep(s, 'done');
      else if (i === idx) setStep(s, 'active');
      else               setStep(s, '');
    });
  }

  // ── Stage badge helper ─────────────────────────────────────────────────────
  function setBadge(el, status) {
    if (!el) return;
    el.className = 'stage-badge';
    const map = {
      pending:   ['pending', 'PENDING'],
      running:   ['running', 'RUNNING'],
      completed: ['completed', 'DONE'],
      done:      ['completed', 'DONE'],
      error:     ['error', 'ERROR'],
    };
    const [cls, label] = map[status] || ['pending','PENDING'];
    el.classList.add(cls);
    el.textContent = label;
  }

  // ── Number animation ───────────────────────────────────────────────────────
  function animateValue(el, from, to, dur = 800) {
    if (!el || from === to) return;
    let t0 = null;
    const step = ts => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      el.textContent = Math.floor(p * (to - from) + from);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Zone → friendly region name ────────────────────────────────────────────
  function zoneToRegion(zone) {
    if (!zone) return '--';
    const map = {
      'IN-SO': '🇮🇳 India — South',
      'IN-NO': '🇮🇳 India — North',
      'IN-EA': '🇮🇳 India — East',
      'IN-WE': '🇮🇳 India — West',
      'IN-NE': '🇮🇳 India — North-East',
      'GB':    '🇬🇧 Great Britain',
      'DE':    '🇩🇪 Germany',
      'FR':    '🇫🇷 France',
      'IE':    '🇮🇪 Ireland',
      'US-CAL-CISO': '🇺🇸 US — California',
      'US-NY-NYIS':  '🇺🇸 US — New York',
      'SG':    '🇸🇬 Singapore',
      'AU-NSW':'🇦🇺 Australia — NSW',
      'JP-TK': '🇯🇵 Japan — Tokyo',
      'NL':    '🇳🇱 Netherlands',
      'BE':    '🇧🇪 Belgium',
    };
    return map[zone] || zone;
  }

  // ── Update all UI sections from report ────────────────────────────────────
  function updateAllSections(report) {
    if (!report) return;

    const s       = report.summary || {};
    const carbon  = report.carbon  || {};
    const timings = report.timings_ms || {};
    const stages  = report.stages  || {};

    // breadcrumb
    repoName.textContent = report.repo       || '--';
    prNumber.textContent = report.pr_number  || '--';

    // ── Sidebar carbon ────────────────────────────────────────────────────
    const ci = s.carbon_intensity || carbon.intensity || 0;
    animateValue(carbonVal, parseInt(carbonVal.textContent) || 0, Math.round(ci));
    const exceeded = s.carbon_threshold_exceeded;
    carbonVal.style.color = exceeded ? 'var(--accent-red)' : 'var(--accent-green-bright)';
    carbonBadge.textContent = exceeded ? '⚠ HIGH' : '✓ OK';
    carbonBadge.style.background  = exceeded ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)';
    carbonBadge.style.color       = exceeded ? 'var(--accent-red)' : 'var(--accent-green-bright)';
    carbonBadge.style.borderColor = exceeded ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)';

    const zone = s.carbon_zone || carbon.zone || '';
    carbonZoneLabel.textContent   = zone || '--';
    carbonSourceLabel.textContent = s.carbon_source || carbon.source || '--';

    // ── Sidebar pruning ───────────────────────────────────────────────────
    const pruned   = s.tests_pruned   || (report.pruned_tests ? report.pruned_tests.length : 0);
    const selected = s.tests_selected || (report.final_tests  ? report.final_tests.length  : 0);
    const total    = pruned + selected;
    const rate     = s.pruning_rate   || (total > 0 ? pruned / total : 0);

    animateValue(savingsVal,    parseInt(savingsVal.textContent)    || 0, pruned);
    animateValue(totalTestsVal, parseInt(totalTestsVal.textContent) || 0, total);
    savingsPct.textContent = Math.round(rate * 100) + '%';
    pruningBar.style.width = Math.round(rate * 100) + '%';

    // ── Carbon detail card ────────────────────────────────────────────────
    setBadge(carbonStageBadge, stages.carbon_fetch_ms !== undefined ? 'completed' : 'pending');
    setStep('carbon', 'done');
    carbonDetailVal.textContent  = Math.round(ci);
    carbonDetailVal.style.color  = exceeded ? 'var(--accent-red)' : 'var(--accent-green-bright)';
    carbonZone.textContent       = zone || '--';
    carbonRegion.textContent     = zoneToRegion(zone);
    carbonSource.textContent     = s.carbon_source || carbon.source || '--';
    carbonThreshold.textContent  = s.carbon_threshold ? Math.round(s.carbon_threshold) + ' gCO₂/kWh' : '--';
    carbonFetchMs.textContent    = timings.carbon_fetch_ms !== undefined ? timings.carbon_fetch_ms + ' ms' : '--';
    carbonStrategy.textContent   = s.selection_strategy || '--';

    // ── AST stage ─────────────────────────────────────────────────────────
    const ast = report.ast_summary || {};
    const astMs = stages.module_extraction_ms || timings.module_extraction_ms;
    // We infer AST ran if module_extraction_ms exists in stages
    const astStatus = astMs !== undefined ? 'completed' : 'pending';
    setBadge(astBadge, astStatus);
    setStep('ast', astStatus === 'completed' ? 'done' : '');
    if (ast.files_parsed !== undefined) {
      astFiles.textContent     = ast.files_parsed;
      astFunctions.textContent = ast.functions_found || '--';
      astClasses.textContent   = ast.classes_found   || '--';
    } else if (astMs !== undefined) {
      // No dedicated ast_summary block but extraction ran — show timing
      astFiles.textContent     = '✓';
      astFunctions.textContent = '✓';
      astClasses.textContent   = '✓';
    }
    astTime.textContent = astMs !== undefined ? astMs : '--';

    // ── Embeddings stage ──────────────────────────────────────────────────
    const emb = report.embedding_summary || {};
    const embMs = stages.module_extraction_ms || timings.module_extraction_ms;
    const embStatus = embMs !== undefined ? 'completed' : 'pending';
    setBadge(embedBadge, embStatus);
    setStep('embed', embStatus === 'completed' ? 'done' : '');
    if (emb.modules_embedded !== undefined) {
      embedModules.textContent = emb.modules_embedded;
      embedVectors.textContent = emb.vectors_stored || '--';
      embedCache.textContent   = emb.cache_hits     || '0';
    } else if (embMs !== undefined) {
      embedModules.textContent = '✓';
      embedVectors.textContent = '✓';
      embedCache.textContent   = '--';
    }
    embedTime.textContent = embMs !== undefined ? embMs : '--';

    // ── Pruning card ──────────────────────────────────────────────────────
    const selMs = stages.test_selection_ms || timings.test_selection_ms;
    setBadge(pruningBadge, selMs !== undefined ? 'completed' : 'pending');
    setStep('selection', selMs !== undefined ? 'done' : '');
    setStep('pruning',   selMs !== undefined ? 'done' : '');

    animateValue(pSelected, parseInt(pSelected.textContent) || 0, selected);
    animateValue(pPruned,   parseInt(pPruned.textContent)   || 0, pruned);
    animateValue(pTotal,    parseInt(pTotal.textContent)    || 0, total);
    pRate.textContent = Math.round(rate * 100) + '%';

    const conf = s.confidence || 0;
    confBar.style.width = Math.round(conf * 100) + '%';
    confVal.textContent = conf ? conf.toFixed(2) : '--';

    // ── Test detail list ──────────────────────────────────────────────────
    const details = report.test_details || [];
    const finalTests  = report.final_tests  || [];
    const prunedTests = report.pruned_tests || [];

    // Build from test_details if present, else from final/pruned arrays
    let rows = [];
    if (details.length > 0) {
      rows = details.map(d => ({
        name:     d.test || d.test_name || '?',
        sim:      d.sim_score,
        pf:       d.pf_score,
        status:   d.status,
      }));
    } else {
      finalTests.forEach(t => rows.push({ name: t, status: 'RUN',   sim: null, pf: null }));
      prunedTests.forEach(t => rows.push({ name: t, status: 'PRUNE', sim: null, pf: null }));
    }

    if (rows.length === 0) {
      testList.innerHTML = '<div class="placeholder-text">No test details available.</div>';
    } else {
      testList.innerHTML = rows.map(r => {
        const isPruned = r.status === 'PRUNE' || r.status === 'PRUNED';
        const simF = r.sim ? parseFloat(r.sim) : null;
        const simClass = simF !== null ? (simF > 0.7 ? 'high' : simF < 0.3 ? 'low' : '') : '';
        return `<div class="module-item${isPruned ? ' pruned-row' : ''}">
          <span class="module-name" title="${r.name}">
            ${isPruned ? '✂' : '✓'} ${r.name.split('/').pop()}
          </span>
          <div class="test-badges">
            ${r.sim !== null ? `<span class="similarity-badge ${simClass}">${r.sim} SIM</span>` : ''}
            <span class="status-pill ${isPruned ? 'pill-prune' : 'pill-run'}">${r.status}</span>
          </div>
        </div>`;
      }).join('');
    }

    // ── Insights ──────────────────────────────────────────────────────────
    const insights = [];
    if (exceeded) {
      insights.push(`<div class="insight-item warning">⚠️ Carbon intensity ${Math.round(ci)} gCO₂/kWh exceeds threshold — aggressive pruning applied to reduce emissions.</div>`);
    } else {
      insights.push(`<div class="insight-item success">✅ Carbon within safe limits (${Math.round(ci)} gCO₂/kWh). Selective pruning active.</div>`);
    }
    if (zone && zone.startsWith('IN')) {
      insights.push(`<div class="insight-item india">🇮🇳 India grid zone <strong>${zone}</strong> detected. Using India-specific carbon intensity data.</div>`);
    }
    if (rate > 0.5) {
      insights.push(`<div class="insight-item">🚀 <strong>${Math.round(rate * 100)}%</strong> of tests pruned — CI/CD run time and carbon cost reduced significantly.</div>`);
    }
    const totalMs = timings.total_ms || (timings.dep_graph_ms + timings.test_selection_ms);
    if (totalMs) {
      insights.push(`<div class="insight-item">⏱️ Full pipeline completed in <strong>${totalMs}ms</strong>.</div>`);
    }
    if (s.confidence) {
      insights.push(`<div class="insight-item">🎯 Pruner confidence: <strong>${(s.confidence * 100).toFixed(0)}%</strong>${s.confidence < 0.6 ? ' (fallback to FULL_RUN)' : ''}.</div>`);
    }
    if (report.changed_modules && report.changed_modules.length) {
      insights.push(`<div class="insight-item">📦 Changed modules: <strong>${report.changed_modules.map(m => m.split('/').pop()).join(', ')}</strong>.</div>`);
    }
    insightList.innerHTML = insights.join('');

    // Stepper: mark all done
    setStep('input', 'done');
    setStep('dep_graph', 'done');
    markAllDone();
  }

  // ── Graph ──────────────────────────────────────────────────────────────────
  function initGraph(data) {
    if (!data) return;
    const elements    = [];
    const moduleGraph = data.module_graph || {};
    const testMap     = data.test_map     || {};
    const nodes       = new Set();

    Object.keys(moduleGraph).forEach(mod => {
      nodes.add(mod);
      (moduleGraph[mod] || []).forEach(dep => {
        nodes.add(dep);
        elements.push({ data: { id: `${mod}→${dep}`, source: mod, target: dep, type: 'import' } });
      });
    });

    Object.keys(testMap).forEach(mod => {
      (testMap[mod] || []).forEach(test => {
        nodes.add(test);
        elements.push({ data: { id: `${test}→${mod}`, source: test, target: mod, type: 'test-link' } });
      });
    });

    const report      = state.reportData || {};
    const testDetails = (report.test_details || []);
    const prunedTests = report.pruned_tests || [];
    const changedMods = report.changed_modules || [];

    const cyNodes = Array.from(nodes).map(node => {
      const isTest    = node.toLowerCase().includes('test') || node.toLowerCase().includes('spec');
      const isChanged = changedMods.includes(node);
      const isPruned  = prunedTests.includes(node);
      const detail    = testDetails.find(d => d.test === node || d.test_name === node);
      return {
        data: {
          id:       node,
          label:    node.split('/').pop(),
          type:     isTest ? 'test' : 'module',
          isChanged,
          isPruned,
          simScore: detail ? detail.sim_score : (isTest ? '0.500' : '1.000'),
          pfScore:  detail ? detail.pf_score  : (isTest ? '0.500' : '0.000'),
        }
      };
    });

    if (cy) { cy.destroy(); cy = null; }

    cy = cytoscape({
      container: document.getElementById('cy'),
      elements:  [...cyNodes, ...elements],
      style: [
        {
          selector: 'node',
          style: {
            'label':              'data(label)',
            'color':              '#8b949e',
            'font-size':          '9px',
            'font-family':        'JetBrains Mono, monospace',
            'background-color':   '#21262d',
            'width': 22, 'height': 22,
            'text-valign':        'bottom',
            'text-margin-y':      5,
            'border-width':       2,
            'border-color':       '#30363d',
            'transition-property':'background-color, border-color, width, height',
            'transition-duration':'0.3s',
          }
        },
        {
          selector: 'node[type="module"]',
          style: { 'background-color': '#1f6feb', 'width': 26, 'height': 26, 'border-color': 'rgba(88,166,255,0.4)' }
        },
        {
          selector: 'node[?isChanged]',
          style: { 'border-color': '#f85149', 'border-width': 3, 'width': 30, 'height': 30 }
        },
        {
          selector: 'node[type="test"]',
          style: { 'background-color': '#238636', 'shape': 'hexagon', 'border-color': 'rgba(63,185,80,0.4)' }
        },
        {
          selector: 'node[?isPruned]',
          style: { 'background-color': '#484f58', 'border-color': '#30363d', 'opacity': 0.5 }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5, 'line-color': '#30363d', 'target-arrow-color': '#30363d',
            'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'opacity': 0.4, 'arrow-scale': 0.8,
          }
        },
        {
          selector: 'edge[type="test-link"]',
          style: { 'line-style': 'dashed', 'line-color': '#3fb950', 'opacity': 0.2 }
        },
        { selector: '.highlighted', style: { 'border-color': '#58a6ff', 'border-width': 4, 'line-color': '#58a6ff', 'target-arrow-color': '#58a6ff', 'opacity': 1, 'z-index': 999 } },
        { selector: '.dimmed',      style: { 'opacity': 0.12 } },
      ],
      layout: { name: 'cose', padding: 40, animate: true, componentSpacing: 80, nodeRepulsion: 4000, idealEdgeLength: 60 }
    });

    const nodeCount = cy.nodes().length;
    const edgeCount = cy.edges().length;
    $('graph-meta').textContent = `${nodeCount} nodes · ${edgeCount} edges`;

    cy.on('tap', 'node', evt => {
      const n = evt.target;
      detailName.textContent   = n.data('label');
      detailType.textContent   = n.data('type').toUpperCase();
      detailSim.textContent    = n.data('simScore');
      detailPf.textContent     = n.data('pfScore');
      const isPruned           = n.data('isPruned');
      const isChanged          = n.data('isChanged');
      detailStatus.textContent = isPruned ? 'PRUNED' : (isChanged ? 'CHANGED' : 'RUN');
      detailStatus.style.color = isPruned ? 'var(--text-secondary)' : (isChanged ? 'var(--accent-red)' : 'var(--accent-green-bright)');
      nodeDetails.classList.add('active');
      cy.elements().addClass('dimmed').removeClass('highlighted');
      n.removeClass('dimmed').addClass('highlighted');
      n.neighborhood().removeClass('dimmed').addClass('highlighted');
    });

    cy.on('tap', evt => {
      if (evt.target === cy) {
        nodeDetails.classList.remove('active');
        cy.elements().removeClass('dimmed').removeClass('highlighted');
      }
    });
  }

  // ── Fetch both graph + report, update all sections ─────────────────────────
  async function fetchAndRender() {
    try {
      const [graphRes, reportRes] = await Promise.all([
        fetch('/api/graph').catch(() => null),
        fetch('/api/report').catch(() => null),
      ]);

      if (graphRes && graphRes.ok) {
        state.graphData = await graphRes.json();
      }

      if (reportRes && reportRes.ok) {
        const data = await reportRes.json();
        if (!data.error) {
          state.reportData = data;
        }
      }

      if (state.graphData) initGraph(state.graphData);
      if (state.reportData) updateAllSections(state.reportData);

    } catch (err) {
      console.error('fetchAndRender error:', err);
    }
  }

  // ── Pipeline polling ───────────────────────────────────────────────────────
  function startPolling() {
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(async () => {
      try {
        const res  = await fetch('/api/run-status');
        const data = await res.json();
        const s    = data.status;

        if (s === 'running') {
          setPipelineChip('running');
          // try a partial refresh
          await fetchAndRender();
        } else if (s === 'done' || s === 'error') {
          clearInterval(state.polling);
          state.polling = null;
          setPipelineChip(s);
          await fetchAndRender();
          notify(s === 'done' ? '✅ Pipeline complete!' : '❌ Pipeline error — check logs.', s === 'done' ? 'success' : 'error');
          runBtn.disabled = false;
          runBtn.querySelector('.btn-label').textContent = 'Run Analysis';
        }
      } catch (_) {}
    }, 1800);
  }

  function setPipelineChip(status) {
    const map = {
      idle:    ['idle',    '● IDLE'],
      running: ['running', '⟳ RUNNING'],
      done:    ['done',    '✓ DONE'],
      error:   ['error',   '✕ ERROR'],
    };
    const [cls, label] = map[status] || ['idle', '● IDLE'];
    pipelineChip.className = `pipeline-chip ${cls}`;
    pipelineChip.textContent = label;
  }

  // ── Submit handler ─────────────────────────────────────────────────────────
  runBtn.addEventListener('click', async () => {
    const repo = repoInput.value.trim();
    const pr   = parseInt(prInput.value.trim()) || 0;

    if (!repo) { notify('Enter a repository (owner/repo)', 'error'); return; }

    runBtn.disabled = true;
    runBtn.querySelector('.btn-label').textContent = 'Running…';
    setPipelineChip('running');

    // Mark all steps pending then activate first
    STEPS.forEach(s => setStep(s, ''));
    setStep('input', 'active');

    try {
      const res  = await fetch('/api/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ repo, pr_number: pr }),
      });
      const data = await res.json();
      if (data.status === 'started') {
        setStep('input', 'done');
        markUpTo('dep_graph');
        notify('Pipeline started — polling for results…', 'success');
        startPolling();
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (err) {
      notify(`Error: ${err.message}`, 'error');
      setPipelineChip('error');
      runBtn.disabled = false;
      runBtn.querySelector('.btn-label').textContent = 'Run Analysis';
    }
  });

  // ── Reset graph ────────────────────────────────────────────────────────────
  $('reset-graph').addEventListener('click', () => { if (cy) cy.fit(); });

  // ── Notification ───────────────────────────────────────────────────────────
  function notify(msg, type = 'success') {
    const c = $('notification-container');
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 5000);
  }

  // ── Initial load ───────────────────────────────────────────────────────────
  fetchAndRender().then(() => {
    if (state.reportData) {
      setStep('input', 'done');
      markAllDone();
      setPipelineChip('done');
    }
  });
});
