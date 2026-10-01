// Оформлення екрана входу інструктора. Клас lg-vN на обгортці вмикає варіант (?lv=1…10, лише для перегляду).
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
/* Тема «Скло»: 10 варіантів */
.lg-wrap .lg-bg i{border-radius:50%;filter:blur(55px)}
.lg-card{background:rgba(255,255,255,.08);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.2)}
.lg-input{background:rgba(0,0,0,.28)}
/* 1 · Класичне скло */
.lg-v1 .lg-bg i:nth-child(1){width:55vmin;height:55vmin;left:-8vmin;top:-6vmin;background:#ff5a3c;opacity:.85}
.lg-v1 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:2vmin;background:#7a4dff;opacity:.85}
.lg-v1 .lg-bg i:nth-child(3){width:34vmin;height:34vmin;left:30vw;bottom:-10vmin;background:#14b8a6;opacity:.8}
/* 2 · Крижана аврора (холодні) */
.lg-v2{background:#0a1020}
.lg-v2 .lg-bg i:nth-child(1){width:58vmin;height:58vmin;left:-10vmin;top:-8vmin;background:#2d7bff;opacity:.85}
.lg-v2 .lg-bg i:nth-child(2){width:52vmin;height:52vmin;right:-10vmin;top:10vmin;background:#7a4dff;opacity:.8}
.lg-v2 .lg-bg i:nth-child(3){width:46vmin;height:46vmin;left:25vw;bottom:-14vmin;background:#14d1c0;opacity:.8}
.lg-v2 .lg-card{background:rgba(220,235,255,.1);border-color:rgba(190,220,255,.35);box-shadow:0 18px 50px rgba(20,40,120,.45),inset 0 1px 0 rgba(255,255,255,.35)}
/* 3 · Захід (теплі) */
.lg-v3{background:#150b0e}
.lg-v3 .lg-bg i:nth-child(1){width:60vmin;height:60vmin;left:-12vmin;bottom:-14vmin;background:#ff7a2c;opacity:.9}
.lg-v3 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;top:-8vmin;background:#ff3f7a;opacity:.85}
.lg-v3 .lg-bg i:nth-child(3){width:34vmin;height:34vmin;left:38vw;top:-6vmin;background:#ffcb47;opacity:.8}
.lg-v3 .lg-card{border-color:rgba(255,210,170,.35);box-shadow:0 18px 50px rgba(120,30,30,.45),inset 0 1px 0 rgba(255,255,255,.3)}
/* 4 · Смарагд */
.lg-v4{background:#06120f}
.lg-v4 .lg-bg i:nth-child(1){width:56vmin;height:56vmin;left:-10vmin;top:-10vmin;background:#14b87a;opacity:.85}
.lg-v4 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:-6vmin;background:#0ea5a5;opacity:.85}
.lg-v4 .lg-bg i:nth-child(3){width:30vmin;height:30vmin;right:22vw;top:4vmin;background:#7ed957;opacity:.7}
.lg-v4 .lg-card{border-color:rgba(160,255,210,.3);box-shadow:0 18px 50px rgba(0,60,40,.5),inset 0 1px 0 rgba(255,255,255,.3)}
.lg-v4 .lg-btn{background:linear-gradient(135deg,#34d399,#0ea5a5);box-shadow:0 8px 20px rgba(14,165,165,.35)}.lg-v4 .lg-switch button{color:#5eead4}
/* 5 · Плаваючі шари (анімація) */
.lg-v5 .lg-bg i{animation:lgfloat 14s ease-in-out infinite alternate}
.lg-v5 .lg-bg i:nth-child(1){width:55vmin;height:55vmin;left:-8vmin;top:-6vmin;background:#ff5a3c;opacity:.85}
.lg-v5 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:2vmin;background:#7a4dff;opacity:.85;animation-delay:-5s}
.lg-v5 .lg-bg i:nth-child(3){width:34vmin;height:34vmin;left:30vw;bottom:-10vmin;background:#14b8a6;opacity:.8;animation-delay:-9s}
@keyframes lgfloat{from{transform:translate(0,0) scale(1)}to{transform:translate(8vmin,-6vmin) scale(1.15)}}
.lg-v5 .lg-card:after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.14) 50%,transparent 60%);transform:translateX(-120%);animation:lgshine 6s ease-in-out infinite;pointer-events:none}
@keyframes lgshine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@media(prefers-reduced-motion:reduce){.lg-v5 .lg-bg i,.lg-v5 .lg-card:after{animation:none}}
/* 6 · Неонова кромка */
.lg-v6{background:#07080c}
.lg-v6 .lg-bg i:nth-child(1){width:26vmin;height:26vmin;left:calc(50% - 250px);top:calc(50% - 280px);background:#ff2d78;opacity:.9;filter:blur(45px)}
.lg-v6 .lg-bg i:nth-child(2){width:26vmin;height:26vmin;right:calc(50% - 250px);bottom:calc(50% - 280px);background:#00e5ff;opacity:.9;filter:blur(45px)}
.lg-v6 .lg-bg i:nth-child(3){display:none}
.lg-v6 .lg-card{background:rgba(12,14,22,.6);border:1px solid transparent;background-clip:padding-box;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 40px rgba(255,45,120,.15),0 0 40px rgba(0,229,255,.12)}
.lg-v6 .lg-btn{background:linear-gradient(135deg,#ff2d78,#7a4dff,#00b8ff)}
/* 7 · Прожектор */
.lg-v7{background:#0c0d12}
.lg-v7 .lg-bg i:nth-child(1){width:90vmin;height:90vmin;left:calc(50% - 45vmin);top:calc(50% - 45vmin);background:radial-gradient(circle,#ff5a3c,#7a4dff 60%,transparent 70%);opacity:.8;filter:blur(30px)}
.lg-v7 .lg-bg i:nth-child(2),.lg-v7 .lg-bg i:nth-child(3){display:none}
.lg-v7 .lg-card{background:rgba(255,255,255,.1);backdrop-filter:blur(34px);-webkit-backdrop-filter:blur(34px);border-color:rgba(255,255,255,.28);box-shadow:inset 1px 1px 0 rgba(255,255,255,.35),inset -1px -1px 0 rgba(255,255,255,.08),0 20px 60px rgba(0,0,0,.5)}
/* 8 · Іридесцентне */
.lg-v8{background:#0b0c10}
.lg-v8 .lg-bg{background:conic-gradient(from 210deg at 50% 50%,#ff5a3c,#f7c948,#7ed957,#14b8a6,#5b9bff,#c084fc,#ff5a3c);filter:blur(90px) saturate(1.2);opacity:.5;transform:scale(1.3)}
.lg-v8 .lg-bg i{display:none}
.lg-v8 .lg-card{background:rgba(14,15,20,.55);border:1.5px solid transparent;background-image:linear-gradient(rgba(14,15,20,.0),rgba(14,15,20,.0)),linear-gradient(135deg,#ff5a3c,#f7c948,#7ed957,#5b9bff,#c084fc);background-origin:border-box;background-clip:padding-box,border-box;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lg-v8 .lg-card:before{content:"";position:absolute;inset:0;background:rgba(14,15,20,.55);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);z-index:-1}
/* 9 · Світле скло (пастель) */
.lg-v9{background:#e9e4f5;color:#2a2440}
.lg-v9 .lg-bg i:nth-child(1){width:55vmin;height:55vmin;left:-8vmin;top:-6vmin;background:#ffb199;opacity:.9}
.lg-v9 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:2vmin;background:#b9a6ff;opacity:.9}
.lg-v9 .lg-bg i:nth-child(3){width:36vmin;height:36vmin;left:32vw;bottom:-10vmin;background:#9be3d7;opacity:.9}
.lg-v9 .lg-card{background:rgba(255,255,255,.45);border-color:rgba(255,255,255,.8);box-shadow:0 18px 50px rgba(90,70,150,.25)}
.lg-v9 .lg-input{background:rgba(255,255,255,.7);border-color:rgba(90,70,150,.18);color:#2a2440}
.lg-v9 .lg-label,.lg-v9 .lg-sub,.lg-v9 .lg-switch,.lg-v9 .lg-or,.lg-v9 .lg-forgot button,.lg-v9 .lg-note{color:#6a6285}
.lg-v9 .lg-or:before,.lg-v9 .lg-or:after{background:rgba(90,70,150,.2)}
.lg-v9 .lg-google{background:rgba(255,255,255,.7);border-color:rgba(90,70,150,.18);color:#2a2440}
.lg-v9 .lg-install{background:rgba(255,255,255,.5);color:#2a2440}
/* 10 · Дві панелі (брендова + форма) */
.lg-v10 .lg-bg i:nth-child(1){width:60vmin;height:60vmin;left:-10vmin;top:-8vmin;background:#ff5a3c;opacity:.85}
.lg-v10 .lg-bg i:nth-child(2){width:56vmin;height:56vmin;right:-10vmin;bottom:-6vmin;background:#7a4dff;opacity:.85}
.lg-v10 .lg-bg i:nth-child(3){width:30vmin;height:30vmin;left:42vw;top:-8vmin;background:#14b8a6;opacity:.75}
.lg-v10 .lg-card{max-width:820px;display:grid;grid-template-columns:1fr 1fr}
.lg-v10 .lg-head{display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border-right:1px solid rgba(255,255,255,.14);padding:40px 28px}
.lg-v10 .lg-logo{width:120px;height:120px;box-shadow:0 0 0 8px rgba(255,255,255,.08),0 12px 40px rgba(0,0,0,.45)}
.lg-v10 .lg-title{font-size:32px;margin-top:6px}
.lg-v10 .lg-body{padding:30px 32px}
@media(max-width:760px){.lg-v10 .lg-card{grid-template-columns:1fr;max-width:380px}.lg-v10 .lg-head{border-right:none;border-bottom:1px solid rgba(255,255,255,.14);padding:28px}.lg-v10 .lg-logo{width:84px;height:84px}.lg-v10 .lg-title{font-size:24px}}
`;
