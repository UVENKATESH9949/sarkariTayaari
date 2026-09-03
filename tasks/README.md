# Task documents

This folder is for **scoping a future piece of work before starting it**, when a task is
large enough or cross-system enough that a shared plan is worth writing down. It is not
where finished work is recorded — that's [`../reports/`](../reports/), which already has
one dated folder per shipped feature with what was built and how it was verified. Nor is
it the backlog — that's [`../reports/TICKET-STATUS.md`](../reports/TICKET-STATUS.md)
(every ticket, one file) and [`../reports/open-questions.md`](../reports/open-questions.md)
(unresolved decisions).

Use a `TASK-<id>-<slug>.md` file here when a task:
- touches more than one of `backend/` / `admin/` / `mobile/`, or
- changes an API contract, the database schema, or navigation, or
- is large enough that a human should approve the scope before an AI session starts
  implementing.

For a small, contained bug fix or content-only change, skip this folder — just do the
work and write it up in `reports/` if it's worth a permanent record, per
[`../AI_RULES.md`](../AI_RULES.md) §5.

Copy [`TEMPLATE.md`](TEMPLATE.md) to start one. When the task is done, either delete the
file (its content now lives in a `reports/<NN-topic>/` writeup) or mark its
"Implementation status" section complete and leave it as a historical record — either is
fine, just don't leave a stale "not started" task sitting here after the work shipped.
