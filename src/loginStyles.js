// Оформлення екрана входу майстра (тема «Скло»).
export const LOGIN_CSS = `
.lg-wrap{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:calc(20px + env(safe-area-inset-top,0px)) 20px calc(20px + env(safe-area-inset-bottom,0px));position:relative;overflow:hidden;background:#161719;color:#e8e8ea;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
.lg-bg{position:absolute;inset:0;pointer-events:none}.lg-bg i,.lg-bg b{position:absolute;display:block}
.lg-card{position:relative;z-index:1;width:100%;max-width:380px;border-radius:24px;overflow:hidden;background:linear-gradient(135deg,#2e3034,#26282c);border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 34px rgba(0,0,0,.45)}
.lg-head{text-align:center;padding:32px 28px 18px}.lg-body{padding:6px 28px 28px}
.lg-logo{width:76px;height:76px;border-radius:50%;margin-bottom:10px;box-shadow:-3px 5px 14px rgba(0,0,0,.5)}
.lg-title{font-size:23px;font-weight:800;letter-spacing:-.3px}.lg-sub{font-size:13px;color:#8b8d93;margin-top:5px}
.lg-label{display:block;font-size:12px;color:#8b8d93;margin:0 0 6px}
.lg-field{margin-bottom:14px}
.lg-input{width:100%;box-sizing:border-box;background:#161719;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px 14px;color:#e8e8ea;font:inherit;font-size:15px;outline:none;transition:border-color .15s,box-shadow .15s}
.lg-input:focus{border-color:#ff5a3c;box-shadow:0 0 0 3px rgba(255,90,60,.18)}
.lg-forgot{text-align:right;margin:-4px 0 16px}.lg-forgot button{background:none;border:none;color:#8b8d93;font-size:12px;cursor:pointer;padding:0;text-decoration:underline}
.lg-error{font-size:12px;color:#ff7a5c;text-align:center;margin-bottom:14px;padding:8px;border-radius:8px;background:rgba(255,90,60,.1)}
.lg-info{font-size:12px;color:#4caf6b;text-align:center;margin-bottom:14px;padding:8px;border-radius:8px;background:rgba(76,175,107,.12)}
.lg-btn{width:100%;padding:13px;border-radius:14px;border:none;cursor:pointer;color:#fff;font:inherit;font-size:15px;font-weight:800;background:linear-gradient(135deg,#ff7a5c,#ff5a3c);box-shadow:0 8px 20px rgba(255,90,60,.3);transition:transform .15s,filter .15s}
.lg-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.07)}.lg-btn:disabled{background:rgba(255,90,60,.3);box-shadow:none;cursor:default}
.lg-or{display:flex;align-items:center;gap:10px;margin:16px 0 12px;font-size:11px;color:#8b8d93}.lg-or:before,.lg-or:after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1)}
.lg-google{width:100%;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#e8e8ea;font:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
.lg-switch{text-align:center;margin-top:16px;font-size:13px;color:#8b8d93}.lg-switch button{background:none;border:none;color:#ff5a3c;font:inherit;font-size:13px;font-weight:800;cursor:pointer;padding:0}
.lg-note{margin-top:12px;font-size:11.5px;color:#8b8d93;line-height:1.5;text-align:center}
.lg-install{width:100%;margin-top:12px;padding:10px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#e8e8ea;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
/* Тема «Скло» */
.lg-wrap .lg-bg i{border-radius:50%;filter:blur(55px)}
.lg-card{background:rgba(255,255,255,.08);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.2)}
.lg-input{background:rgba(0,0,0,.28)}
/* Кольорові шари за склом */
.lg-v1 .lg-bg i:nth-child(1){width:55vmin;height:55vmin;left:-8vmin;top:-6vmin;background:#ff5a3c;opacity:.85}
.lg-v1 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:2vmin;background:#7a4dff;opacity:.85}
.lg-v1 .lg-bg i:nth-child(3){width:34vmin;height:34vmin;left:30vw;bottom:-10vmin;background:#14b8a6;opacity:.8}
`;
