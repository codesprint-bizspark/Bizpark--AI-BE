# ============================================================
# BizparkAI — Root Railway Config (monorepo)
# Each service in Railway points to its subdirectory.
# This file documents the Railway service setup.
# ============================================================
#
# Create ONE Railway project with FOUR services:
#
# Service 1: bizpark-api
#   Source:        Bizpark-AI-BE/Bizpark.API
#   Builder:       Nixpacks
#   Build Cmd:     cd ../Bizpark.Core && npm ci && npm run build && cd ../Bizpark.API && npm ci && npm run build
#   Start Cmd:     node dist/main
#   Port:          3000
#
# Service 2: bizpark-runner
#   Source:        Bizpark-AI-BE/Bizpark.Runner.Py
#   Builder:       Nixpacks (auto-detects Python)
#   Build Cmd:     pip install -r requirements.txt
#   Start Cmd:     python run.py
#   Port:          3001
#
# Service 3: bizpark-admin
#   Source:        Bizpark-AI-BE/Bizpark.Admin
#   Builder:       Nixpacks
#   Build Cmd:     cd ../Bizpark.Core && npm ci && npm run build && cd ../Bizpark.Admin && npm ci && npm run build
#   Start Cmd:     node dist/main
#   Port:          3002
#
# Service 4: bizpark-commerce
#   Source:        Bizpark-AI-BE/Bizpark.Commerce
#   Builder:       Nixpacks
#   Build Cmd:     cd ../Bizpark.Core && npm ci && npm run build && cd ../Bizpark.Commerce && npm ci && npm run build
#   Start Cmd:     node dist/main
#   Port:          3003
#
# NOTE: Railway deploys from GitHub. Push this repo to GitHub first.
# Each service gets its own Railway domain, e.g.:
#   bizpark-api.up.railway.app → map to api.yourdomain.com via Cloudflare CNAME
