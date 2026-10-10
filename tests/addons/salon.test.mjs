// Юніт-тест салону: node tests/addons/salon.test.mjs
import assert from "node:assert/strict";
import { salonSlugFrom, salonSlugValid, parseInviteToken, newInviteToken, salonMasters, inviteUrl, salonPublicUrl } from "../../src/salon.js";

assert.equal(salonSlugFrom("Салон Краса №1"), "salon-krasa-1");
assert.equal(salonSlugFrom("  Beauty  Studio!! "), "beauty-studio");
assert.equal(salonSlugFrom("Щастя"), "shchastya");
assert.ok(salonSlugFrom("x".repeat(80)).length <= 40);
assert.equal(salonSlugValid("beauty-a"), true);
assert.equal(salonSlugValid("ab"), false);
assert.equal(salonSlugValid("Admin"), false);
assert.equal(salonSlugValid("api"), false, "зарезервоване");
const t = newInviteToken();
assert.equal(t.length, 24);
assert.match(t, /^[a-z2-9]+$/);
assert.notEqual(t, newInviteToken());
assert.equal(parseInviteToken(inviteUrl(t)), t, "токен із посилання");
assert.equal(parseInviteToken("  " + t + " "), t, "токен як є");
assert.equal(parseInviteToken("abc"), "", "закороткий");
assert.equal(parseInviteToken(""), "");
assert.deepEqual(salonMasters({ masters: { b: "tok", a: "owner" } }), [{ iid: "a", owner: true }, { iid: "b", owner: false }]);
assert.deepEqual(salonMasters(null), []);
assert.equal(salonPublicUrl("x-y"), "https://juno-booking-client.web.app/s/x-y");
console.log("salon tests: ALL PASS");
