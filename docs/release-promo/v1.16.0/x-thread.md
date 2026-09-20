# X thread — the local-first app that wasn't

> **Hold until the Windows MCP build fix ships.** v1.16.0 leaves Windows users with zero
> compiled MCP servers and no warning. Post this against the release that carries the fix,
> changing only the version line at the end.

**Angle:** not an announcement. A bug with a lesson, which is what actually travels here.
The audience is people who ship Electron apps and people in the Claude Code / MCP
ecosystem, and both of them have this same `<link>` in their tree right now.

**Timing:** Tuesday–Thursday. Anthropic has reshared community projects, so
`@AnthropicAI` is worth a mention on the last post only, never the first.

---

**1/**

Our Electron dashboard loads its UI from disk. No server, no telemetry, nothing remote.

It still called Google on every launch.

---

**2/**

One line in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter...">
```

Two font families. Every start, the user's machine handed Google an IP and a timestamp —
from an app with no reason to touch the network at all.

---

**3/**

It also failed quietly.

No network → silent fallback to system fonts. So it never looked broken. It just leaked,
and looked fine doing it.

That's the category of bug you don't find by using the product.

---

**4/**

Fix: bundle the fonts with `@fontsource`. Vite emits them into `dist/assets`, the renderer
reads them off disk.

512 KB, in a build measured in tens of megabytes.

We kept every unicode subset rather than latin alone — the UI renders the user's own file
paths and contents. `unicode-range` still means only the subset in use is ever read.

---

**5/**

The part that matters more than the fix:

both content security policies now drop the Google origins. `style-src` and `font-src` are
back to `'self'`, on the Express server and in Electron's injected headers.

The build has zero remote references.

---

**6/**

Which is testable — so there's a test on it.

Because the regression is one `<link>` away, or a CSP "relaxed to make the font work". A
test that pins the markup *and* both policies is the only thing that stops this coming
back in six months when nobody remembers why.

---

**7/**

If you ship an Electron app, grep your `index.html` for `googleapis`.

It's the most common way a local-first app quietly stops being local.

dev-suite — agents, skills and MCP servers configured into your repo for Claude Code,
Copilot, Cursor, Gemini CLI, Codex CLI, Cline and Kimi Code. MIT.

github.com/claude-dev-suite/claude-dev-suite

---

## Notes

- Post 1 is the whole thread's job. If it doesn't land, nothing after it matters.
- Don't lead with the project name. The bug is the hook; the project is the payoff.
- Reply to your own thread with the diff screenshot if you want a second surface — a
  picture of `style-src 'self'` replacing the Google origins reads instantly.
- Do **not** post this and leave. The replies are where the reach comes from.
