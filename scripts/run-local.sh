#!/usr/bin/env bash
set -euo pipefail

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

# Prefer Node 20 if nvm is present
if command -v nvm >/dev/null 2>&1; then
  nvm install 20 >/dev/null
  nvm use 20 >/dev/null
fi

# Install deps if missing
if [ ! -d node_modules ]; then
  npm install
fi

# Start dev server
npm run dev

