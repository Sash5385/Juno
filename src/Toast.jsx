import { useState, useCallback, useRef, useEffect } from "react";

// Короткий тост у стилі застосунку замість системного alert().
// const [toast, toastNode] = useToast();  …  toast("Текст") / toast("Текст", true /* помилка */)  …  {toastNode}
export function useToast() {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((msg, isErr = false) => {
    setT({ msg, isErr });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = t ? (
    <div role="status" style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9500,
      maxWidth: "calc(100vw - 32px)", padding: "10px 16px", borderRadius: 14, textAlign: "center",
      background: t.isErr ? "linear-gradient(145deg,#f87171,#b91c1c)" : "linear-gradient(145deg,#4caf6b,#2e7d4a)",
      color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1.35, pointerEvents: "none",
      boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
    }}>{t.msg}</div>
  ) : null;
  return [toast, node];
}
