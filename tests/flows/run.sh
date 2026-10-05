#!/bin/bash
# Тест записів/скасувань/переносів: реальний клієнтський db.js + реальні правила БД + серверна onBookingChanged на емуляторах.
set -e
TEST="${1:-booking-flow}.test.mjs"   # bash run.sh [race]
cd "$(dirname "$0")"
CLIENT_DIR="${CLIENT_DIR:-$(cd ../../../DrivePad-Client && pwd)}"
export CLIENT_DIR
cp ../../database.rules.json .            # емулятор вимагає правил усередині теки проєкту
ln -sfn "$CLIENT_DIR/node_modules" node_modules
node build-client.mjs
npx --yes firebase-tools@13 emulators:exec --only database,auth --project demo-flow "node ${TEST}"
