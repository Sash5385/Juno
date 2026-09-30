import { auth } from "./firebase";

// Тарифи — суми мають збігатися з functions/index.js (MONTHLY/YEARLY_PRICE_UAH)
export const PLANS = [
  { id: "month", label: "Місяць", price: 299,  note: "автосписання щомісяця (LiqPay)" },
  { id: "year",  label: "Рік",    price: 2999, note: "економія 589₴ проти 12 місяців" },
];

async function postPlan(url, plan) {
  const idToken = await auth.currentUser.getIdToken();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!resp.ok) throw new Error("server error");
  return resp.json();
}

export async function startLicensePayment(provider, plan) {
  if (provider === "liqpay") {
    const { data, signature, action } = await postPlan("/api/liqpay-order", plan);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action;
    form.target = "_blank";
    [["data", data], ["signature", signature]].forEach(([n, v]) => {
      const inp = document.createElement("input");
      inp.type = "hidden"; inp.name = n; inp.value = v;
      form.appendChild(inp);
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } else {
    const { pageUrl } = await postPlan("/api/monobank-invoice", plan);
    window.open(pageUrl, "_blank");
  }
}
