# Phase 00 — Repository Bootstrap Checklist

## Goal
Create a clean JupyterLab 4 extension scaffold and verify the baseline toolchain works before feature implementation.

- [ ] **Scaffold the project using the official template**
  - **Task:** Run copier and select frontend + server extension, JupyterLab 4.x, hatch backend.
  - **Validation:** `ls` shows `jupyter_wikilab/`, `src/`, `pyproject.toml`, `package.json`, `tsconfig.json`
  - **Commit suggestion:** `chore(scaffold): initialize jupyter-wikilab extension template`

- [ ] **Align package metadata naming**
  - **Task:** Ensure Python and JS package names consistently reflect `jupyter-wikilab` / `jupyter_wikilab`.
  - **Validation:** `pip install -e ".[dev]" && python -m pip show jupyter-wikilab`
  - **Commit suggestion:** `chore(metadata): align python and frontend package naming`

- [ ] **Verify baseline frontend build**
  - **Task:** Install JS dependencies and compile the scaffold.
  - **Validation:** `jlpm install && jlpm build`
  - **Commit suggestion:** `chore(build): verify baseline jlpm build on scaffold`

- [ ] **Verify baseline Python checks**
  - **Task:** Run baseline project tests/checks from template defaults.
  - **Validation:** `pytest -q`
  - **Commit suggestion:** `test(scaffold): confirm baseline python tests pass`
