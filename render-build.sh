#!/usr/bin/env bash
set -euo pipefail

cp package.render.json package.json
npm install --include=dev --no-audit --no-fund
npm run build:render
