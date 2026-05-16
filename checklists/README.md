# Checklists Execution Guide

This folder breaks implementation into **small, independently committable tasks** designed for smaller coding models.

## Folder Contents

- `00-repo-bootstrap.checklist.md`
- `01-backend-core-wiki-service.checklist.md`
- `02-backend-git-service.checklist.md`
- `03-backend-handlers-api.checklist.md`
- `04-frontend-api-renderer.checklist.md`
- `05-frontend-sidebar-editor.checklist.md`
- `06-frontend-history-conflict-search.checklist.md`
- `07-plugin-settings-integration.checklist.md`
- `08-smoke-e2e-docs.checklist.md`
- `09-plan-gap-remediation.checklist.md`
- `10-committer-email-end-to-end.checklist.md`

---

## Execution Policy (Required)

1. **Do one checkbox at a time.**
2. **Run the validation command exactly as written.**
3. **Commit immediately after a passing validation.**
4. **Do not bundle multiple checkboxes into one commit.**
5. **If validation fails twice, stop and escalate (see Escalation Criteria).**

---

## Commit Convention

For each completed checkbox:

- Stage only files related to that single checkbox.
- Use the provided **Commit suggestion** as default message.
- If implementation diverges, update commit message to reflect the actual behavior delivered.

---

## Branching Recommendation

- Work on one feature branch (example: `feature/wikilab-v1`), but keep commits atomic.
- Optional: create one branch per phase if your workflow prefers stricter isolation.

---

## Validation Strategy

- **Unit-level checks** should pass before moving to integration checks.
- Prefer **targeted test command** from checklist item first.
- Run broader checks periodically:
  - `pytest -q`
  - `jlpm test`
  - `jlpm tsc --noEmit`
  - `jlpm build`

---

## Escalation Criteria (Stop Conditions)

Stop implementation and request human guidance if any of the following occur:

1. **Template mismatch:** scaffold output differs materially from expected JupyterLab 4 frontend+server structure.
2. **Dependency deadlock:** dependency resolution requires major version churn outside current scope.
3. **Unclear JupyterLab integration point:** plugin activation/registration behavior is ambiguous or conflicting.
4. **Git semantics uncertainty:** GitPython behavior for status/log/grep conflicts with required API contract.
5. **Locking correctness risk:** per-wiki write lock cannot be enforced confidently in handler architecture.
6. **Conflict UX contract mismatch:** backend 409 payload and frontend resolution flow expectations diverge.
7. **Repeated validation failure:** same checklist item fails after 2 focused fix attempts.
8. **Scope creep request:** request introduces out-of-scope features (RBAC, uploads, real-time collaboration, WYSIWYG).

When escalating, include:

- current checklist file + checkbox item
- exact failing command
- concise failure output
- proposed options (A/B) for resolution

---

## Definition of Done (Project)

Project is done when:

- All checkboxes in `00` through `10` are completed.
- Smoke workflow passes end-to-end.
- Quickstart and troubleshooting docs exist and match implemented behavior.
- No known blocking issues remain in escalation queue.

---

## Notes for Small-Model Agents

- Avoid refactoring unrelated files.
- Prefer minimal deltas and explicit types.
- Keep API contracts stable once tests are added.
- When uncertain, stop and escalate rather than guessing.
