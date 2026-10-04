#!/usr/bin/env bash
# Створює й налаштовує Firebase-проєкт Juno для обох репозиторіїв (Juno і Juno-client) однією командою.
# Запускати НА СВОЄМУ КОМП'ЮТЕРІ після `npx firebase-tools login`. Докладно: docs/FIREBASE-SETUP.md.
#
#   scripts/setup-firebase.sh <project-id> [шлях/до/Juno-client]
#
# Що робить: проєкт (якщо ще немає) → сайти Hosting (juno-admin, juno-client) → веб-застосунок → Realtime Database (europe-west1)
# → .firebaserc, .env.local і functions/.env.<project> в обох репозиторіях → деплой правил бази й Storage.
# Чого НЕ робить (лише в Console, інструкція в docs): тариф Blaze, провайдери входу, Storage "Get started", секрет Monobank, деплой функцій.
set -euo pipefail

PROJECT="${1:-}"
CLIENT_DIR="${2:-../juno-client}"
[ -n "$PROJECT" ] || { echo "Використання: $0 <project-id> [шлях/до/Juno-client]"; exit 2; }
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo "project-id: 6–30 символів, латиниця нижнього регістру, цифри, дефіс"; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$CLIENT_DIR" ] || { echo "Не знайдено репозиторій клієнта: $CLIENT_DIR (другий аргумент)"; exit 2; }
CLIENT_DIR="$(cd "$CLIENT_DIR" && pwd)"
# Свіжа версія CLI (на Node 22 старий firebase-tools@13 з кешу npx буває зламаний); можна підмінити: JUNO_FIREBASE_CLI="firebase"
if [ -n "${JUNO_FIREBASE_CLI:-}" ]; then read -r -a FB <<< "$JUNO_FIREBASE_CLI"; else FB=(npx --yes firebase-tools); fi
ADMIN_SITE="${JUNO_ADMIN_SITE:-juno-admin}"
CLIENT_SITE="${JUNO_CLIENT_SITE:-juno-client}"
REGION="europe-west1"

step() { printf '\n== %s\n' "$*"; }
# Список проєктів заодно перевіряє вхід; вивід беремо в змінну (grep -q у конвеєрі під pipefail дає хибні помилки)
if ! PROJECTS="$("${FB[@]}" projects:list 2>&1)"; then
  echo "$PROJECTS"; echo; echo "Не вдалося отримати список проєктів: перевірте вхід (npx firebase-tools login) і мережу."; exit 1
fi

step "1. Проєкт $PROJECT"
case "$PROJECTS" in *" $PROJECT "*) echo "вже існує" ;; *) "${FB[@]}" projects:create "$PROJECT" --display-name "Juno" ;; esac

step "2. Сайти Hosting: $ADMIN_SITE (адмінка), $CLIENT_SITE (клієнт), $PROJECT (лендинг)"
for s in "$ADMIN_SITE" "$CLIENT_SITE"; do
  "${FB[@]}" hosting:sites:create "$s" --project "$PROJECT" 2>&1 | tail -1 || true
done

step "3. Веб-застосунок і конфіг"
APP_ID="$("${FB[@]}" apps:list WEB --project "$PROJECT" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=(JSON.parse(s).result||[]).find(x=>x.displayName==="Juno");console.log(a?a.appId:"")}catch{console.log("")}})')"
if [ -z "$APP_ID" ]; then
  APP_ID="$("${FB[@]}" apps:create WEB "Juno" --project "$PROJECT" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.appId))')"
fi
echo "appId: $APP_ID"
CONFIG_JSON="$("${FB[@]}" apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).result.sdkConfig)))')"

step "4. Realtime Database ($REGION)"
"${FB[@]}" database:instances:create "$PROJECT-default-rtdb" --location "$REGION" --project "$PROJECT" 2>&1 | tail -2 || true

step "5. Файли конфігурації обох репозиторіїв"
export PROJECT ADMIN_SITE CLIENT_SITE CONFIG_JSON ROOT CLIENT_DIR REGION
node -e '
const fs = require("fs"), path = require("path"), e = process.env, c = JSON.parse(e.CONFIG_JSON);
const dbUrl = c.databaseURL || `https://${e.PROJECT}-default-rtdb.${e.REGION}.firebasedatabase.app`;
const env = [
  `VITE_FIREBASE_API_KEY=${c.apiKey}`, `VITE_FIREBASE_AUTH_DOMAIN=${c.authDomain}`, `VITE_FIREBASE_DATABASE_URL=${dbUrl}`,
  `VITE_FIREBASE_PROJECT_ID=${c.projectId}`, `VITE_FIREBASE_STORAGE_BUCKET=${c.storageBucket}`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID=${c.messagingSenderId}`, `VITE_FIREBASE_APP_ID=${c.appId}`,
].join("\n") + "\n";
const adminUrl = `https://${e.ADMIN_SITE}.web.app`, clientUrl = `https://${e.CLIENT_SITE}.web.app`;
fs.writeFileSync(path.join(e.ROOT, ".env.local"), env + `VITE_CLIENT_URL=${clientUrl}\n`);
fs.writeFileSync(path.join(e.CLIENT_DIR, ".env.local"), env);
fs.writeFileSync(path.join(e.ROOT, "functions", `.env.${e.PROJECT}`), `SALON_ADMIN_URL=${adminUrl}\nSALON_CLIENT_URL=${clientUrl}\n`);
fs.writeFileSync(path.join(e.ROOT, ".firebaserc"), JSON.stringify({ projects: { default: e.PROJECT }, targets: { [e.PROJECT]: { hosting: { admin: [e.ADMIN_SITE], landing: [e.PROJECT] } } } }, null, 2) + "\n");
fs.writeFileSync(path.join(e.CLIENT_DIR, ".firebaserc"), JSON.stringify({ projects: { default: e.PROJECT } }, null, 2) + "\n");
const fj = path.join(e.CLIENT_DIR, "firebase.json"), j = JSON.parse(fs.readFileSync(fj, "utf8"));
j.hosting.site = e.CLIENT_SITE; fs.writeFileSync(fj, JSON.stringify(j, null, 2) + "\n");
const lj = path.join(e.ROOT, "landing", "config.js");
fs.writeFileSync(lj, fs.readFileSync(lj, "utf8").replace(/appUrl: "[^"]*"/, `appUrl: "${adminUrl}"`));
console.log("записано: .env.local (обидва репо), functions/.env." + e.PROJECT + ", .firebaserc (обидва), firebase.json клієнта, landing/config.js");
'

step "6. Правила бази й Storage"
(cd "$ROOT" && "${FB[@]}" deploy --only database --project "$PROJECT")
(cd "$ROOT" && "${FB[@]}" deploy --only storage --project "$PROJECT") || echo "Storage ще не увімкнено в Console (Build → Storage → Get started) — після цього: firebase deploy --only storage"

cat <<MSG

ГОТОВО. Лишилось у Firebase Console та локально (див. docs/FIREBASE-SETUP.md, кроки 2–3 і 6–9):
  • тариф Blaze;  • вхід: Email/Password, Google, Phone;  • Storage "Get started";
  • npx firebase-tools functions:secrets:set JUNO_MONOBANK_TOKEN --project $PROJECT
  • деплой:  firebase deploy --only functions,hosting  (у Juno);  npm run build && firebase deploy --only hosting  (в Juno-client)
  • у GitHub (обидва репо): Variables FIREBASE_PROJECT_ID=$PROJECT і VITE_FIREBASE_*  — значення в .env.local
MSG
