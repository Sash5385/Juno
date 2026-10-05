// Точка входу бандла: реальний db.js клієнта + тестовий config (емулятори). CLIENT_DIR задається в build-client.mjs через alias.
export * from "client-db";
export { auth, db } from "./testconfig.js";
