# ⚡ CI/CD Optimiser — Semantic, Graph-Aware & Carbon-Aware Pipeline

## Overview

This project is a next-generation CI/CD optimisation system that goes far beyond traditional pipeline execution. Instead of blindly running all tests on every pull request, it intelligently analyses code changes, understands dependencies, predicts failure risk, and schedules workloads based on carbon efficiency.

The system combines:

* Static analysis (AST + imports)
* Semantic understanding (GraphCodeBERT embeddings)
* Graph-based dependency modeling
* Machine learning (XGBoost)
* LLM-based reasoning
* Carbon-aware scheduling

The result: **faster pipelines, fewer wasted cycles, and lower carbon impact.**

---

## 🚀 Key Features

### 1. Pull Request Fingerprinting

* Each PR is converted into:

  * A **hash signature**
  * An **Abstract Syntax Tree (AST)**
* Enables fast comparison with historical changes.

---

### 2. AST Similarity Detection

* Incoming PRs are compared against previously seen ASTs.
* If similarity is high:

  * Reuse existing dependency graphs
* Otherwise:

  * Generate a new structural representation

---

### 3. Semantic Code Understanding

* Uses **GraphCodeBERT embeddings** to capture:

  * Code semantics
  * Structural relationships
* Computes similarity across modules to detect:

  * Hidden dependencies
  * Indirect impact zones

---

### 4. Dependency Graph Construction

* Combines:

  * AST structure
  * Import graphs
  * Shared resources (DB, messaging systems like Kafka)
* Produces a unified **code dependency graph**

---

### 5. LLM-Based Graph Reasoning

* Graph + embeddings are passed to an LLM
* The LLM:

  * Interprets relationships
  * Generates a **dependency flow graph**
  * Identifies affected modules with reasoning

---

### 6. Failure-Aware Test Selection (XGBoost)

* Inputs:

  * Dependency graph
  * Historical telemetry (test failures)
* XGBoost model:

  * Predicts failure likelihood
  * Prunes unnecessary test suites
* Output:

  * Minimal, high-signal test set

---

### 7. Carbon-Aware Scheduling 🌱

#### Energy Estimation

* Each test suite is evaluated based on:

  * Operation counts
  * CPU cycles
  * Estimated energy consumption

#### Carbon Modeling

* Uses:

  * Data center energy mix (hydro, nuclear, thermal)
  * CO₂ intensity datasets (e.g., Ember)
  * Real-time carbon APIs

#### Smart Allocation

* Workloads are routed to the **cleanest available grid**
* Example:

  * AWS Mumbai vs Delhi regions based on carbon intensity

---

## 🧠 Architecture Pipeline

```
PR → Hashing → AST Generation
   → AST Similarity Check
       → (Reuse Graph | Build New Graph)
   → GraphCodeBERT Embeddings
   → Semantic Similarity Analysis
   → Dependency Graph Construction
   → LLM Reasoning → Dependency Flow Graph
   → XGBoost → Test Suite Pruning
   → Energy Estimation
   → Carbon-Aware Scheduler
   → CI/CD Execution
```

---

## 📊 Why This Matters

| Problem             | Traditional CI/CD | This System                |
| ------------------- | ----------------- | -------------------------- |
| Redundant tests     | Runs everything   | Runs only what's needed    |
| Dependency tracking | Manual / shallow  | Deep semantic + structural |
| Failure prediction  | None              | ML-driven                  |
| Resource usage      | Ignored           | Optimised                  |
| Carbon impact       | Ignored           | Actively minimised         |

---

## 🛠 Tech Stack

* **Static Analysis**: AST parsing
* **Embeddings**: GraphCodeBERT
* **ML Model**: XGBoost
* **LLM Integration**: Dependency reasoning
* **Infra Awareness**:

  * Data center energy mix datasets
  * Carbon intensity APIs
* **Messaging Awareness**: Kafka-like systems
* **Cloud Targets**: Multi-region (e.g., AWS)

---

## 📈 Future Improvements

* Reinforcement learning for scheduling decisions
* Real-time adaptive test execution
* Multi-repo dependency tracking
* Integration with Kubernetes schedulers
* More accurate hardware-level energy profiling

---

## ⚠️ Assumptions & Limitations

* Energy estimation is approximate (based on operations & cycles)
* Carbon intensity varies dynamically — real-time APIs improve accuracy
* LLM reasoning depends on prompt quality and graph representation

---

## 💡 Philosophy

This project is built on a simple idea:

> **CI/CD pipelines shouldn’t just be fast — they should be intelligent and responsible.**

We reduce:

* Compute waste
* Developer wait time
* Carbon footprint

All while increasing confidence in every merge.

---

## 🧪 Getting Started

```bash
git clone https://github.com/akshaya209/ci-cd-optimiser.git
cd ci-cd-optimiser
pip install -r requirements.txt
```

View dashboard and llm explanations run:

```bash
python dashboard/server.py
http://localhost:8000
```

To integrate it with your codebase add your fine grained github token and action.yml file in your repo
---
## Dashboard
<img width="1470" height="673" alt="image" src="https://github.com/user-attachments/assets/10774ef5-0fda-4b5c-b3be-ed238f224947" />

---
## Dependencies
<img width="1443" height="784" alt="image" src="https://github.com/user-attachments/assets/bc91ba00-649b-41b9-a901-20a6e11a1bd3" />

---
## Carbon intensity 
<img width="1464" height="779" alt="image" src="https://github.com/user-attachments/assets/5264a4d9-779e-4ac3-a8fe-1ca19533568f" />

---
## CI/CD
<img width="1470" height="757" alt="image" src="https://github.com/user-attachments/assets/211ea38d-1ed5-467f-a0cb-c7c9bead80d5" />

---
## LLM explanation
<img width="1430" height="723" alt="image" src="https://github.com/user-attachments/assets/e9a724b9-c8c8-4e44-b7a0-ba2d17bfde98" />

---
## Integration with github actions
<img width="1455" height="334" alt="image" src="https://github.com/user-attachments/assets/2b3e7d50-ff59-41e4-bf62-38826bf91293" />







## 📜 License

MIT License

---

