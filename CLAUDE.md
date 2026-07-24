# Project instructions

- Always load the `artifact-design` skill before creating or updating any Artifact in this project.
- When using the `brainstorming` skill, scale the process to the task. For simple, well-scoped changes, once the design is agreed in conversation, skip the spec → plan → implementation ceremony (no design doc, no separate plan) and implement directly. Reserve the full workflow for genuinely large or ambiguous work.

## Git workflow

Every Claude session follows this flow: **pull → work → branch → commit → push**.

- **Pull:** Always `git pull` before starting any work. A scheduled workflow pushes data-refresh commits to `main` on its own schedule, so the remote is often ahead — pulling first prevents diverged history and rejected pushes.
- **Branch:** Start work on a new branch (never commit directly to `main`).
- **Commit:** Commit the work — multiple commits within the session are fine.
- **Push:** Push the branch, but only if a file was actually changed. If nothing changed, don't push.
- **Merge:** Only when the user explicitly asks for a merge, merge the branch into `main`, then delete the branch.
