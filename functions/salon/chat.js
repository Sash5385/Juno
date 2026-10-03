// Push про повідомлення в чатах: клієнт ↔ власник (chats/{uid}, chats/general) і клієнт ↔ майстер (masterChats).
// Повідомлення: {from: "client" | "admin" (власник) | "master", text, name?, auto?, ts}.
const { onValueCreated } = require("firebase-functions/v2/database");
const { REGION, sRef, pushOwner, pushMaster, pushClient, masterName, salonName, clientUrl } = require("./lib");

const clip = (t) => (t.length > 100 ? t.slice(0, 100) + "…" : t);
async function clientNameOf(salonId, uid, msg) {
  if (msg.name) return msg.name; // у загальному чаті ім'я лежить у самому повідомленні
  return (await sRef(salonId, `users/${uid}/profile/name`).get().catch(() => null))?.val() || "Клієнт";
}

// Клієнт написав власнику (або в загальний чат) → push власнику
const salonOnClientMessage = onValueCreated(
  { ref: "salons/{salonId}/chats/{uid}/{msgId}", region: REGION },
  async (event) => {
    const msg = event.data.val();
    if (!msg || msg.from !== "client" || !msg.text) return;
    const { salonId, uid } = event.params;
    await pushOwner(salonId, `💬 ${await clientNameOf(salonId, uid, msg)}`, clip(String(msg.text)));
  }
);

// Власник написав клієнту (ручний чат; auto-повідомлення мають власний push) → push клієнту
const salonOnOwnerMessage = onValueCreated(
  { ref: "salons/{salonId}/chats/{uid}/{msgId}", region: REGION },
  async (event) => {
    const msg = event.data.val();
    const { salonId, uid } = event.params;
    if (!msg || msg.from !== "admin" || msg.auto || uid === "general" || !msg.text) return;
    await pushClient(salonId, uid, `💬 ${(await salonName(salonId)) || "Салон"}`, clip(String(msg.text)), { url: `${clientUrl()}/cabinet/chat` });
  }
);

// Чат клієнт ↔ майстер: клієнт → push майстру, майстер/власник → push клієнту
const salonOnMasterChatMessage = onValueCreated(
  { ref: "salons/{salonId}/masterChats/{masterId}/{uid}/{msgId}", region: REGION },
  async (event) => {
    const msg = event.data.val();
    const { salonId, masterId, uid } = event.params;
    if (!msg || msg.auto || !msg.text) return;
    if (msg.from === "client") {
      await pushMaster(salonId, masterId, `💬 ${await clientNameOf(salonId, uid, msg)}`, clip(String(msg.text)));
    } else if (msg.from === "master" || msg.from === "admin") {
      const who = msg.from === "master" ? await masterName(salonId, masterId) : await salonName(salonId);
      await pushClient(salonId, uid, `💬 ${who || "Майстер"}`, clip(String(msg.text)), { url: `${clientUrl()}/cabinet/chat?master=${masterId}` });
    }
  }
);

module.exports = { salonOnClientMessage, salonOnOwnerMessage, salonOnMasterChatMessage };
