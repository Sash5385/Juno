import { auth } from "./firebase";

// Викликає серверну функцію deleteAccount (див. functions/index.js). Кидає помилку, якщо не вдалося.
export async function deleteAccountRequest(body) {
  const token = await auth.currentUser.getIdToken(true);
  const resp = await fetch("/api/delete-account", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("delete failed " + resp.status);
  return resp.json();
}
