# LinkedIn — introducing the project

Not a release post. This is for an audience that has never heard of Dev-Suite, on an
account that has never mentioned it.

**Account:** personal profile. LinkedIn distributes people far more than pages, and the
first post about a project should come from the person who built it.

**Why it opens on the problem, not the product.** Nobody on LinkedIn cares that a tool
exists. They care that a thing which annoys them has a name. The first three lines have to
be recognisable to someone who has never seen the repo — so the post spends them on the
annoyance and only then says what was built.

**Length:** ~290 words. Timing: Tuesday–Thursday morning. A LinkedIn post stays alive
roughly 48 hours, so plan to answer comments across two days.

**Before posting**, change "the past few months" if you want to be precise — the first
commit is 6 February 2026.

---

Every AI coding assistant wants to know the same things about your repo. None of them
share the answer.

Which framework you're on. Which conventions you follow. Which services touch the
database. You explain it to Claude Code in one file, to Cursor in another, to Copilot in a
third — and six months later all three are describing a codebase that no longer exists.

I've spent the past few months building a tool for that. It's called Dev-Suite, it's MIT,
and it does one thing: you point it at a repo and it configures your assistant for that
repo.

It reads the manifests — package.json, pom.xml, go.mod, whatever is actually there — works
out the stack, and installs the parts that match: domain-specific agents, framework
skills, local MCP servers, path-scoped rules. Then it writes that configuration in each
assistant's own format. Claude Code, Copilot, Cursor, Gemini CLI, Codex CLI, Cline, Kimi
Code. One catalog, seven targets, one install.

Two decisions I'd defend in a review:

**Everything it writes is committable.** No machine-specific absolute paths, no secrets in
the files. Your teammate clones the repo and gets your setup, not their own approximation
of it.

**It tells you what it cannot do.** Cursor has no equivalent to some rule types. Codex
only loads project MCP config in a folder you have explicitly trusted. The installer
prints those gaps at the end of the run instead of quietly writing nothing and letting you
find out later.

It is early and it is small — I am not going to pretend otherwise. But the test suite is
real, the installers work on Windows, macOS and Linux, and the thing it was built to do,
it does.

github.com/claude-dev-suite/claude-dev-suite

---

## Notes

- **No hashtags.** They read as promotion here and add nothing.
- **The link goes last and is not the point.** A post that is obviously a wrapper around a
  link gets suppressed; one that stands on its own does not.
- **"It is early and it is small" stays in.** The audience is engineering managers who can
  click through and count the stars in four seconds. Saying it first costs nothing and
  buys the rest of the post its credibility. Removing that line is the single easiest way
  to make this post worse.
- **Do not add a screenshot of the star count or a metrics chart.** At this stage the
  numbers argue against you; the idea argues for you.
- A GIF or short video of the wizard detecting a stack is a reasonable attachment —
  `docs/assets/demo-detection.mp4` is built for exactly this. Native video outperforms a
  link preview on LinkedIn.

## If it lands, the follow-ups

Both are already drafted or sketched, a week apart, same account:

1. The Google Fonts privacy bug — `v1.16.1/linkedin.md`. A stronger post than this one,
   but it needs people to know what the project is first, which is what this post buys.
2. The contributor-funnel automation: "I automated the parts of maintaining an open-source
   project that I kept forgetting to do."
