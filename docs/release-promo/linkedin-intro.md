# LinkedIn — introducing the project

For an audience that has never heard of Dev-Suite, on an account that has never
mentioned it.

**Account:** personal profile. LinkedIn distributes people far more than pages, and
the first post about a project should come from the person who built it.

**The thesis, and why it is this one.** Not "look what I built" — the interesting
claim is that *assistant configuration is code that lives in your repo, and nobody
treats it that way*. That reframing is what makes an engineering manager read past
line three, and it happens to be the actual design principle of the codebase:
a manifest with per-file hashes, drift detection, ownership checks, rollback.

**Length:** ~430 words, longer than a normal post because it explains a mechanism.
That is affordable only because the opening earns it. Timing: Tuesday–Thursday
morning; plan to answer comments across two days.

**Before posting**, adjust "the past few months" if you want precision — first
commit is 6 February 2026.

---

Everyone is writing configuration for AI coding assistants right now. Almost nobody
is treating it like code.

It lives in your repo. It changes behaviour. It goes stale, it drifts, and when two
people edit it you get a silent conflict rather than a merge marker. We learned to
manage that for infrastructure a decade ago. For the files steering the thing
writing our code, we mostly hand-edit markdown and hope.

I've spent the past few months building a tool that takes the other position. It's
called Dev-Suite, it's MIT, and it configures a repo for Claude Code, Copilot,
Cursor, Gemini CLI, Codex CLI, Cline and Kimi Code from one catalog.

Three things in it I'd actually defend in review:

**Context is a budget, and skills are tiered because of it.** An agent declares
specialist knowledge — a React agent knows React. But declared skills get injected
in full at startup, in every subagent you spawn. I measured it: one 41 KB skill
declared on one agent cost ~17.7k extra tokens per spawn. So each agent declares
*one* core skill it cannot work without, and everything else is reachable on demand
through an MCP server. Same capability, a fraction of the standing cost.

**What it writes is committable, and it knows what it owns.** No absolute paths, no
secrets in the files — bundle paths render as each assistant's project-root token,
credentials as references. Every written file is recorded with its hash and its
target, so a later run can tell "this is my file, unchanged" from "you edited this"
from "you wrote this yourself, it was never mine." Uninstall un-merges shared files
instead of deleting them. Your prose survives.

**It tells you what it can't do.** Cursor has no project-level settings file. Codex
only loads project MCP config in a folder you've trusted. Those are printed at the
end of the install, classified — a thing to do, a thing routed differently, a thing
not built yet, a real dead end — rather than silently writing nothing.

It's early and it's small. But the test suite is real, and it does the thing it was
built to do.

github.com/claude-dev-suite/claude-dev-suite

---

## Notes

- **No hashtags.** The link goes last and is not the point of the post.
- **"It's early and it's small" stays in.** The audience can click through and count
  the stars in four seconds. Saying it first costs nothing and buys the rest its
  credibility. Removing that line is the easiest way to make this post worse.
- **The 17.7k number is the most quotable thing here** — it is a measurement, not an
  estimate, and it is the kind of concrete figure that gets a post shared. Do not
  round it to "a lot".
- **Do not add catalogue counts** ("67 agents, 700+ skills"). They go stale inside a
  release, and this post has no expiry date otherwise.
- Attach `docs/assets/demo-detection.mp4` — native video outperforms a link preview,
  and it shows the problem in the opening lines being solved.

## The follow-ups, a week apart

1. The Google Fonts privacy bug — `v1.16.1/linkedin.md`. Stronger than this post,
   but it needs people to know what the project is, which is what this one buys.
2. The contributor-funnel automation: "I automated the parts of maintaining an
   open-source project that I kept forgetting to do."
