// Мінімальні хелпери для HTTP-функцій салону: Bearer ID-токен Firebase Auth і розбір тіла.
const { admin } = require("./lib");

// Повертає декодований токен або надсилає 401 і повертає null
async function authUser(req, res) {
  const h = req.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) { res.status(401).json({ error: "unauthorized" }); return null; }
  try { return await admin.auth().verifyIdToken(token); }
  catch { res.status(401).json({ error: "unauthorized" }); return null; }
}

function bodyOf(req) {
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

module.exports = { authUser, bodyOf };
