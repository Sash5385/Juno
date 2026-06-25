/**
 * Одноразова міграція: заповнює activeStudents/{uid}=true
 * для всіх uid що мають хоч одне бронювання в bookings/
 *
 * Запуск:
 *   node migrate-active-students.js /path/to/serviceAccountKey.json
 *
 * Де взяти serviceAccountKey.json:
 *   Firebase Console → id4drive-booking-44182 → Project Settings
 *   → Service Accounts → Generate new private key
 */

const admin = require("firebase-admin");
const path  = require("path");

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Вкажіть шлях до serviceAccountKey.json як аргумент");
  console.error("Приклад: node migrate-active-students.js ./serviceAccountKey.json");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(keyPath))),
  databaseURL: "https://id4drive-booking-44182-default-rtdb.europe-west1.firebasedatabase.app",
});

const db = admin.database();

async function run() {
  console.log("Читаємо bookings...");
  const snap = await db.ref("bookings").get();

  if (!snap.exists()) {
    console.log("bookings порожні — нічого робити");
    process.exit(0);
  }

  const data = snap.val();
  const uids = Object.keys(data).filter(uid => {
    const userBookings = data[uid];
    return userBookings && typeof userBookings === "object" && Object.keys(userBookings).length > 0;
  });

  if (!uids.length) {
    console.log("Не знайдено жодного студента з бронюваннями");
    process.exit(0);
  }

  console.log(`Знайдено студентів: ${uids.length}`);

  const updates = {};
  for (const uid of uids) {
    updates[`activeStudents/${uid}`] = true;
  }

  await db.ref("/").update(updates);
  console.log(`Готово. activeStudents заповнено для ${uids.length} студентів.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Помилка:", err.message);
  process.exit(1);
});
