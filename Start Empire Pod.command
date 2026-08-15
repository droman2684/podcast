#!/bin/bash
# Double-click this file in Finder to launch Empire Pod in development mode.
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

npm run dev
