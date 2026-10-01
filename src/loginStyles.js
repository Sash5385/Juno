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
/* 1 · Сяйво (як тло застосунку) */
.lg-v1 .lg-bg{background:radial-gradient(circle at 10% 5%,rgba(255,90,60,.2),transparent 45%),radial-gradient(circle at 95% 30%,rgba(192,132,252,.18),transparent 45%),radial-gradient(circle at 20% 95%,rgba(45,212,191,.16),transparent 45%)}
/* 2 · Ореол логотипу */
.lg-v2 .lg-bg{background:radial-gradient(circle at 50% 28%,rgba(255,90,60,.28),transparent 42%)}
.lg-v2 .lg-card{background:rgba(38,40,44,.72);backdrop-filter:blur(8px)}
.lg-v2 .lg-logo{width:104px;height:104px;box-shadow:0 0 0 6px rgba(255,90,60,.12),0 0 0 14px rgba(255,90,60,.06),0 0 50px rgba(255,90,60,.5)}
.lg-v2 .lg-title{font-size:27px}
/* 3 · Шапка-градієнт */
.lg-v3 .lg-bg{background:linear-gradient(180deg,#1b1c20,#111214)}
.lg-v3 .lg-card{border-radius:28px}
.lg-v3 .lg-head{background:linear-gradient(135deg,#ff5a3c,#c04bd6 70%,#5b6bff);padding:30px 28px 38px;position:relative}
.lg-v3 .lg-head:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:22px;background:#2a2c30;border-radius:24px 24px 0 0}
.lg-v3 .lg-logo{box-shadow:0 6px 22px rgba(0,0,0,.45),0 0 0 4px rgba(255,255,255,.25)}
.lg-v3 .lg-sub{color:rgba(255,255,255,.85)}
.lg-v3 .lg-body{background:#2a2c30;padding-top:10px}
/* 4 · Неоморфізм */
.lg-v4{background:#1c1d21}
.lg-v4 .lg-card{background:#1c1d21;border:none;box-shadow:8px 8px 22px rgba(0,0,0,.55),-5px -5px 16px rgba(255,255,255,.04)}
.lg-v4 .lg-input{background:#1c1d21;border:none;box-shadow:inset 3px 3px 8px rgba(0,0,0,.55),inset -2px -2px 6px rgba(255,255,255,.04)}
.lg-v4 .lg-btn{box-shadow:5px 5px 14px rgba(0,0,0,.5),-3px -3px 10px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.35)}
.lg-v4 .lg-google{background:#1c1d21;border:none;box-shadow:4px 4px 12px rgba(0,0,0,.5),-3px -3px 9px rgba(255,255,255,.04)}
.lg-v4 .lg-logo{box-shadow:5px 5px 14px rgba(0,0,0,.55),-3px -3px 9px rgba(255,255,255,.05)}
/* 5 · Скло */
.lg-v5 .lg-bg i{border-radius:50%;filter:blur(55px)}
.lg-v5 .lg-bg i:nth-child(1){width:55vmin;height:55vmin;left:-8vmin;top:-6vmin;background:#ff5a3c;opacity:.85}
.lg-v5 .lg-bg i:nth-child(2){width:50vmin;height:50vmin;right:-8vmin;bottom:2vmin;background:#7a4dff;opacity:.85}
.lg-v5 .lg-bg i:nth-child(3){width:34vmin;height:34vmin;left:30vw;bottom:-10vmin;background:#14b8a6;opacity:.8}
.lg-v5 .lg-card{background:rgba(255,255,255,.08);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border-color:rgba(255,255,255,.2)}
.lg-v5 .lg-input{background:rgba(0,0,0,.28)}
/* 6 · Дорога і захід */
.lg-v6 .lg-bg{background:linear-gradient(180deg,#0b0c1c 0%,#2a1340 40%,#7a2f52 60%,#d9602f 66%,#0e0f12 66.1%)}
.lg-v6 .lg-bg i:nth-child(1){left:50%;top:44vh;width:30vmin;height:30vmin;margin-left:-15vmin;border-radius:50%;background:linear-gradient(180deg,#ffd37a,#ff5a3c);box-shadow:0 0 80px 24px rgba(255,120,70,.4)}
.lg-v6 .lg-bg i:nth-child(2){left:0;right:0;bottom:0;height:34vh;background:linear-gradient(180deg,#26272d,#0f1013);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%)}
.lg-v6 .lg-bg i:nth-child(3){left:0;right:0;bottom:0;height:34vh;background:repeating-linear-gradient(180deg,#f7c948 0 20px,transparent 20px 56px);clip-path:polygon(49.2% 0,50.8% 0,56% 100%,44% 100%)}
.lg-v6 .lg-card{background:rgba(22,23,27,.82);backdrop-filter:blur(10px)}
/* 7 · Кава (тема "kava" застосунку) */
.lg-v7{background:#1a0f0a}
.lg-v7 .lg-bg{background:radial-gradient(circle at 20% 10%,rgba(200,120,60,.35),transparent 50%),radial-gradient(circle at 90% 90%,rgba(120,60,30,.45),transparent 50%)}
.lg-v7 .lg-card{background:linear-gradient(135deg,#6b3a22,#3f1e0f);border-color:rgba(255,200,150,.15)}
.lg-v7 .lg-input{background:rgba(25,12,6,.7);border-color:rgba(255,200,150,.12)}
.lg-v7 .lg-label,.lg-v7 .lg-sub,.lg-v7 .lg-switch,.lg-v7 .lg-or,.lg-v7 .lg-forgot button{color:#d4b08c}
.lg-v7 .lg-btn{background:linear-gradient(135deg,#e8a45a,#c8742c);box-shadow:0 8px 20px rgba(200,116,44,.35)}
.lg-v7 .lg-switch button{color:#f0b872}
/* 8 · Латте (світла тема) */
.lg-v8{background:#efe3cf;color:#3b2a1a}
.lg-v8 .lg-bg{background:radial-gradient(circle at 15% 10%,rgba(255,170,110,.45),transparent 50%),radial-gradient(circle at 90% 85%,rgba(255,215,160,.7),transparent 50%)}
.lg-v8 .lg-card{background:linear-gradient(135deg,#fffaf0,#f6ead6);border:1px solid rgba(120,80,30,.15);box-shadow:0 12px 34px rgba(120,80,30,.2)}
.lg-v8 .lg-input{background:#fff;border-color:rgba(120,80,30,.2);color:#3b2a1a}
.lg-v8 .lg-label,.lg-v8 .lg-sub,.lg-v8 .lg-switch,.lg-v8 .lg-or,.lg-v8 .lg-forgot button,.lg-v8 .lg-note{color:#8a6a4a}
.lg-v8 .lg-or:before,.lg-v8 .lg-or:after{background:rgba(120,80,30,.2)}
.lg-v8 .lg-google{background:#fff;border-color:rgba(120,80,30,.2);color:#3b2a1a}
.lg-v8 .lg-install{background:rgba(120,80,30,.08);border-color:rgba(120,80,30,.15);color:#3b2a1a}
/* 9 · Смуги (як заблоковані слоти) */
.lg-v9 .lg-bg{background:repeating-linear-gradient(45deg,#1a1b1f 0 14px,#222428 14px 28px)}
.lg-v9 .lg-card{border:2px solid rgba(247,201,72,.55);box-shadow:0 0 0 6px rgba(247,201,72,.08),0 14px 34px rgba(0,0,0,.55)}
.lg-v9 .lg-head{background:repeating-linear-gradient(45deg,rgba(247,201,72,.16) 0 10px,rgba(247,201,72,.05) 10px 20px)}
.lg-v9 .lg-title{color:#f7c948}
.lg-v9 .lg-btn{background:linear-gradient(135deg,#ffd75e,#f7c948);color:#2a1d00;box-shadow:0 8px 20px rgba(247,201,72,.3)}
.lg-v9 .lg-switch button{color:#f7c948}
/* 10 · Мінімалізм */
.lg-v10 .lg-bg{background:radial-gradient(circle at 50% -10%,rgba(255,90,60,.25),transparent 55%)}
.lg-v10 .lg-card{background:transparent;border:none;box-shadow:none;overflow:visible}
.lg-v10 .lg-title{font-size:38px;font-weight:800;letter-spacing:-1.2px;background:linear-gradient(90deg,#ff7a5c,#f7c948,#7ed957);-webkit-background-clip:text;background-clip:text;color:transparent}
.lg-v10 .lg-logo{width:60px;height:60px}
.lg-v10 .lg-input{background:transparent;border:none;border-bottom:2px solid rgba(255,255,255,.18);border-radius:0;padding-left:2px}
.lg-v10 .lg-input:focus{box-shadow:none;border-bottom-color:#ff5a3c}
.lg-v10 .lg-btn{border-radius:999px}.lg-v10 .lg-google{border-radius:999px;background:transparent}
`;
