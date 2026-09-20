# Demo video — 90 seconds

**The job of this video.** Not to explain dev-suite. To show what is on the other side of
the install, to someone deciding whether to pay the install cost.

That is the measured problem: 676 unique cloners against 35 stars in fourteen days. People
arrive, look, and leave before the dashboard ever opens. The video puts the payoff before
the price.

**Where it goes:** YouTube (evergreen, ranks in the search traffic that already dominates
the referrers), embedded in the README above the fold, and a 20-second cut for X.

**Constraint:** no face, no talking head. Screen only, with narration.

---

## Beat sheet

| Time | On screen | Narration |
|------|-----------|-----------|
| **0:00–0:07** | A real repo open in an editor. Scroll past `package.json`, `pom.xml`. Then `ls -a` — no `.claude/`, no `.cursor/`, no `AGENTS.md`. | "This is a project your AI assistant knows nothing about." |
| **0:07–0:12** | Terminal. Type `./init-project.sh ~/work/my-app`. Browser opens. | "One command." |
| **0:12–0:25** | **Detection screen.** Let the real detected names land: React, Spring Boot, PostgreSQL, Docker. Do not cut away early — this is the first moment of proof. | "It reads the project. Not a questionnaire — the actual manifests." |
| **0:25–0:38** | **Agents step.** Show that the pre-selection matches what was detected. Hover one agent to reveal its skills. Deselect one to show it is a choice, not a bundle. | "It suggests what your stack needs. You keep what you want." |
| **0:38–0:50** | **Assistants step.** The differentiator. Tick Claude Code. Then tick Cursor. Then Codex. | "And you pick who it's for. One install, seven assistants — each one gets its own config format, not a shared lowest common denominator." |
| **0:50–1:02** | **Install.** Then cut to the file tree appearing: `AGENTS.md`, `.claude/`, `.cursor/`, `.codex/`. Briefly open `AGENTS.md` and show the routing table. | "Thirty seconds later, three assistants are configured from one catalog." |
| **1:02–1:20** | **The proof shot.** Switch to Claude Code in that project. Ask something stack-specific — "add a paginated endpoint for orders". Show it routing to the Spring Boot agent by name. | "And it routes. Not a generic assistant with a longer prompt — the right specialist, for this repo." |
| **1:20–1:30** | Back to the file tree. Highlight that there are no absolute paths and no secrets. Then `git add . && git commit`. End card with the repo URL. | "All of it committable. Your teammate clones the repo and has the same setup." |

---

## The one shot that matters

**1:02–1:20.** Everyone's demo shows files appearing. Almost nobody shows the result
working. The routing shot is the only part that proves the files did something, and it is
worth more than the other eighty seconds combined.

If the video has to be cut to 60 seconds, cut the agents step, not this.

---

## Rules

- **Real project, real stack.** No `my-awesome-app`. A repo with a `pom.xml` and a
  `package.json` in it makes the monorepo detection visible for free.
- **Never show a spinner.** Cut the npm install and the build entirely. The first run
  genuinely takes minutes; the video is about the outcome, not the wait.
- **No music under the narration.** Dev-tool demos with stock music read as advertising.
- **Show one failure honestly, or none at all.** Do not stage a perfect run that the
  viewer cannot reproduce.
- **Cursor must be visible and smooth.** A demo where the pointer teleports is unreadable.
- **Captions burned in.** Most views are muted.

---

## Derivative cuts

- **20 seconds for X**: beats 0:38–1:20 only — assistants step, install, routing shot. No
  narration, captions only. This is the clip, not the video.
- **README GIF**: 0:12–0:25 alone, silent, looping. Detection is the single most legible
  moment.
- **YouTube Short**: the routing shot with a text overlay stating the question asked.

---

## Production

See `demo-video-production.md` for the tooling — recording, editing, voiceover, and
whether the footage can be generated deterministically from Playwright so it never goes
stale.
