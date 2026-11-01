import { useState, useCallback, useContext } from "react";
import { Modal, Btn } from "./ui";
import { ThemeContext } from "./theme.js";

// Діалог підтвердження у стилі застосунку замість системного window.confirm.
// const [confirm, confirmNode] = useConfirm();  …  if (await confirm({ title, text, okLabel, danger })) { … }  …  {confirmNode}
export function useConfirm() {
  const [req, setReq] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const close = (v) => { req?.resolve(v); setReq(null); };
  const node = req ? <ConfirmBody req={req} onClose={close}/> : null;
  return [confirm, node];
}

function ConfirmBody({ req, onClose }) {
  const { TEXT, DIM, RED } = useContext(ThemeContext);
  return (
    <Modal open onClose={() => onClose(false)} sheet size="md">
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{fontSize:30,marginBottom:8}}>{req.icon || (req.danger ? "⚠️" : "❓")}</div>
        <div style={{fontSize:16,fontWeight:800,color:TEXT,marginBottom:6}}>{req.title}</div>
        {req.text && <div style={{fontSize:13,color:DIM,lineHeight:1.5}}>{req.text}</div>}
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" flex={1} onClick={() => onClose(false)}>Скасувати</Btn>
        <Btn variant="primary" flex={1} accent={req.danger ? RED : undefined} onClick={() => onClose(true)}>{req.okLabel || "Так"}</Btn>
      </div>
    </Modal>
  );
}
