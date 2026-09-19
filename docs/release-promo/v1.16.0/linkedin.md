# LinkedIn post

> **Hold until the Windows MCP build fix ships** — same reason as the X thread.

**Account:** post from the personal profile, not a company page. LinkedIn distributes
people far more than pages, and a new page has no followers. The framing below is
first-person for that reason.

**Audience here is different from X:** tech leads and engineering managers, who care about
the decision and the process more than the diff. So the post is about what the bug says
about local-first software, not about `@fontsource`.

**Length:** ~270 words. Timing: Tuesday–Thursday morning. LinkedIn posts stay alive ~48h,
so this is the one worth answering comments on over two days rather than two hours.

---

I found a privacy bug in my own desktop app last week, and it had been there since the
first release.

The app is a configurator. It runs on your machine, loads its interface from disk, and
writes files into your project. No account, no telemetry, no server. That was the whole
design.

It was also calling Google on every single launch.

One line of HTML — a stylesheet link to Google Fonts, for two typefaces. Every time
someone opened the app, their machine sent Google an IP address and a timestamp. For
fonts.

What makes it worth writing about isn't the mistake. It's why it survived so long: it
degraded silently. With no network, the app fell back to system fonts and looked
essentially the same. Nothing broke. Nothing warned. You could use the product for months
and never notice it was reaching out.

The fix took an afternoon — bundle the fonts, 512 KB in a build measured in tens of
megabytes, and tighten the content security policy so the origins can't be reached at all.

The part I actually care about is the test. Not a test that the fonts render — a test that
pins the markup and both security policies. Because this regression is one `<link>` away,
or one CSP "temporarily relaxed to make the font work" by someone who wasn't there for
this.

"Local-first" isn't a property you declare in a README. It's a property you have to be
able to prove, in CI, after you've forgotten why it mattered.

The project is open source and MIT licensed, if it's useful to anyone:
github.com/claude-dev-suite/claude-dev-suite

---

## Notes

- No hashtags. They read as promotion on LinkedIn now and add nothing here.
- The link goes last and is not the point of the post. A post that is obviously a link
  wrapper gets suppressed; a post that stands on its own does not.
- If you want a second post out of this release, the contributor-funnel automation is the
  other story — "I automated the parts of maintaining an open-source project that I kept
  forgetting to do." Different audience, same account, a week apart.
