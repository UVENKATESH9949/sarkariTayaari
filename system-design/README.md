# System Design — start here

These notes explain how SarkariTaiyaari is put together, in plain language.

They exist because the project has grown past the point where you can hold it all in
your head. When you come back after a week and think *"wait, where does this happen
again?"* — this folder is the answer.

## The files

| File | Read it when |
|---|---|
| [01-big-picture.md](01-big-picture.md) | You want to know what the parts are and how they talk |
| [02-database.md](02-database.md) | You need to know what's stored where, and why there are two databases |
| [03-how-data-flows.md](03-how-data-flows.md) | You wonder how a question you typed reaches somebody's phone |
| [04-where-do-i-change-things.md](04-where-do-i-change-things.md) | You know *what* you want to change but not *which file* |
| [05-why-its-built-this-way.md](05-why-its-built-this-way.md) | Something looks odd and you want the reason before you "fix" it |

## The one-line version

> The phone downloads the whole question bank once, stores it on the device, and works
> with no internet after that. Everything a student sees is data an admin typed in —
> not code.

If you remember only that, most of the rest follows.

## How these differ from the other docs

- **`system-design/`** (this folder) — how the system works, in simple terms. Stable.
- **`offline-exam-app-requirements.md`** — the full history: every decision, every
  ticket, every phase. Long, detailed, chronological.
- **`reports/`** — what happened in each piece of work, and how it was verified.
- **`memory/STATUS.md`** — where things stand right now and what's next.

Start here. Go to the others when you need detail.
