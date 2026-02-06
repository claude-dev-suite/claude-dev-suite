---
name: show-config
description: Display current dev-suite configuration with enabled components
allowed-tools: Read, Glob
---

# Show Configuration

Display the current dev-suite configuration in a readable format.

## Process

1. Read `.dev-suite.json`
2. Format and display:
   - Project info
   - Enabled stacks
   - Active agents and their skills
   - Documentation strategy
   - Active hooks
   - Enabled MCP servers

## Output Format

```
📦 Project: {name} ({type})

🎨 Frontend
   Framework: {framework} + {metaFramework}
   Styling: {styling}
   State: {stateManagement}

⚙️ Backend
   Runtime: {runtime}
   Framework: {framework}
   API: {apiStyle}

🗄️ Database
   Type: {type}
   ORM: {orm}

🤖 Active Agents
   - {agent1} (skills: {skill1}, {skill2})
   - {agent2} (skills: {skill3})

📚 Documentation: {strategy}
🪝 Hooks: format={formatOnSave}, lint={lintOnSave}
🔌 MCP: {servers}
```
