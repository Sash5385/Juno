import { useState } from "react";

// ─── TOKENS ─────────────────────────────────────────────────────
const BG      = "#1c1d21";
const BG_DEEP = "#161719";
const SURFACE = "#26282c";
const SURF_HI = "#2e3034";
const SURF_LO = "#1f2125";
const BORDER  = "rgba(255,255,255,0.05)";
const TEXT    = "#e8e8ea";
const DIM     = "#8b8d93";
const FAINT   = "#5a5c62";
const ACCENT  = "#ff5a3c";
const ACC_HI  = "#ff7a5c";
const GREEN   = "#7ed957";
const BLUE    = "#5b9bff";
const PURPLE  = "#c084fc";
const GOLD    = "#f7c948";
const RED     = "#ef4444";

const SO = "6px 6px 16px rgba(0,0,0,0.45),-3px -3px 10px rgba(255,255,255,0.025)";
const SI = "inset 3px 3px 8px rgba(0,0,0,0.4),inset -2px -2px 6px rgba(255,255,255,0.025)";

// ─── CSS ────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}
.pillow{background:linear-gradient(135deg,${SURF_HI} 0%,${SURFACE} 50%,${SURF_LO} 100%);border:1px solid rgba(255,255,255,0.04);border-radius:18px;position:relative;overflow:hidden;box-shadow:-2px 6px 16px rgba(0,0,0,0.45),inset 1px 1px 0 rgba(255,255,255,0.08),inset -1px -1px 0 rgba(0,0,0,0.25)}
.pillow::before{content:'';position:absolute;pointer-events:none;top:0;right:0;width:60%;height:35%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.07) 0%,transparent 70%);border-radius:18px}
.i3{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;position:relative;overflow:hidden;flex-shrink:0;box-shadow:-2px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)}
.i3::before{content:'';position:absolute;top:0;right:0;width:60%;height:50%;background:radial-gradient(ellipse at top right,rgba(255,255,255,0.35) 0%,transparent 70%);pointer-events:none}
.i3>svg{position:relative;z-index:1}
@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fade-in .22s ease both}
@keyframes bar-grow{from{height:0}to{height:var(--h)}}
.bar-anim{animation:bar-grow .5s cubic-bezier(.34,1.56,.64,1) both}
@keyframes line-draw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
.line-anim{animation:line-draw 1s ease both}
`;

// ─── MOCK DATA ───────────────────────────────────────────────────
const MONTHS = ["Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру","Січ"];

const DATA_MONTH = [
  {label:"Лют", income:18400, lessons:28, school:16, private:12, noshow:1, cancel:2, newStudents:1},
  {label:"Бер", income:21200, lessons:32, school:18, private:14, noshow:2, cancel:1, newStudents:2},
  {label:"Кві", income:19800, lessons:30, school:17, private:13, noshow:0, cancel:3, newStudents:0},
  {label:"Тра", income:24600, lessons:36, school:20, private:16, noshow:1, cancel:1, newStudents:3},
  {label:"Чер", income:22100, lessons:33, school:19, private:14, noshow:2, cancel:2, newStudents:1},
];

const DATA_WEEK = [
  {label:"Пн", income:4200, lessons:6, school:4, private:2, noshow:0, cancel:0},
  {label:"Вт", income:3800, lessons:5, school:3, private:2, noshow:1, cancel:0},
  {label:"Ср", income:5100, lessons:7, school:4, private:3, noshow:0, cancel:1},
  {label:"Чт", income:4600, lessons:6, school:3, private:3, noshow:0, cancel:0},
  {label:"Пт", income:5300, lessons:8, school:5, private:3, noshow:0, cancel:0},
  {label:"Сб", income:3200, lessons:5, school:3, private:2, noshow:1, cancel:1},
];

const DATA_YEAR = MONTHS.map((l,i)=>({
  label:l,
  income: 15000 + Math.sin(i*0.8)*5000 + i*800 + Math.random()*2000,
  lessons: 22 + Math.round(Math.sin(i*0.6)*8 + i*0.5),
  school: 12+i, private: 10+i,
  noshow: Math.round(Math.random()*2),
  cancel: Math.round(Math.random()*3),
  newStudents: Math.round(Math.random()*2)
}));

const TOP_STUDENTS = [
  {name:"Олена Мороз",   hours:38, paid:22800, type:"school",  hue:30},
  {name:"Тетяна Кравець",hours:40, paid:24000, type:"school",  hue:160},
  {name:"Андрій Чорний", hours:30, paid:18000, type:"school",  hue:220},
  {name:"Дмитро Сало",   hours:9,  paid:6300,  type:"private", hue:280},
  {name:"Марія Коваль",  hours:12, paid:7200,  type:"school",  hue:340},
];

const PERIODS = [
  {id:"week",  label:"Тиждень"},
  {id:"month", label:"Місяць"},
  {id:"year",  label:"Рік"},
  {id:"day",   label:"День"},
  {id:"custom",label:"Довільний"},
];

// ─── HELPERS ────────────────────────────────────────────────────
function Inset({ children, style={} }) {
  return <div style={{background:`linear-gradient(135deg,${BG_DEEP},${SURF_LO})`,borderRadius:12,boxShadow:SI,...style}}>{children}</div>;
}
const fmt = n => n>=1000 ? `${(n/1000).toFixed(1)}к` : String(n);
const fmtK = n => n>=1000 ? `${(n/1000).toFixed(1)}к ₴` : `${n} ₴`;

// ─── KPI CARD ────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon, trend }) {
  return (
    <div className="pillow fade-in" style={{padding:"14px 14px 12px",flex:"1 1 140px",minWidth:0}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
        <div className="i3" style={{width:36,height:36,background:`linear-gradient(165deg,${color}99,${color}44)`}}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{
            fontSize:10,fontWeight:800,
            color:trend>=0?GREEN:RED,
            background:trend>=0?"rgba(126,217,87,0.12)":"rgba(239,68,68,0.12)",
            padding:"2px 7px",borderRadius:8
          }}>{trend>=0?"+":""}{trend}%</span>
        )}
      </div>
      <div style={{fontSize:22,fontWeight:900,color,letterSpacing:-0.5}}>{value}</div>
      <div style={{fontSize:11,color:DIM,marginTop:2,fontWeight:600}}>{label}</div>
      {sub && <div style={{fontSize:10,color:FAINT,marginTop:1}}>{sub}</div>}
    </div>
  );
}

// ─── SVG LINE CHART ──────────────────────────────────────────────
function LineChart({ data, valueKey, color, height=120 }) {
  const W = 320, H = height, PAD = 10;
  const vals = data.map(d=>d[valueKey]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;

  const pts = vals.map((v,i)=>({
    x: PAD + (i/(vals.length-1))*(W-PAD*2),
    y: H - PAD - ((v-min)/range)*(H-PAD*2)
  }));

  const path = pts.map((p,i)=>i===0?`M${p.x},${p.y}`:`L${p.x},${p.y}`).join(" ");
  const area = `${path} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  const pathLen = pts.reduce((s,p,i)=>i===0?0:s+Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y),0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {/* grid lines */}
      {[0,0.25,0.5,0.75,1].map(t=>(
        <line key={t} x1={PAD} y1={PAD+(1-t)*(H-PAD*2)} x2={W-PAD} y2={PAD+(1-t)*(H-PAD*2)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
      ))}
      {/* area fill */}
      <path d={area} fill={`url(#grad-${color.replace("#","")})`}/>
      {/* line */}
      <path className="line-anim" d={path} fill="none"
        stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{"--len":pathLen,strokeDasharray:pathLen}}/>
      {/* dots */}
      {pts.map((p,i)=>(
        <circle key={i} cx={p.x} cy={p.y} r="4" fill={color}
          style={{filter:`drop-shadow(0 0 4px ${color}88)`}}/>
      ))}
      {/* labels */}
      {data.map((d,i)=>(
        <text key={i} x={pts[i].x} y={H} textAnchor="middle" fill={FAINT} fontSize="9" fontWeight="700">{d.label}</text>
      ))}
    </svg>
  );
}

// ─── SVG BAR CHART ───────────────────────────────────────────────
function BarChart({ data, valueKey, color, height=120 }) {
  const W = 320, H = height, PAD = 10;
  const vals = data.map(d=>d[valueKey]);
  const max = Math.max(...vals) || 1;
  const barW = (W - PAD*2) / data.length * 0.6;
  const gap  = (W - PAD*2) / data.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{overflow:"visible"}}>
      {/* grid */}
      {[0,0.25,0.5,0.75,1].map(t=>(
        <line key={t} x1={PAD} y1={PAD+(1-t)*(H-PAD*2-10)} x2={W-PAD} y2={PAD+(1-t)*(H-PAD*2-10)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
      ))}
      {data.map((d,i)=>{
        const bH = ((d[valueKey]||0)/max)*(H-PAD*2-10);
        const x  = PAD + i*gap + gap*0.2;
        const y  = H - PAD - 10 - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} rx="5"
              fill={`url(#bgrad-${i})`}
              style={{filter:`drop-shadow(0 2px 6px ${color}44)`}}/>
            <defs>
              <linearGradient id={`bgrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.9"/>
                <stop offset="100%" stopColor={color} stopOpacity="0.4"/>
              </linearGradient>
            </defs>
            <text x={x+barW/2} y={H} textAnchor="middle" fill={FAINT} fontSize="9" fontWeight="700">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── DONUT CHART ─────────────────────────────────────────────────
function DonutChart({ school, total, size=80 }) {
  const pct = total ? school/total : 0;
  const r = 28, cx = size/2, cy = size/2;
  const circ = 2*Math.PI*r;
  const dash = pct * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={SURF_HI} strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={GREEN} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ*0.25}
        strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 6px ${GREEN}66)`}}/>
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={GOLD} strokeWidth="10"
        strokeDasharray={`${circ-dash} ${circ}`}
        strokeDashoffset={-(dash - circ*0.25)}
        strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 6px ${GOLD}66)`}}/>
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fill={TEXT} fontSize="12" fontWeight="800">
        {Math.round(pct*100)}%
      </text>
      <text x={cx} y={cy+13} textAnchor="middle" dominantBaseline="middle" fill={FAINT} fontSize="7">автошк.</text>
    </svg>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export default function StatsView() {
  const [period, setPeriod]     = useState("month");
  const [chartType, setChartType] = useState("line");
  const [metric, setMetric]     = useState("income");

  // pick data set
  const data = period==="week" ? DATA_WEEK : period==="year" ? DATA_YEAR : DATA_MONTH;

  // totals
  const totalIncome  = data.reduce((s,d)=>s+d.income,0);
  const totalLessons = data.reduce((s,d)=>s+d.lessons,0);
  const totalSchool  = data.reduce((s,d)=>s+d.school,0);
  const totalPrivate = data.reduce((s,d)=>s+d.private,0);
  const totalNoshow  = data.reduce((s,d)=>s+(d.noshow||0),0);
  const totalCancel  = data.reduce((s,d)=>s+(d.cancel||0),0);
  const avgCheck     = totalLessons ? Math.round(totalIncome/totalLessons) : 0;
  const noshowPct    = totalLessons ? Math.round((totalNoshow/totalLessons)*100) : 0;
  const cancelPct    = totalLessons ? Math.round((totalCancel/totalLessons)*100) : 0;

  const METRICS = [
    {id:"income",  label:"Дохід ₴",  color:GOLD},
    {id:"lessons", label:"Уроки",    color:BLUE},
    {id:"school",  label:"Автошкола",color:GREEN},
    {id:"private", label:"Приватні", color:PURPLE},
  ];
  const curMetric = METRICS.find(m=>m.id===metric);

  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",gap:12,fontFamily:"ui-sans-serif,-apple-system,system-ui,sans-serif",color:TEXT}}>

        {/* ── PERIOD SELECTOR ── */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {PERIODS.map(p=>(
            <button key={p.id} onClick={()=>setPeriod(p.id)} style={{
              padding:"7px 14px",borderRadius:12,border:"none",cursor:"pointer",
              fontSize:12,fontWeight:700,flexShrink:0,
              background:period===p.id?`linear-gradient(165deg,${ACC_HI},${ACCENT})`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
              color:period===p.id?"#fff":DIM,
              boxShadow:period===p.id?`-2px 4px 10px rgba(255,90,60,0.35),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO
            }}>{p.label}</button>
          ))}
        </div>

        {/* ── KPI CARDS 2×2 ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <KpiCard label="Дохід" value={fmtK(totalIncome)} sub="за період" color={GOLD} trend={12}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round"><path d="M12 2v20M16 6h-6a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8"/></svg>}/>
          <KpiCard label="Уроків" value={totalLessons} sub={`${totalSchool} авт · ${totalPrivate} прив`} color={BLUE} trend={8}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>}/>
          <KpiCard label="Середній чек" value={fmtK(avgCheck)} sub="дохід / урок" color={GREEN} trend={3}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="22" y1="20" x2="2" y2="20"/></svg>}/>
          <KpiCard label="No-show" value={`${noshowPct}%`} sub={`Скасувань: ${cancelPct}%`} color={noshowPct>5?RED:DIM} trend={-2}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}/>
        </div>

        {/* ── MAIN CHART ── */}
        <div className="pillow" style={{padding:"16px"}}>
          {/* chart header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:13,fontWeight:800,color:TEXT}}>Динаміка</div>
            <div style={{display:"flex",gap:6}}>
              {/* metric selector */}
              <div style={{display:"flex",gap:4}}>
                {METRICS.map(m=>(
                  <button key={m.id} onClick={()=>setMetric(m.id)} style={{
                    padding:"4px 8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                    background:metric===m.id?`linear-gradient(165deg,${m.color}99,${m.color}44)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                    color:metric===m.id?m.color:FAINT,boxShadow:SO
                  }}>{m.label}</button>
                ))}
              </div>
              {/* chart type */}
              <button onClick={()=>setChartType(t=>t==="line"?"bar":"line")} style={{
                padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,color:DIM,boxShadow:SO
              }}>{chartType==="line"?"📊":"📈"}</button>
            </div>
          </div>

          {/* chart */}
          <Inset style={{padding:"12px 10px 4px"}}>
            {chartType==="line"
              ? <LineChart data={data} valueKey={metric} color={curMetric.color} height={130}/>
              : <BarChart  data={data} valueKey={metric} color={curMetric.color} height={130}/>
            }
          </Inset>

          {/* legend */}
          <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap",justifyContent:"center"}}>
            {METRICS.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>setMetric(m.id)}>
                <div style={{width:8,height:8,borderRadius:4,background:m.color,boxShadow:`0 0 6px ${m.color}88`,
                  transform:metric===m.id?"scale(1.4)":"scale(1)",transition:"transform .15s"}}/>
                <span style={{fontSize:10,color:metric===m.id?m.color:FAINT,fontWeight:700}}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── SPLIT ROW: розподіл + навантаження ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>

          {/* розподіл авто/приват */}
          <div className="pillow" style={{padding:"14px"}}>
            <div style={{fontSize:11,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Розподіл</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <DonutChart school={totalSchool} total={totalSchool+totalPrivate}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                  <div style={{width:8,height:8,borderRadius:4,background:GREEN}}/>
                  <span style={{fontSize:11,color:DIM}}>Автошкола</span>
                  <span style={{fontSize:12,fontWeight:800,color:GREEN,marginLeft:"auto"}}>{totalSchool}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,borderRadius:4,background:GOLD}}/>
                  <span style={{fontSize:11,color:DIM}}>Приватний</span>
                  <span style={{fontSize:12,fontWeight:800,color:GOLD,marginLeft:"auto"}}>{totalPrivate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* навантаження по днях */}
          <div className="pillow" style={{padding:"14px"}}>
            <div style={{fontSize:11,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Завантаж. по днях</div>
            {DATA_WEEK.map((d,i)=>{
              const pct = d.lessons/Math.max(...DATA_WEEK.map(x=>x.lessons));
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:9,color:FAINT,fontWeight:700,width:18,textAlign:"right"}}>{d.label}</span>
                  <div style={{flex:1,height:6,background:`linear-gradient(135deg,${BG_DEEP},${SURF_HI})`,borderRadius:4,boxShadow:SI,overflow:"hidden"}}>
                    <div style={{
                      height:"100%",width:`${pct*100}%`,borderRadius:4,
                      background:`linear-gradient(90deg,${BLUE},${PURPLE})`,
                      boxShadow:`0 0 6px ${BLUE}55`,
                      transition:"width .5s ease"
                    }}/>
                  </div>
                  <span style={{fontSize:9,color:DIM,fontWeight:700,width:12}}>{d.lessons}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TOP-5 УЧНІВ ── */}
        <div className="pillow" style={{padding:"14px 14px 6px"}}>
          <div style={{fontSize:11,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Топ-5 учнів</div>
          {TOP_STUDENTS.map((s,i)=>{
            const maxH = TOP_STUDENTS[0].hours;
            const maxP = TOP_STUDENTS.reduce((m,x)=>Math.max(m,x.paid),0);
            return (
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"10px 0",
                borderBottom:i<TOP_STUDENTS.length-1?`1px solid ${BORDER}`:"none"
              }}>
                {/* rank */}
                <div style={{
                  width:26,height:26,borderRadius:8,flexShrink:0,
                  background:i===0?`linear-gradient(165deg,${GOLD},#d97706)`:i===1?`linear-gradient(165deg,#94a3b8,#475569)`:i===2?`linear-gradient(165deg,#fb923c,#c2410c)`:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:900,color:"#fff",
                  boxShadow:i<3?`-1px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.3)`:SO
                }}>{i+1}</div>

                {/* avatar */}
                <div style={{
                  width:36,height:36,borderRadius:10,flexShrink:0,
                  background:`linear-gradient(165deg,hsl(${s.hue},60%,45%),hsl(${s.hue+30},70%,30%))`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:800,color:"#fff",
                  boxShadow:`-1px 3px 8px rgba(0,0,0,0.4),inset 1px 1px 0 rgba(255,255,255,0.2)`
                }}>{s.name.split(" ").map(w=>w[0]).join("")}</div>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:TEXT,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                  {/* hours bar */}
                  <div style={{height:4,background:`linear-gradient(135deg,${BG_DEEP},${SURF_HI})`,borderRadius:3,boxShadow:SI,overflow:"hidden"}}>
                    <div style={{
                      height:"100%",width:`${(s.hours/maxH)*100}%`,borderRadius:3,
                      background:s.type==="school"?`linear-gradient(90deg,${BLUE},${GREEN})`:`linear-gradient(90deg,${PURPLE},${GOLD})`
                    }}/>
                  </div>
                </div>

                <div style={{flexShrink:0,textAlign:"right"}}>
                  <div style={{fontSize:12,fontWeight:800,color:GOLD}}>{(s.paid/1000).toFixed(1)}к ₴</div>
                  <div style={{fontSize:10,color:DIM}}>{s.hours} год</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── EXPORT ── */}
        <div className="pillow" style={{padding:"14px"}}>
          <div style={{fontSize:11,color:FAINT,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Експорт звіту</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {label:"Excel",  emoji:"📊", color:GREEN,  sub:"статистика"},
              {label:"PDF",    emoji:"📄", color:RED,    sub:"для податкової"},
              {label:"Share",  emoji:"↗️", color:BLUE,   sub:"поділитись"},
            ].map(e=>(
              <button key={e.label} style={{
                padding:"12px 8px",borderRadius:14,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${SURF_HI},${SURFACE})`,
                display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                boxShadow:SO
              }}>
                <div className="i3" style={{width:36,height:36,background:`linear-gradient(165deg,${e.color}99,${e.color}33)`}}>
                  <span style={{fontSize:18,position:"relative",zIndex:1}}>{e.emoji}</span>
                </div>
                <span style={{fontSize:12,fontWeight:800,color:e.color}}>{e.label}</span>
                <span style={{fontSize:10,color:FAINT}}>{e.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{height:8}}/>
      </div>
    </>
  );
}
