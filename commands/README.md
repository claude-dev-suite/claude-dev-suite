# Dev-Suite Slash Commands

Claude Code slash commands for project initialization and management.

---

## Available Commands

### `/init-project` - Project Initialization Wizard

Two versions available:

#### **v1: init-project.md** (Current Stable)

Original implementation, feature-complete and stable.

**Usage:**
```
/init-project [project-path]
```

**Features:**
- 15+ interactive questions
- Manual technology selection
- Stable and well-tested
- No external dependencies

**Lines:** 221

**Best for:**
- Production use until v2 is fully tested
- Users who prefer explicit control
- Projects with non-standard configurations

---

#### **v2: init-project-v2.md** (NEW - Modular with Quick Mode)

Modern implementation using modular libraries from Sprint 1-5.

**Usage:**
```
/init-project-v2 [project-path]
```

**Features:**
- Auto-detects 66+ technologies
- Quick Mode (1 confirmation vs 15 questions)
- Smart defaults based on detection
- API Explorer auto-configuration
- Built-in validation
- Modular library architecture

**Lines:** ~150 effective (32% reduction)

**Quick Mode Workflow:**
1. Auto-detects stack (React, Spring Boot, PostgreSQL, etc.)
2. Shows formatted summary
3. Single confirmation: "Use Quick Mode?"
4. Auto-selects MCP servers
5. Installs everything
6. Done in <30 seconds!

**Manual Mode Fallback:**
- User can reject Quick Mode
- Full wizard with smart defaults
- Same interactivity as v1

**Best for:**
- New projects
- High-confidence detections
- Speed-focused workflows
- Leveraging modular architecture

---

### `/ui-wizard` - Dashboard UI Wizard

Launch the graphical dashboard wizard instead of the CLI-based wizard.

**Usage:**
```
/ui-wizard
```

**Features:**
- No arguments required - uses current directory
- Visual step-by-step configuration
- Auto-detects project stack
- Interactive agent and MCP server selection
- Preview configuration before installation

**How it works:**
1. Starts the Next.js dashboard (if not running)
2. Opens browser to wizard page
3. Pre-fills with current directory path
4. Visual walkthrough of all configuration options

**Best for:**
- Users who prefer graphical interfaces
- Complex configurations requiring visual overview
- First-time dev-suite setup

---

## Comparison

| Feature | v1 (init-project) | v2 (init-project-v2) |
|---------|-------------------|----------------------|
| Detection | Manual grep | Modular library (detect-stack.sh) |
| Questions | 15+ always | 1 (quick) or 5-7 (manual) |
| Smart defaults | ❌ | ✓ |
| Quick Mode | ❌ | ✓ (when confidence=high) |
| API Explorer config | Manual | Auto-detected |
| Validation | External script | Built-in (validator.sh) |
| Code size | 221 lines | ~150 lines (-32%) |
| Dependencies | None | 5 modular libraries |
| Status | Stable | Testing phase |

---

## Libraries Used (v2 Only)

**v2** leverages 5 modular libraries from `lib/`:

1. **detect-stack.sh** (~785 lines)
   - Auto-detects 66+ technologies
   - Confidence scoring
   - API endpoint detection

2. **wizard-ui.sh** (~475 lines)
   - Quick Mode UI
   - Interactive prompts
   - Progress indicators

3. **config-generator.sh** (~600 lines)
   - .dev-suite.json generation
   - .mcp.json with auto-config
   - CLAUDE.md and .env.example

4. **mcp-installer.sh** (~400 lines)
   - Install MCP servers
   - Copy to project
   - Dependency management

5. **validator.sh** (~500 lines)
   - Installation validation
   - Health checks
   - Next steps suggestions

**Total library code:** 2700+ lines of reusable functions

---

## Migration Path

### For Users

**Phase 1: Testing (Current)**
```bash
# Use v1 for production
/init-project

# Test v2 on new projects
/init-project-v2
```

**Phase 2: Gradual Adoption**
After sufficient testing and feedback, v2 will become the default.

**No Breaking Changes:**
- Both versions produce identical output files
- Same .dev-suite.json, .mcp.json, CLAUDE.md
- Same MCP servers installed
- Same directory structure

---

## Quick Mode Example

**Traditional v1 Workflow:**
```
/init-project
→ Which project type? [frontend/backend/fullstack/monorepo]
→ Which frontend framework? [react/vue/angular/...]
→ Which state management? [zustand/redux/...]
→ Which testing framework? [vitest/jest/...]
→ Which backend framework? [spring-boot/nestjs/...]
→ Which database? [postgresql/mysql/mongodb/...]
→ Which ORM? [jpa/prisma/...]
→ Git service? [github/gitlab/...]
... (15+ questions total)
```

**v2 Quick Mode Workflow:**
```
/init-project-v2

Auto-detected stack:
  Frontend: react + zustand + vitest
  Backend: spring-boot + postgresql + jpa
  Git: github
  Confidence: HIGH

MCP servers auto-selected:
  • documentation
  • database-query
  • docker-manager
  • api-tester
  • api-explorer (http://localhost:8080/v3/api-docs)

Use Quick Mode? [Y/n] █

→ Done! (<30 seconds)
```

---

## Technical Details

### Command Execution Flow (v2)

```
1. Source all 5 libraries
   ↓
2. detect_all_stack()
   ↓
3. print_detection_summary()
   ↓
4. IF confidence=high:
     show_quick_mode_summary()
     auto_select_mcp_servers()
     AskUserQuestion: Use Quick Mode?
   ↓
5. IF yes → Install
   IF no → Manual wizard (Steps 4-7)
   ↓
6. install_all_mcp_servers()
   generate_dev_suite_json()
   generate_mcp_json()
   copy_all_mcp_to_project()
   ↓
7. validate_installation()
   ↓
8. suggest_next_steps()
```

### AskUserQuestion Integration

Both versions use Claude Code's `AskUserQuestion` tool for interactivity:

**v1:** All questions via AskUserQuestion (15+ total)

**v2:**
- Quick Mode: 1-2 questions
- Manual Mode: 5-7 questions with smart defaults

---

## Testing Status

### v1 (init-project.md)
- ✓ Tested on 100+ projects
- ✓ Stable and production-ready
- ✓ No known issues

### v2 (init-project-v2.md)
- ✓ Library functions tested individually
- ✓ Quick Mode tested on mock projects
- ✓ API detection tested on castellino/backend
- ⏳ Integration testing in progress
- ⏳ User feedback collection phase

---

## Feedback & Issues

**For v1 issues:**
Report to dev-suite maintainers (stable version).

**For v2 feedback:**
Sprint 6 will address:
- Atomic operations with rollback
- Comprehensive error handling
- Integration test suite
- CI pipeline

See: `docs/sprint6-production-checklist.md`

---

## References

- **Sprint 1-5 Summary:** All modular libraries completed
- **examples/init-project-v2.sh:** Reference bash script implementation
- **lib/README.md:** Complete library function reference
- **docs/sprint6-production-checklist.md:** Production readiness roadmap

---

*Updated: Sprint 5 completion - Quick Mode and modular command available*
