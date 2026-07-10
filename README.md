# Valstine Studio

Valstine Studio is a modern, cross-platform database management tool designed for developers. It offers a beautiful, powerful interface for querying, exploring, and visualizing your data—whether you’re on the web, macOS, Windows, or Linux.

## Features

- **Intelligent SQL Editor**: Monaco-powered editor with syntax highlighting, auto-complete, and bracket matching.
- **Visual Schema Explorer**: Interactive diagram and tree explorer for your database schema.
- **Lightning Fast Queries**: Real-time results, easy data copy/export.
- **Schema Comparison**: Side-by-side diff view and instant migration SQL generation.
- **Built-in Version Control**: Full Git integration—stage, commit, push, and manage branches.
- **Pull Requests**: Open GitHub/GitLab PRs directly from the studio.
- **Secure Connections**: SSL/TLS, credential management, and SSH tunneling.
- **Cross-Platform**: Works on Web, macOS, and Windows. Sync your workspace across devices.
- **AI Assistant**: Get query explanations, optimization suggestions, and SQL generation from plain English.

## Supported Databases

- PostgreSQL
- MySQL & MariaDB
- SQLite
- SQL Server

## Getting Started

### Web

Open in your browser—no installation required.

### Desktop

Download the latest release for your platform:

- [macOS (.dmg)](https://github.com/techfix-sqaud/Valstine-studio/releases/latest/download/Valstine-Studio.dmg)
- [Windows (.exe)](https://github.com/techfix-sqaud/Valstine-studio/releases/latest/download/Valstine-Studio-Setup.exe)
- [Linux (.AppImage)](https://github.com/techfix-sqaud/Valstine-studio/releases/latest/download/Valstine-Studio.AppImage)

## Development

This is a Bun-workspaces monorepo:

```
apps/
  studio/       # the database IDE (this product) — Electron + web, keeps its own server/
  analyst-os/   # Valstine Analyst OS — web-only BI workbench
packages/
  ui/           # shared shadcn-based design system (@valstine/ui)
  core/         # shared state/API client/connection UI (@valstine/core)
```

Clone the repo and install dependencies (installs both apps' dependencies):

```bash
git clone https://github.com/techfix-sqaud/Valstine-studio.git
cd Valstine-studio
bun install
```

To start Studio's dev server (frontend + backend):

```bash
bun run dev:studio
```

To start Analyst OS's dev server (talks to the same backend via a dev proxy):

```bash
bun run dev:analyst-os
```

`bun run dev` is an alias for `bun run dev:studio`. `bun run build` builds both apps; use `bun run build:studio` / `bun run build:analyst-os` to build just one.

## Contributing

Contributions are welcome! Please open issues or pull requests for features, bug fixes, or suggestions.

## License

MIT
