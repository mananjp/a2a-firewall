# Contributing to A2A Firewall

Thank you for your interest in contributing to **A2A Firewall**! We welcome contributions from the community to help make multi-agent AI ecosystems safer, more secure, and enterprise-ready.

---

## 🛠️ Development Setup

### Prerequisites
- **Python**: `>= 3.11` (Python 3.12 recommended)
- **Node.js**: `>= 20.x`
- **Docker**: For running Postgres and Jaeger tracing locally

### 1. Clone the Repository
```bash
git clone https://github.com/mananjp/a2a-firewall.git
cd a2a-firewall
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate

pip install -r requirements.txt
pip install -e .
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. SDK Setup
```bash
# Python SDK
cd sdk
pip install -e ".[all]"

# TypeScript SDK
cd sdk-ts
npm install
npm test
npm run build
```

---

## 🧪 Testing Guidelines

All contributions must include appropriate unit or integration tests. Ensure the entire test suite passes before opening a pull request:

```bash
# Run backend tests
cd backend
pytest tests/ -v

# Run Python SDK tests
cd sdk
pytest tests/ -v

# Run TypeScript SDK tests
cd sdk-ts
npm test
```

---

## 🎨 Code Style & Quality Standards

We enforce strict formatting, linting, and type checking:

### Python (Ruff + Mypy)
```bash
cd backend
ruff format src tests
ruff check src tests
```

### TypeScript (ESLint + TypeScript Compiler)
```bash
cd sdk-ts
npx tsc --noEmit
```

---

## 🔀 Pull Request Process

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Commit Messages**: Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(proxy): Add support for gRPC stream interception`
   - `fix(rules): Correct SQL injection tautology regex`
   - `docs(sdk): Add LangGraph callback example`
3. **Open a PR**:
   - Fill out the PR template describing the changes, motivation, and test coverage.
   - Ensure all GitHub Actions CI checks are green.
   - For security-sensitive changes (e.g. cryptography, token validation, proxy bypass defenses), two core maintainer approvals are required.

---

## 📜 Code of Conduct

All contributors are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## 📄 License

By contributing to A2A Firewall, you agree that your contributions will be licensed under the project's [Apache-2.0 License](LICENSE).
