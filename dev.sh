#!/bin/bash
# dev.sh - DevPilot local development workflow

set -e

case "$1" in
  "start")
    echo "🚀 Starting DevPilot development environment..."
    mkdir -p packages/core/.devpilot
    pnpm --filter @devpilot/core run db:push
    pnpm run dev
    ;;

  "ui")
    echo "🎨 Starting UI only..."
    pnpm --filter @devpilot/ui dev
    ;;

  "web")
    echo "🌐 Starting web app..."
    pnpm --filter web dev
    ;;

  "cli")
    echo "⌨️  Starting CLI development..."
    pnpm --filter @devpilot/cli dev
    ;;

  "db")
    case "$2" in
      "migrate")
        echo "📦 Running migrations..."
        pnpm run db:migrate
        ;;
      "seed")
        echo "🌱 Seeding database..."
        pnpm run db:seed
        ;;
      "studio")
        echo "🔍 Opening Drizzle Studio..."
        pnpm run db:studio
        ;;
      "reset")
        echo "🗑️  Resetting database..."
        rm -f packages/core/.devpilot/data.db
        mkdir -p packages/core/.devpilot
        pnpm --filter @devpilot/core run db:push
        pnpm --filter @devpilot/core run db:seed
        ;;
      "push")
        echo "📤 Pushing schema to database..."
        mkdir -p packages/core/.devpilot
        pnpm --filter @devpilot/core run db:push
        ;;
      "check-sync")
        echo "🔄 Checking schema sync..."
        pnpm run db:check-sync
        ;;
      *)
        echo "Usage: ./dev.sh db {push|migrate|seed|studio|reset|check-sync}"
        ;;
    esac
    ;;

  "build")
    echo "🔨 Building all packages..."
    pnpm run build
    ;;

  "test")
    echo "🧪 Running tests..."
    pnpm run test
    ;;

  "clean")
    echo "🧹 Cleaning..."
    rm -rf node_modules packages/*/node_modules apps/*/node_modules
    rm -rf packages/*/.turbo apps/*/.turbo .turbo
    rm -rf packages/*/dist apps/*/.next
    ;;

  "install")
    echo "📦 Installing dependencies..."
    pnpm install
    ;;

  *)
    echo "DevPilot Development CLI"
    echo ""
    echo "Usage: ./dev.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start       Start full development environment"
    echo "  ui          Start UI package development"
    echo "  web         Start web app development"
    echo "  cli         Start CLI development"
    echo "  db          Database operations (migrate|seed|studio|reset|check-sync)"
    echo "  build       Build all packages"
    echo "  test        Run tests"
    echo "  clean       Clean all build artifacts"
    echo "  install     Install dependencies"
    ;;
esac
