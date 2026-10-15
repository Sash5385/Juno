// Тести модуля робочого простору (src/workspace.js): тип акаунта, майстер за замовчуванням, склад, кольори, видимість.
import assert from "node:assert/strict";
import * as W from "../../src/workspace.js";

let fails = 0;
const t = (name, fn) => { try { fn(); console.log("ok   " + name); } catch (e) { fails++; console.log("FAIL " + name + "\n     " + e.message); } };

t("тип акаунта: за замовчуванням solo", () => {
  assert.equal(W.accountTypeOf(undefined), "solo");
  assert.equal(W.accountTypeOf({}), "solo");
  assert.equal(W.accountTypeOf({ accountType: "щось" }), "solo");
  assert.equal(W.accountTypeOf({ accountType: "salon" }), "salon");
  assert.equal(W.isSalon({ accountType: "salon" }), true);
  assert.equal(W.isSalon({}), false);
});
t("masterOf: без masterId — власник", () => {
  assert.equal(W.masterOf({}, "own"), "own");
  assert.equal(W.masterOf(null, "own"), "own");
  assert.equal(W.masterOf({ masterId: "" }, "own"), "own");
  assert.equal(W.masterOf({ masterId: 5 }, "own"), "own");
  assert.equal(W.masterOf({ masterId: "m2" }, "own"), "m2");
});
t("normStaff: власник першим, сортування, відсів сміття", () => {
  const s = W.normStaff({
    m2: { role: "master", name: "Анна", color: "#34d399", joinedAt: 20 },
    own: { role: "owner", name: "Олена", color: "#60a5fa", joinedAt: 10 },
    m3: { role: "master", name: "Богдан", color: "bad", joinedAt: 15 },
    junk: { role: "hacker", name: "x" },
    nul: null,
  }, "own");
  assert.deepEqual(s.map((m) => m.id), ["own", "m3", "m2"]);
  assert.equal(s[0].owner, true);
  assert.equal(s[1].color, W.MASTER_COLORS[0]); // некоректний колір → типовий
});
t("normStaff: власник додається, якщо рядка немає", () => {
  const s = W.normStaff({}, "own");
  assert.equal(s.length, 1); assert.equal(s[0].id, "own"); assert.equal(s[0].owner, true);
  assert.deepEqual(W.normStaff(null, ""), []);
});
t("normStaff: порожнє ім'я → «Майстер», довге обрізається", () => {
  const s = W.normStaff({ a: { role: "master", name: "  " }, b: { role: "master", name: "x".repeat(100) } }, "");
  assert.equal(s.find((m) => m.id === "a").name, "Майстер");
  assert.equal(s.find((m) => m.id === "b").name.length, 60);
});
t("pickMasterColor: перший невикористаний, потім за колом", () => {
  assert.equal(W.pickMasterColor([]), W.MASTER_COLORS[0]);
  assert.equal(W.pickMasterColor([{ color: W.MASTER_COLORS[0] }]), W.MASTER_COLORS[1]);
  const all = W.MASTER_COLORS.map((c) => ({ color: c }));
  assert.equal(W.pickMasterColor(all), W.MASTER_COLORS[all.length % W.MASTER_COLORS.length]);
});
t("ownerRow / masterRow", () => {
  assert.equal(W.ownerRow("Олена", "#fff", 5).role, "owner");
  assert.equal(W.ownerRow("", undefined, 5).name, "Власник");
  const m = W.masterRow("Анна", "#34d399", 7);
  assert.deepEqual(m, { role: "master", name: "Анна", color: "#34d399", joinedAt: 7 });
});
t("видимість: власник бачить усіх, майстер — себе, сторонній — нікого", () => {
  const staff = W.normStaff({ own: { role: "owner", name: "О" }, m1: { role: "master", name: "А" }, m2: { role: "master", name: "Б" } }, "own");
  assert.deepEqual(W.visibleMasterIds(staff, "own").sort(), ["m1", "m2", "own"]);
  assert.deepEqual(W.visibleMasterIds(staff, "m1"), ["m1"]);
  assert.deepEqual(W.visibleMasterIds(staff, "zzz"), []);
  assert.equal(W.canManageStaff(staff, "own"), true);
  assert.equal(W.canManageStaff(staff, "m1"), false);
});

t("parseWorkspaceToken: з посилання, з коду, сміття", () => {
  const tok = "abcdefghijkmnpqrstuvwxy2";
  assert.equal(W.parseWorkspaceToken(`https://juno-booking-admin.web.app/?workspace_invite=${tok}`), tok);
  assert.equal(W.parseWorkspaceToken(tok), tok);
  assert.equal(W.parseWorkspaceToken("  " + tok + " "), tok);
  assert.equal(W.parseWorkspaceToken("коротко"), "");
  assert.equal(W.parseWorkspaceToken(""), "");
});
t("workspaceInviteUrl веде в адмінку з параметром", () => {
  assert.match(W.workspaceInviteUrl("T123"), /\/\?workspace_invite=T123$/);
  const tok = W.newWorkspaceToken();
  assert.equal(tok.length, 24);
  assert.equal(W.parseWorkspaceToken(W.workspaceInviteUrl(tok)), tok);
});
t("colorForUid: стабільний колір зі списку", () => {
  assert.equal(W.colorForUid("abc"), W.colorForUid("abc"));
  assert.ok(W.MASTER_COLORS.includes(W.colorForUid("zzz")));
});

console.log(fails ? `\n${fails} FAILED` : "\nWORKSPACE OK");
process.exit(fails ? 1 : 0);
