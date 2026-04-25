import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── TOKENS ──────────────────────────────────────────────────────────────────
const C = {
  bg:"#090b0f", surface:"#111318", surface2:"#1a1d24", border:"#222530",
  text:"#e8e4d8", muted:"#9ca3af", dim:"#6b7280", dark:"#374151",
  accent:"#f59e0b", accentBg:"rgba(245,158,11,0.15)", accentBorder:"rgba(245,158,11,0.25)",
  green:"#22c55e", red:"#ef4444", pink:"#ff5277", away:"#f59e0b",
  font:"'JetBrains Mono',monospace", display:"'Syne',sans-serif",
};
const statusColor = u => u.online ? (u.away ? C.away : C.green) : C.dark;
const pad = n => String(n).padStart(2,"0");
const ts = () => { const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const PROFILE_KEY = "he_my_profile_v1";
const LIKED_KEY   = "he_liked_v1";
const GHOST_KEY   = "he_ghost_v1";

const persist = {
  load: (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  save: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const VIDS = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://www.w3schools.com/html/movie.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
];

const USERS = [
  { id:1,  name:"DaddyDeep",      age:38, role:"Top",      bio:"Experienced. Patient. Here for a good time.", tags:["top","dom","hosted"],     avatar:"😈", online:true,  away:false, dist:"45m",  color:"#ef4444", photos:3, lastSeen:"now", profileVideo:VIDS[0] },
  { id:2,  name:"BottomlessJay",  age:26, role:"Bottom",   bio:"Hungry 24/7. No time wasters.",               tags:["bottom","young","now"],   avatar:"🍑", online:true,  away:false, dist:"120m", color:"#8b5cf6", photos:5, lastSeen:"now", profileVideo:null },
  { id:3,  name:"VersKing",       age:33, role:"Vers",     bio:"Switch hitter. Love a good connection.",       tags:["vers","fit","discreet"],  avatar:"👑", online:true,  away:true,  dist:"200m", color:"#3b82f6", photos:2, lastSeen:"5m",  profileVideo:VIDS[1] },
  { id:4,  name:"HungryMike",     age:41, role:"Top",      bio:"Big energy. Loves giving. No drama.",         tags:["top","thick","generous"], avatar:"🔥", online:true,  away:false, dist:"80m",  color:"#f97316", photos:4, lastSeen:"now", profileVideo:null },
  { id:5,  name:"AssConnoisseur", age:29, role:"Top",      bio:"Quality over quantity.",                       tags:["top","selective","clean"],avatar:"🎯", online:false, away:false, dist:"310m", color:"#10b981", photos:1, lastSeen:"2h",  profileVideo:null },
  { id:6,  name:"NightCrawler",   age:35, role:"Bottom",   bio:"Night owl. Best after midnight.",             tags:["bottom","late","hosted"], avatar:"🌙", online:true,  away:false, dist:"55m",  color:"#6366f1", photos:6, lastSeen:"now", profileVideo:VIDS[2] },
  { id:7,  name:"OpenMouth99",    age:24, role:"Oral",     bio:"Worship game on point. Enthusiastic.",         tags:["oral","eager","young"],   avatar:"👅", online:true,  away:true,  dist:"90m",  color:"#ec4899", photos:2, lastSeen:"12m", profileVideo:null },
  { id:8,  name:"BearDaddy",      age:52, role:"Top/Bear", bio:"Big. Hairy. Warm. Good hands.",               tags:["bear","daddy","hairy"],   avatar:"🐻", online:true,  away:false, dist:"170m", color:"#a855f7", photos:3, lastSeen:"now", profileVideo:null },
  { id:9,  name:"ChubChaser",     age:31, role:"Chaser",   bio:"Love a bigger guy. No discrimination.",        tags:["chaser","open","chill"],  avatar:"💪", online:false, away:false, dist:"400m", color:"#14b8a6", photos:0, lastSeen:"1d",  profileVideo:null },
  { id:10, name:"QuickStop",      age:27, role:"Vers",     bio:"In the area for 20 mins. No BS.",             tags:["vers","quick","mobile"],  avatar:"⚡", online:true,  away:false, dist:"30m",  color:"#eab308", photos:2, lastSeen:"now", profileVideo:null },
  { id:11, name:"SlowBurn_",      age:44, role:"Vers Top", bio:"I like taking my time. Edging pro.",          tags:["vers","edging","patient"],avatar:"🕯️", online:true,  away:false, dist:"150m", color:"#f43f5e", photos:4, lastSeen:"now", profileVideo:VIDS[0] },
  { id:12, name:"RimJobRonnie",   age:36, role:"Oral",     bio:"Face first. No apologies. Grade A.",          tags:["oral","rim","skilled"],   avatar:"😛", online:false, away:false, dist:"280m", color:"#0ea5e9", photos:1, lastSeen:"3h",  profileVideo:null },
];

const ME_DEFAULT = { name:"", age:"", role:"Vers", bio:"", tags:["vers","clean","discreet"], avatar:"😏", online:true, away:false, color:"#f59e0b", lookingFor:"hookup", safeOnly:true, profileVideo:null, isSetup:false };
const ROLES = ["Top","Bottom","Vers","Oral","Bear","Chaser","Host"];
const LOOKING = ["hookup","oral only","group","dates","curious","anything"];
const AVATARS = ["😏","😈","🍑","👑","🔥","🎯","🌙","👅","🐻","💪","⚡","🕯️","😛","🦊","🐺","💦","🫦"];
const COLORS_OPT = ["#f59e0b","#ef4444","#8b5cf6","#3b82f6","#f97316","#10b981","#6366f1","#ec4899","#a855f7","#14b8a6","#eab308","#f43f5e","#0ea5e9"];
const CRUISING_STATUSES = ["Hosting now 🏠","In my car 🚗","Come find me 👀","Door's unlocked 🚪","Need it bad 💦","Cruising the park 🌲","Glory hole open 🕳","Group happening now 🔥","Wired and ready ⚡"];
const FILTERS = ["All","Online","Top","Bottom","Vers","Oral","Bear","Hosting","<100m"];
const REPLIES = ["👀 hey","Sounds good","Where are you?","Host or travel?","Pic?","What are you into?","Be there in 10","Send location","Discreet?","Let's do it","🔥🔥🔥","You close?","Come over","Nice 👀"];

const _mb = ["pk.eyJ1IjoiY2xvdWR5LW1lYXQiLCJhI","joiY21sbHJpNG5xMGIzYzNkb2JubWNkbTgybyJ9",".PXUMyR2_uAiDEAGrXsPQUg"];
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || _mb.join("");
const DEFAULT_CENTER = [-74.006, 40.7128];
const USER_OFFSETS = [[0,0],[0.003,0.002],[-.002,0.003],[0.005,-0.002],[-0.004,0.004],[0.006,0.005],[-0.003,-0.002],[0.007,0.001],[-0.002,0.006],[0.004,-0.004],[-0.005,0.003],[0.008,-0.003],[-0.003,-0.005]];

const filterUsers = (users, f) => {
  if(f==="All") return users;
  if(f==="Online") return users.filter(u=>u.online);
  if(f==="<100m") return users.filter(u=>parseInt(u.dist)<100);
  if(f==="Hosting") return users.filter(u=>u.tags.includes("hosted"));
  return users.filter(u=>u.tags.some(t=>t.toLowerCase().includes(f.toLowerCase()))||u.role.toLowerCase().includes(f.toLowerCase()));
};
const vibeScore = (me, them) => {
  const s = (me.tags||[]).filter(t=>(them.tags||[]).includes(t)).length;
  const c = (me.role==="Vers"||them.role==="Vers")?1:(me.role==="Top"&&them.role.includes("Bottom"))?1:(me.role==="Bottom"&&them.role.includes("Top"))?1:0;
  return Math.min(99,Math.round(s*18+c*35+Math.random()*20));
};

// ─── KEYFRAMES ────────────────────────────────────────────────────────────────
const KF = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}
@keyframes pulse{0%{transform:translate(-50%,-50%) scale(0.9);opacity:.7}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes notifSlide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes typing{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
@keyframes glow{0%,100%{box-shadow:0 0 8px rgba(245,158,11,.3)}50%{box-shadow:0 0 20px rgba(245,158,11,.6)}}
@keyframes vidRing{0%,100%{box-shadow:0 0 0 2px rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 2px rgba(239,68,68,0.9),0 0 12px rgba(239,68,68,0.5)}}
@keyframes badgePop{0%{transform:translateX(-50%) scale(0.7);opacity:0}60%{transform:translateX(-50%) scale(1.05)}100%{transform:translateX(-50%) scale(1);opacity:1}}
@keyframes pingRing{0%{opacity:0.8;transform:scale(1)}100%{opacity:0;transform:scale(2.2)}}
@keyframes radarSweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes savePop{0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
.mapboxgl-ctrl-bottom-left,.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-attrib{display:none!important}
.mapboxgl-ctrl-group{background:rgba(13,15,20,0.92)!important;border:1px solid #222530!important;border-radius:6px!important}
.mapboxgl-ctrl-group button{color:#e8e4d8!important}
.mapboxgl-ctrl-group button+button{border-top:1px solid #222530!important}
`;

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function ButtIcon({ size=20, color="#f59e0b" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{display:"inline-block",verticalAlign:"middle"}}>
      <g transform="translate(50,50)">
        <ellipse cx="-14" cy="2" rx="22" ry="28" fill={color} opacity="0.9"/>
        <ellipse cx="14" cy="2" rx="22" ry="28" fill={color} opacity="0.9"/>
        <path d="M0,-26 Q-3,0 0,30" stroke="#090b0f" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M-24,-18 Q-12,-28 0,-26 Q12,-28 24,-18" stroke={color} strokeWidth="2.5" fill="none"/>
        <ellipse cx="-16" cy="-6" rx="6" ry="9" fill="#fbbf24" opacity="0.25"/>
        <ellipse cx="16" cy="-6" rx="6" ry="9" fill="#fbbf24" opacity="0.25"/>
      </g>
    </svg>
  );
}

function VideoAvatar({ user, size=38, borderRadius="50%", borderColor, showStatus=true, fontSize }) {
  const vRef = useRef(null);
  const hasVideo = !!user.profileVideo;
  const fs = fontSize || Math.round(size * 0.47);
  useEffect(() => { if (hasVideo && vRef.current) vRef.current.play().catch(() => {}); }, [hasVideo, user.profileVideo]);
  return (
    <div style={{ width:size, height:size, borderRadius, overflow:"hidden", position:"relative", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:hasVideo?"#000":(user.color||C.accent)+"22", border:borderColor?`2px solid ${borderColor}`:undefined, ...(hasVideo?{animation:"vidRing 2s ease infinite"}:{}) }}>
      {hasVideo
        ? <video ref={vRef} src={user.profileVideo} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        : <span style={{fontSize:fs}}>{user.avatar}</span>
      }
      {hasVideo && <div style={{position:"absolute",bottom:2,left:2,width:10,height:7,borderRadius:2,background:C.red,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:5,color:"#fff",fontWeight:700}}>▶</span></div>}
      {showStatus && <div style={{position:"absolute",bottom:0,right:0,width:size>50?14:9,height:size>50?14:9,borderRadius:"50%",background:statusColor(user),border:`${size>50?2:1.5}px solid ${size>50?C.surface:C.bg}`}}/>}
    </div>
  );
}

// ─── PROFILE SETUP (ONBOARDING) ───────────────────────────────────────────────
function ProfileSetup({ onSave }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...ME_DEFAULT });
  const [saving, setSaving] = useState(false);
  const vidRef = useRef(null);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const ageNum = parseInt(form.age, 10);
  const ageValid = !isNaN(ageNum) && ageNum >= 18 && ageNum <= 99;
  const nameValid = form.name.trim().length >= 2;
  const canNext = nameValid && ageValid;

  const handleVid = e => {
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader(); r.onload = () => set("profileVideo", r.result); r.readAsDataURL(f);
    e.target.value = "";
  };
  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      const profile = { ...form, isSetup:true };
      persist.save(PROFILE_KEY, profile);
      onSave(profile);
    }, 500);
  };

  const fieldStyle = { width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontFamily:C.font, fontSize:12, padding:"10px 12px", outline:"none", boxSizing:"border-box" };
  const labelStyle = { fontSize:9, color:C.dim, letterSpacing:"0.1em", fontFamily:C.font, marginBottom:5, display:"block" };

  return (
    <div style={{position:"fixed",inset:0,background:C.bg,zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:C.display,padding:24,overflowY:"auto"}}>
      <style>{KF}</style>
      {/* Progress */}
      <div style={{display:"flex",gap:6,marginBottom:32}}>
        {[0,1,2].map(i=><div key={i} style={{width:step===i?24:8,height:8,borderRadius:4,background:step>=i?C.accent:C.border,transition:"all 0.3s"}}/>)}
      </div>

      <div style={{width:"100%",maxWidth:380}}>

        {/* STEP 0 — Welcome */}
        {step===0 && (
          <div style={{textAlign:"center",display:"flex",flexDirection:"column",gap:20,alignItems:"center"}}>
            <div style={{fontSize:64}}><ButtIcon size={72}/></div>
            <div style={{fontWeight:800,fontSize:24,color:C.accent,letterSpacing:1}}>THE HOLE EATERS</div>
            <div style={{fontSize:13,color:C.dim,lineHeight:1.7,maxWidth:260}}>Location-based. Anonymous. Adults only.<br/>Find what you're looking for.</div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",fontSize:11,color:C.muted,textAlign:"left",lineHeight:1.8}}>
              ⚠️ Adults 18+ only<br/>📍 Location is approximate<br/>👤 No real names required
            </div>
            <button style={{padding:"12px 32px",background:C.accentBg,border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:13,fontWeight:600,width:"100%"}} onClick={()=>setStep(1)}>
              I'm 18+ — Create Profile →
            </button>
          </div>
        )}

        {/* STEP 1 — Basics */}
        {step===1 && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:800,fontSize:20,color:C.text}}>The basics</div>

            {/* Avatar picker */}
            <div style={{display:"flex",gap:10,alignItems:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:12}}>
              <div style={{width:56,height:56,borderRadius:12,background:`${form.color}22`,border:`2px solid ${form.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
                {form.profileVideo
                  ? <video src={form.profileVideo} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:10}}/>
                  : form.avatar
                }
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                  {AVATARS.map(a=><span key={a} onClick={()=>set("avatar",a)} style={{fontSize:18,cursor:"pointer",padding:3,borderRadius:6,border:`2px solid ${form.avatar===a?C.accent:"transparent"}`}}>{a}</span>)}
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {COLORS_OPT.map(c=><div key={c} onClick={()=>set("color",c)} style={{width:18,height:18,borderRadius:"50%",background:c,cursor:"pointer",border:`2px solid ${form.color===c?"#fff":"transparent"}`}}/>)}
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>HANDLE (shown to others)</label>
              <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. AnonymousDog" maxLength={24} style={fieldStyle}/>
              {form.name.trim().length>0 && form.name.trim().length<2 && <div style={{fontSize:10,color:C.red,marginTop:4,fontFamily:C.font}}>At least 2 characters</div>}
            </div>

            <div>
              <label style={labelStyle}>AGE (must be 18+)</label>
              <input value={form.age} onChange={e=>set("age",e.target.value.replace(/\D/g,"").slice(0,2))} placeholder="25" maxLength={2} style={fieldStyle}/>
              {form.age.length>0 && !ageValid && <div style={{fontSize:10,color:C.red,marginTop:4,fontFamily:C.font}}>Must be 18–99</div>}
            </div>

            <div>
              <label style={labelStyle}>ROLE</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {ROLES.map(r=><button key={r} onClick={()=>set("role",r)} style={{padding:"5px 14px",borderRadius:20,fontSize:11,fontFamily:C.font,border:`1px solid ${form.role===r?C.accent:C.border}`,background:form.role===r?C.accentBg:"transparent",color:form.role===r?C.accent:C.dim,cursor:"pointer"}}>{r}</button>)}
              </div>
            </div>

            {/* Video profile upload */}
            <div>
              <label style={labelStyle}>PROFILE VIDEO (optional)</label>
              <input ref={vidRef} type="file" accept="video/*" style={{display:"none"}} onChange={handleVid}/>
              {form.profileVideo
                ? <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <video src={form.profileVideo} autoPlay loop muted playsInline style={{width:60,height:60,borderRadius:8,objectFit:"cover",border:`1px solid ${C.border}`}}/>
                    <div>
                      <div style={{fontSize:11,color:C.green,fontFamily:C.font}}>✓ Video set</div>
                      <button onClick={()=>set("profileVideo",null)} style={{background:"none",border:"none",color:C.dim,fontSize:10,fontFamily:C.font,cursor:"pointer",padding:0,marginTop:4}}>Remove</button>
                    </div>
                  </div>
                : <button onClick={()=>vidRef.current?.click()} style={{padding:"8px 16px",background:C.surface2,border:`1px dashed ${C.border}`,color:C.dim,borderRadius:8,cursor:"pointer",fontFamily:C.font,fontSize:11,width:"100%"}}>📹 Upload video clip (loops on your pin)</button>
              }
            </div>

            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={()=>setStep(0)} style={{padding:"10px 20px",background:"transparent",border:`1px solid ${C.border}`,color:C.dim,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:12}}>← Back</button>
              <button onClick={()=>setStep(2)} disabled={!canNext} style={{flex:1,padding:"10px 0",background:canNext?C.accentBg:"transparent",border:`1px solid ${canNext?C.accent:C.border}`,color:canNext?C.accent:C.dim,borderRadius:10,cursor:canNext?"pointer":"not-allowed",fontFamily:C.font,fontSize:12,fontWeight:600,opacity:canNext?1:0.5}}>Next →</button>
            </div>
          </div>
        )}

        {/* STEP 2 — Vibe */}
        {step===2 && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:800,fontSize:20,color:C.text}}>Your vibe</div>

            <div>
              <label style={labelStyle}>BIO (optional)</label>
              <textarea value={form.bio} onChange={e=>set("bio",e.target.value)} placeholder="Keep it real..." maxLength={160} rows={3} style={{...fieldStyle,resize:"none"}}/>
            </div>

            <div>
              <label style={labelStyle}>LOOKING FOR</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {LOOKING.map(l=><button key={l} onClick={()=>set("lookingFor",l)} style={{padding:"5px 14px",borderRadius:20,fontSize:11,fontFamily:C.font,border:`1px solid ${form.lookingFor===l?C.accent:C.border}`,background:form.lookingFor===l?C.accentBg:"transparent",color:form.lookingFor===l?C.accent:C.dim,cursor:"pointer"}}>{l}</button>)}
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:10,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",cursor:"pointer"}} onClick={()=>set("safeOnly",!form.safeOnly)}>
              <div style={{width:20,height:20,borderRadius:4,background:form.safeOnly?C.green:"transparent",border:`2px solid ${form.safeOnly?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,transition:"all 0.15s"}}>{form.safeOnly?"✓":""}</div>
              <div>
                <div style={{fontSize:11,color:C.text,fontFamily:C.font}}>Safe sex only</div>
                <div style={{fontSize:10,color:C.dim,fontFamily:C.font}}>Shown on your profile</div>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={()=>setStep(1)} style={{padding:"10px 20px",background:"transparent",border:`1px solid ${C.border}`,color:C.dim,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:12}}>← Back</button>
              <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"10px 0",background:C.accentBg,border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:12,fontWeight:600}}>
                {saving?"Saving…":"Go Live 🔥"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROFILE EDITOR ───────────────────────────────────────────────────────────
function ProfileEditor({ profile, onSave, onClose }) {
  const [form, setForm] = useState({...profile});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const vidRef = useRef(null);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const handleVid = e => {
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader(); r.onload = () => set("profileVideo", r.result); r.readAsDataURL(f);
    e.target.value = "";
  };
  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      persist.save(PROFILE_KEY, form);
      setSaving(false); setSaved(true);
      onSave(form);
      setTimeout(() => setSaved(false), 2000);
    }, 400);
  };

  const fieldStyle = { width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontFamily:C.font, fontSize:12, padding:"10px 12px", outline:"none", boxSizing:"border-box" };
  const labelStyle = { fontSize:9, color:C.dim, letterSpacing:"0.1em", fontFamily:C.font, marginBottom:5, display:"block" };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:500,display:"flex",alignItems:"flex-end",backdropFilter:"blur(6px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:480,margin:"0 auto",background:C.surface,borderRadius:"16px 16px 0 0",padding:"20px 20px 32px",maxHeight:"92vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:C.display,fontWeight:800,fontSize:16,color:C.text}}>Edit Profile</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.dim,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {/* Avatar */}
        <div style={{display:"flex",gap:10,alignItems:"center",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,padding:12}}>
          <div style={{width:56,height:56,borderRadius:12,background:`${form.color}22`,border:`2px solid ${form.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,overflow:"hidden"}}>
            {form.profileVideo
              ? <video src={form.profileVideo} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : form.avatar
            }
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
              {AVATARS.map(a=><span key={a} onClick={()=>set("avatar",a)} style={{fontSize:16,cursor:"pointer",padding:2,borderRadius:5,border:`2px solid ${form.avatar===a?C.accent:"transparent"}`}}>{a}</span>)}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {COLORS_OPT.map(c=><div key={c} onClick={()=>set("color",c)} style={{width:16,height:16,borderRadius:"50%",background:c,cursor:"pointer",border:`2px solid ${form.color===c?"#fff":"transparent"}`}}/>)}
            </div>
          </div>
        </div>

        <div>
          <label style={labelStyle}>HANDLE</label>
          <input value={form.name} onChange={e=>set("name",e.target.value)} maxLength={24} style={fieldStyle}/>
        </div>
        <div>
          <label style={labelStyle}>AGE</label>
          <input value={String(form.age)} onChange={e=>set("age",e.target.value.replace(/\D/g,"").slice(0,2))} maxLength={2} style={fieldStyle}/>
        </div>
        <div>
          <label style={labelStyle}>BIO</label>
          <textarea value={form.bio} onChange={e=>set("bio",e.target.value)} maxLength={160} rows={3} style={{...fieldStyle,resize:"none"}}/>
        </div>
        <div>
          <label style={labelStyle}>ROLE</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {ROLES.map(r=><button key={r} onClick={()=>set("role",r)} style={{padding:"5px 14px",borderRadius:20,fontSize:11,fontFamily:C.font,border:`1px solid ${form.role===r?C.accent:C.border}`,background:form.role===r?C.accentBg:"transparent",color:form.role===r?C.accent:C.dim,cursor:"pointer"}}>{r}</button>)}
          </div>
        </div>
        <div>
          <label style={labelStyle}>LOOKING FOR</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {LOOKING.map(l=><button key={l} onClick={()=>set("lookingFor",l)} style={{padding:"5px 14px",borderRadius:20,fontSize:11,fontFamily:C.font,border:`1px solid ${form.lookingFor===l?C.accent:C.border}`,background:form.lookingFor===l?C.accentBg:"transparent",color:form.lookingFor===l?C.accent:C.dim,cursor:"pointer"}}>{l}</button>)}
          </div>
        </div>
        <div>
          <label style={labelStyle}>PROFILE VIDEO</label>
          <input ref={vidRef} type="file" accept="video/*" style={{display:"none"}} onChange={handleVid}/>
          {form.profileVideo
            ? <div style={{display:"flex",alignItems:"center",gap:10}}>
                <video src={form.profileVideo} autoPlay loop muted playsInline style={{width:60,height:60,borderRadius:8,objectFit:"cover",border:`1px solid ${C.border}`}}/>
                <div>
                  <div style={{fontSize:11,color:C.green,fontFamily:C.font}}>✓ Video set</div>
                  <button onClick={()=>set("profileVideo",null)} style={{background:"none",border:"none",color:C.dim,fontSize:10,fontFamily:C.font,cursor:"pointer",padding:0,marginTop:4}}>Remove</button>
                </div>
              </div>
            : <button onClick={()=>vidRef.current?.click()} style={{padding:"8px 16px",background:C.surface2,border:`1px dashed ${C.border}`,color:C.dim,borderRadius:8,cursor:"pointer",fontFamily:C.font,fontSize:11,width:"100%"}}>📹 Upload video clip</button>
          }
        </div>

        <button onClick={handleSave} disabled={saving||!form.name.trim()} style={{padding:"12px 0",background:saved?"rgba(34,197,94,0.15)":C.accentBg,border:`1px solid ${saved?C.green:C.accent}`,color:saved?C.green:C.accent,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:13,fontWeight:600,animation:saved?"savePop 0.3s ease":"none",transition:"all 0.2s"}}>
          {saving?"Saving…":saved?"✓ Saved!":"Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── CRUISING STATUS PICKER ───────────────────────────────────────────────────
function CruisingPicker({ current, onSet, onClear, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:600,display:"flex",alignItems:"flex-end",backdropFilter:"blur(6px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:480,margin:"0 auto",background:C.surface,borderRadius:"16px 16px 0 0",padding:"20px 20px 36px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <div>
            <div style={{fontFamily:C.display,fontWeight:800,fontSize:15,color:C.text}}>📡 Cruising Status</div>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.font,marginTop:2}}>Shown as badge on your pin · auto-clears in 30 min</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.dim,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        {current&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.accentBg,border:`1px solid ${C.accentBorder}`,borderRadius:10,padding:"10px 14px"}}><span style={{fontSize:12,color:C.accent,fontWeight:600}}>{current}</span><button onClick={()=>{onClear();onClose();}} style={{background:"none",border:"none",color:C.dim,fontSize:11,fontFamily:C.font,cursor:"pointer"}}>Clear</button></div>}
        {CRUISING_STATUSES.map(s=><button key={s} onClick={()=>{onSet(s);onClose();}} style={{textAlign:"left",padding:"11px 14px",background:current===s?C.accentBg:C.surface2,border:`1px solid ${current===s?C.accent:C.border}`,borderRadius:10,color:C.text,fontSize:12,fontFamily:"system-ui,sans-serif",cursor:"pointer",transition:"all 0.15s"}}>{s}</button>)}
      </div>
    </div>
  );
}

// ─── GROUP VIDEO ROOM ─────────────────────────────────────────────────────────
function VideoRoom({ me, targetUser, onClose }) {
  const localRef = useRef(null); const streamRef = useRef(null);
  const [muted,setMuted]=useState(false); const [camOff,setCamOff]=useState(false);
  const [elapsed,setElapsed]=useState(0); const [camErr,setCamErr]=useState(false);
  const remotes = targetUser ? [targetUser] : USERS.filter(u=>u.online&&!u.away).slice(0,3);

  useEffect(()=>{
    let live=true;
    navigator.mediaDevices?.getUserMedia({video:true,audio:true})
      .then(s=>{if(!live){s.getTracks().forEach(t=>t.stop());return;} streamRef.current=s; if(localRef.current){localRef.current.srcObject=s;localRef.current.play().catch(()=>{});}})
      .catch(()=>setCamErr(true));
    const iv=setInterval(()=>setElapsed(e=>e+1),1000);
    return()=>{live=false;clearInterval(iv);streamRef.current?.getTracks().forEach(t=>t.stop());};
  },[]);

  const fmt=s=>`${pad(Math.floor(s/60))}:${pad(s%60)}`;
  const toggleMic=()=>{streamRef.current?.getAudioTracks().forEach(t=>{t.enabled=muted;});setMuted(m=>!m);};
  const toggleCam=()=>{streamRef.current?.getVideoTracks().forEach(t=>{t.enabled=camOff;});setCamOff(c=>!c);};

  return (
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:800,display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <style>{KF}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted,fontFamily:C.font}}><span style={{width:8,height:8,borderRadius:"50%",background:C.red,display:"inline-block",animation:"glow 2s ease infinite"}}/>LIVE · {remotes.length+1} in room</div>
        <div style={{fontSize:12,color:C.dim,fontFamily:C.font}}>{fmt(elapsed)}</div>
        <button style={{padding:"6px 14px",background:"rgba(239,68,68,0.15)",border:`1px solid ${C.red}`,color:C.red,borderRadius:6,cursor:"pointer",fontFamily:C.font,fontSize:11}} onClick={onClose}>Leave</button>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:4,padding:4}}>
        <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:C.surface,minHeight:140}}>
          {camErr||camOff
            ? <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:36}}>{me?.avatar||"😏"}</span>{camErr&&<span style={{fontSize:10,color:C.dim,marginTop:6,textAlign:"center",padding:"0 12px"}}>Camera unavailable</span>}</div>
            : <video ref={localRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
          }
          <div style={{position:"absolute",bottom:6,left:8,fontSize:10,color:"#fff",background:"rgba(9,11,15,0.7)",padding:"2px 8px",borderRadius:4}}>{me?.name||"You"} {muted?"🔇":""}</div>
        </div>
        {remotes.map((u,i)=>(
          <div key={i} style={{position:"relative",borderRadius:10,overflow:"hidden",background:"#0d0d0d",display:"flex",alignItems:"center",justifyContent:"center",minHeight:140}}>
            <div style={{width:64,height:64,borderRadius:"50%",background:`${u.color}22`,border:`2px solid ${u.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30}}>{u.avatar}</div>
            <div style={{position:"absolute",bottom:6,left:8,fontSize:10,color:"#fff",background:"rgba(9,11,15,0.7)",padding:"2px 8px",borderRadius:4}}>{u.name}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:16,padding:"16px",background:"rgba(0,0,0,0.8)"}}>
        {[
          {icon:muted?"🔇":"🎤",label:muted?"Unmute":"Mute",fn:toggleMic,active:muted},
          {icon:camOff?"📵":"📷",label:camOff?"Cam On":"Cam Off",fn:toggleCam,active:camOff},
          {icon:"📞",label:"End",fn:onClose,red:true},
        ].map(b=>(
          <button key={b.label} onClick={b.fn} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:b.red?"#cc2244":b.active?"rgba(239,68,68,0.15)":"rgba(255,255,255,0.1)",border:b.active||b.red?`1px solid ${C.red}`:"none",borderRadius:12,padding:"10px 18px",color:"#fff",cursor:"pointer",fontSize:11,fontFamily:C.font}}>
            <span style={{fontSize:22}}>{b.icon}</span>{b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // Persisted state
  const [me,           setMe]           = useState(()=>persist.load(PROFILE_KEY, ME_DEFAULT));
  const [liked,        setLiked]        = useState(()=>persist.load(LIKED_KEY, []));
  const [ghostMode,    setGhostMode]    = useState(()=>persist.load(GHOST_KEY, false));

  // UI state
  const [boarded,      setBoarded]      = useState(false);
  const [tab,          setTab]          = useState("map");
  const [filter,       setFilter]       = useState("All");
  const [selected,     setSelected]     = useState(null);
  const [drawerTab,    setDrawerTab]    = useState("Profile");
  const [showMyProfile,setShowMyProfile]= useState(false);
  const [showEditor,   setShowEditor]   = useState(false);
  const [showCruising, setShowCruising] = useState(false);
  const [videoRoom,    setVideoRoom]    = useState(null);
  const [cruisingStatus,setCruisingStatus]=useState(null);
  const [notif,        setNotif]        = useState(null);
  const [toast,        setToast]        = useState(null);
  const [radarPulse,   setRadarPulse]   = useState(0);
  const [aiOpeners,    setAiOpeners]    = useState({});
  const [msgs,         setMsgs]         = useState([]);
  const [chatMsg,      setChatMsg]      = useState("");
  const [typing,       setTyping]       = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [userLoc,      setUserLoc]      = useState(null);
  // My pin drag
  const [myPinPos,     setMyPinPos]     = useState({x:50,y:52});

  const mapContainer = useRef(null); const mapRef = useRef(null); const markersRef = useRef([]);
  const chatEnd = useRef(null); const fileRef = useRef(null);
  const needsSetup = !me?.isSetup;

  const showToast = useCallback((text, col=C.accent)=>{ setToast({text,col}); setTimeout(()=>setToast(null),2800); },[]);

  // Persist liked + ghost changes
  useEffect(()=>{ persist.save(LIKED_KEY, liked); },[liked]);
  useEffect(()=>{ persist.save(GHOST_KEY, ghostMode); },[ghostMode]);

  // Profile save handler
  const handleProfileSave = useCallback(profile=>{
    setMe(profile);
    persist.save(PROFILE_KEY, profile);
    setShowEditor(false);
    showToast("Profile saved ✓", C.green);
  },[showToast]);

  const handleReset = ()=>{ if(confirm("Reset your profile? Cannot be undone.")){ localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(LIKED_KEY); localStorage.removeItem(GHOST_KEY); setMe(ME_DEFAULT); setLiked([]); setGhostMode(false); setShowMyProfile(false); } };

  // GPS
  useEffect(()=>{
    if(!boarded) return;
    if(!navigator.geolocation){setUserLoc(DEFAULT_CENTER);return;}
    navigator.geolocation.getCurrentPosition(p=>setUserLoc([p.coords.longitude,p.coords.latitude]),()=>setUserLoc(DEFAULT_CENTER),{enableHighAccuracy:true,timeout:10000});
  },[boarded]);

  // Notifications
  useEffect(()=>{
    if(!boarded) return;
    const iv=setInterval(()=>{const u=USERS[Math.floor(Math.random()*USERS.length)];if(u.online){const m=[`${u.name} just went online`,`${u.name} is nearby (${u.dist})`,`${u.name} viewed your profile`,`${u.name} liked you`];setNotif({text:m[Math.floor(Math.random()*m.length)],icon:u.avatar});setTimeout(()=>setNotif(null),3000);}},14000+Math.random()*8000);
    return()=>clearInterval(iv);
  },[boarded]);

  // Radar pulse
  useEffect(()=>{
    if(tab!=="radar"||!boarded) return;
    const iv=setInterval(()=>setRadarPulse(p=>(p+1)%360),50);
    return()=>clearInterval(iv);
  },[tab,boarded]);

  // Mapbox
  const filtered = filterUsers(USERS, filter);
  useEffect(()=>{
    if(!boarded||tab!=="map"||!mapContainer.current||!userLoc) return;
    if(mapRef.current){ mapRef.current.resize(); rebuildMarkers(mapRef.current,userLoc,filtered,me,setSelected,setMsgs,setDrawerTab); return; }
    mapboxgl.accessToken=MAPBOX_TOKEN;
    const map=new mapboxgl.Map({container:mapContainer.current,style:"mapbox://styles/mapbox/dark-v11",center:userLoc,zoom:15,pitch:20,attributionControl:false});
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}),"bottom-right");
    const geo=new mapboxgl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true,showUserHeading:true});
    map.addControl(geo,"bottom-right");
    mapRef.current=map;
    map.on("load",()=>{ geo.trigger(); rebuildMarkers(map,userLoc,filtered,me,setSelected,setMsgs,setDrawerTab); });
    return()=>{};
  },[boarded,tab,userLoc,me?.avatar,filtered.length]);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[msgs,typing]);

  const sendMsg=()=>{
    if(!chatMsg.trim()&&!mediaPreview) return;
    setMsgs(p=>[...p,{from:"me",text:chatMsg.trim(),t:ts(),...(mediaPreview?{media:mediaPreview}:{})}]);
    setChatMsg(""); setMediaPreview(null); setTyping(true);
    setTimeout(()=>{ setTyping(false); setMsgs(p=>[...p,{from:"them",text:REPLIES[Math.floor(Math.random()*REPLIES.length)],t:ts()}]); },900+Math.random()*1000);
  };
  const handleFile=e=>{ const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setMediaPreview({type:f.type.startsWith("video")?"video":"image",url:r.result,name:f.name});r.readAsDataURL(f);e.target.value=""; };

  const generateOpener=(user)=>{
    const opts=[`${user.role} at ${user.dist} away? That's not an accident.`,`Your bio says "${user.bio.slice(0,22)}…" — I want to hear the full version.`,`I have a theory about ${user.name.slice(0,4)}s. Want to help me test it?`,`${user.dist} away and online right now. The math checks out.`,`Your vibe score with me is ${vibeScore(me||ME_DEFAULT,user)}%. The algorithm doesn't lie.`,`Into #${user.tags[0]}? That's exactly what I'm looking for tonight.`];
    setAiOpeners(p=>({...p,[user.id]:opts[Math.floor(Math.random()*opts.length)]}));
  };

  const heatHours=[{h:"6P",v:20},{h:"7P",v:35},{h:"8P",v:45},{h:"9P",v:65},{h:"10P",v:80},{h:"11P",v:95},{h:"12A",v:100},{h:"1A",v:90},{h:"2A",v:70},{h:"3A",v:45},{h:"4A",v:20},{h:"5A",v:8}];

  // Draggable my pin
  const mapDragRef = useRef({dragging:false,ox:0,oy:0,px:0,py:0});
  const handlePinDown=(e)=>{
    e.preventDefault(); e.stopPropagation();
    const map=mapContainer.current; if(!map) return;
    const r=map.getBoundingClientRect();
    mapDragRef.current={dragging:true,ox:e.clientX,oy:e.clientY,px:myPinPos.x,py:myPinPos.y,rw:r.width,rh:r.height};
    window.addEventListener("pointermove",handlePinMove);
    window.addEventListener("pointerup",handlePinUp);
  };
  const handlePinMove=useCallback((e)=>{
    const d=mapDragRef.current; if(!d.dragging) return;
    const nx=Math.max(4,Math.min(96,d.px+((e.clientX-d.ox)/d.rw)*100));
    const ny=Math.max(4,Math.min(96,d.py+((e.clientY-d.oy)/d.rh)*100));
    setMyPinPos({x:nx,y:ny});
  },[]);
  const handlePinUp=useCallback(()=>{ mapDragRef.current.dragging=false; window.removeEventListener("pointermove",handlePinMove); window.removeEventListener("pointerup",handlePinUp); },[handlePinMove]);

  const vibe = selected ? vibeScore(me||ME_DEFAULT,selected) : 0;

  // ── ONBOARDING GATE ──────────────────────────────────────────────────────────
  if(!boarded) {
    return (
      <div style={{...S.root,alignItems:"center",justifyContent:"center"}}>
        <style>{KF}</style>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"36px 28px",textAlign:"center",maxWidth:320,width:"90%"}}>
          <div style={{fontSize:48,marginBottom:16}}><ButtIcon size={64}/></div>
          <div style={{fontFamily:C.display,fontWeight:800,fontSize:22,color:C.accent,marginBottom:8}}>THE HOLE EATERS</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:20,fontFamily:C.font}}>Location-based. Anonymous. Adults only.</div>
          <div style={{height:1,background:C.border,margin:"0 0 20px"}}/>
          <div style={{fontSize:14,color:C.text,fontWeight:500,marginBottom:16,fontFamily:C.font}}>Are you 18 or older?</div>
          <button style={{padding:"12px 0",width:"100%",background:C.accentBg,border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:13,fontWeight:600,marginBottom:10}} onClick={()=>setBoarded(true)}>Yes, I'm 18+ — Enter</button>
          <button style={{padding:"12px 0",width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.dim,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:13}} onClick={()=>alert("You must be 18+ to use this app.")}>No</button>
          <div style={{fontSize:9,color:C.dark,marginTop:16,lineHeight:1.5,fontFamily:C.font}}>By continuing you agree to our Terms of Service and Privacy Policy.</div>
        </div>
      </div>
    );
  }

  // ── PROFILE SETUP GATE ───────────────────────────────────────────────────────
  if(needsSetup) return <ProfileSetup onSave={profile=>{setMe(profile);persist.save(PROFILE_KEY,profile);showToast("Welcome 🔥",C.accent);}}/>;

  // ── VIDEO ROOM ───────────────────────────────────────────────────────────────
  if(videoRoom) return <VideoRoom me={me} targetUser={videoRoom.targetUser} onClose={()=>setVideoRoom(null)}/>;

  // ── MAIN ─────────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{KF}</style>

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.logo}><ButtIcon size={18}/> THE HOLE EATERS
          {cruisingStatus&&<span style={{fontSize:9,color:C.accent,marginLeft:8,fontFamily:C.font,opacity:0.8}}>📡 {cruisingStatus}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={S.pill}><span style={S.greenDot}/>{USERS.filter(u=>u.online).length} nearby</div>
          <div style={{cursor:"pointer",position:"relative"}} onClick={()=>{setShowMyProfile(true);setSelected(null);}}>
            <VideoAvatar user={me} size={34} borderColor={cruisingStatus?C.accent:C.away} showStatus={false}/>
            {cruisingStatus&&<div style={{position:"absolute",top:-3,right:-3,width:10,height:10,borderRadius:"50%",background:C.accent,border:`2px solid ${C.bg}`}}/>}
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div style={S.filterRow}>{FILTERS.map(f=><button key={f} onClick={()=>setFilter(f)} style={{...S.chip,...(filter===f?S.chipAct:{})}}>{f}</button>)}</div>

      {/* TABS */}
      <div style={S.tabRow}>
        {[{k:"map",l:"🗺 Map"},{k:"list",l:"☰ List"},{k:"matches",l:"💘 Matches"},{k:"radar",l:"📡 Radar"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{...S.tabBtn,...(tab===t.k?S.tabAct:{})}}>{t.l}</button>
        ))}
      </div>

      {/* MAP */}
      {tab==="map"&&(
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <div ref={mapContainer} style={{position:"absolute",inset:0}}/>
          {/* My draggable pin overlay */}
          {me&&!ghostMode&&(
            <div style={{position:"absolute",left:`${myPinPos.x}%`,top:`${myPinPos.y}%`,transform:"translate(-50%,-50%)",zIndex:20,touchAction:"none"}}
              onPointerDown={handlePinDown}>
              <div style={{cursor:"grab",position:"relative"}}>
                {cruisingStatus&&<div style={{position:"absolute",bottom:"110%",left:"50%",fontSize:9,color:"#000",background:C.accent,padding:"3px 8px",borderRadius:8,whiteSpace:"nowrap",fontWeight:700,animation:"badgePop 0.3s ease"}}>{cruisingStatus}</div>}
                <div style={{width:42,height:42,borderRadius:"50%",background:C.accentBg,border:`3px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:`0 0 16px ${C.accent}55`}}>
                  {me.profileVideo?<video src={me.profileVideo} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/>:me.avatar}
                </div>
                <div style={{position:"absolute",top:"110%",left:"50%",transform:"translateX(-50%)",fontSize:8,color:C.accent,fontFamily:C.font,whiteSpace:"nowrap",background:"rgba(9,11,15,0.85)",padding:"2px 6px",borderRadius:3}}>YOU · drag to move</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST */}
      {tab==="list"&&(
        <div style={S.listWrap}>
          {filtered.map(u=>(
            <div key={u.id} style={S.listCard} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");}}>
              <VideoAvatar user={u} size={46} borderRadius={10} showStatus/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.text,fontWeight:500}}>{u.name}{u.profileVideo&&<span style={{fontSize:8,color:C.red,marginLeft:4}}>▶ VID</span>}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{u.role} · {u.age}yo</div>
                <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>{u.tags.map(t=><span key={t} style={S.tag}>#{t}</span>)}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={S.distBadge}>{u.dist}</div>
                <div style={{width:9,height:9,borderRadius:"50%",background:statusColor(u)}}/>
                <div style={{fontSize:9,color:C.dim}}>{u.lastSeen}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MATCHES */}
      {tab==="matches"&&(
        <div style={S.listWrap}>
          {liked.length===0
            ? <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40}}><div style={{fontSize:48,marginBottom:12}}>💘</div><div style={{fontSize:13,color:C.dim,fontFamily:C.font}}>No matches yet</div><div style={{fontSize:11,color:C.dark,marginTop:4,fontFamily:C.font}}>Like someone on the map to see them here</div></div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10,padding:4}}>
                {USERS.filter(u=>liked.includes(u.id)).map(u=>(
                  <div key={u.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 8px",textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");setTab("map");}}>
                    <div style={{margin:"0 auto 8px"}}><VideoAvatar user={u} size={48} showStatus={false}/></div>
                    <div style={{fontSize:11,color:C.text,fontWeight:500}}>{u.name}</div>
                    <div style={{fontSize:9,color:C.dim,marginTop:2,fontFamily:C.font}}>{u.role} · {u.dist}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* RADAR */}
      {tab==="radar"&&(
        <div style={S.listWrap}>
          {/* Ghost Mode */}
          <div style={{background:C.surface,border:`1px solid ${ghostMode?C.accent:C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><div style={{fontSize:12,color:C.text,fontFamily:C.font}}>👻 Ghost Mode</div><div style={{fontSize:10,color:C.dim,marginTop:2,fontFamily:C.font}}>Browse invisibly — your pin is hidden.</div></div>
            <div style={{width:44,height:24,borderRadius:12,background:ghostMode?C.accentBg:C.surface2,border:`1px solid ${ghostMode?C.accent:C.border}`,cursor:"pointer",position:"relative",transition:"all .2s"}} onClick={()=>setGhostMode(g=>!g)}>
              <div style={{width:18,height:18,borderRadius:"50%",background:ghostMode?C.accent:C.dim,position:"absolute",top:2,left:ghostMode?23:3,transition:"all .2s",boxShadow:ghostMode?`0 0 8px ${C.accent}`:"none"}}/>
            </div>
          </div>

          {/* Sonar */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16,position:"relative",overflow:"hidden",height:200}}>
            <div style={{position:"absolute",top:8,left:16,fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,fontFamily:C.font}}>PROXIMITY SONAR</div>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}>
              {[120,80,40].map((r,i)=><div key={i} style={{position:"absolute",width:r*2,height:r*2,borderRadius:"50%",border:`1px solid rgba(245,158,11,${0.06+i*0.04})`,top:`-${r}px`,left:`-${r}px`}}/>)}
              <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,boxShadow:`0 0 12px ${C.accent}`}}/>
              <div style={{position:"absolute",top:"-120px",left:"3px",width:1,height:120,background:`linear-gradient(to top,${C.accent},transparent)`,transformOrigin:"bottom center",transform:`rotate(${radarPulse}deg)`,opacity:0.6}}/>
              {USERS.filter(u=>u.online).slice(0,6).map((u,i)=>{
                const angle=(i*60+radarPulse*0.1)*(Math.PI/180);
                const dist=20+parseInt(u.dist)*0.25;
                const x=Math.cos(angle)*Math.min(dist,100);
                const y=Math.sin(angle)*Math.min(dist,100);
                return <div key={u.id} style={{position:"absolute",left:x-4,top:y-4,width:8,height:8,borderRadius:"50%",background:u.color,boxShadow:`0 0 6px ${u.color}`,opacity:0.8}} title={u.name}/>;
              })}
            </div>
          </div>

          {/* Heat timeline */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:12,fontFamily:C.font}}>🔥 PREDICTED HEAT TIMELINE</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:60}}>
              {heatHours.map((h,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:"100%",height:`${h.v*0.55}px`,borderRadius:3,background:h.v>80?`linear-gradient(to top,${C.red},${C.accent})`:h.v>50?C.accentBg:"rgba(245,158,11,0.06)",border:`1px solid ${h.v>80?C.red:h.v>50?C.accent:"transparent"}`}}/>
                  <span style={{fontSize:7,color:C.dark,fontFamily:C.font}}>{h.h}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:10,textAlign:"center",fontFamily:C.font}}>Peak: <span style={{color:C.accent,fontWeight:600}}>11PM–1AM</span></div>
          </div>

          {/* AI Icebreakers */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:10,fontFamily:C.font}}>🧠 AI ICEBREAKERS</div>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8}}>
              {USERS.filter(u=>u.online).slice(0,6).map(u=>(
                <div key={u.id} style={{flexShrink:0,cursor:"pointer",textAlign:"center"}} onClick={()=>generateOpener(u)}>
                  <VideoAvatar user={u} size={40} showStatus={false}/>
                  <div style={{fontSize:8,color:C.dim,marginTop:4,maxWidth:44,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:C.font}}>{u.name}</div>
                </div>
              ))}
            </div>
            {Object.entries(aiOpeners).map(([id,text])=>{
              const u=USERS.find(x=>x.id===parseInt(id)); if(!u) return null;
              return(
                <div key={id} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginTop:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:14}}>{u.avatar}</span><span style={{fontSize:10,color:C.text,fontFamily:C.font}}>{u.name}</span></div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.5,fontStyle:"italic"}}>"{text}"</div>
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <button style={{...S.actBtn,flex:1,padding:"6px 0",fontSize:9}} onClick={()=>{setSelected(u);setDrawerTab("Chat");setChatMsg(text);setMsgs([]);setTab("map");}}>📋 Use</button>
                    <button style={{...S.actBtn,flex:1,padding:"6px 0",fontSize:9}} onClick={()=>generateOpener(u)}>🔄 New</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Who's Checking You */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:12,fontFamily:C.font}}>👁 WHO'S CHECKING YOU</div>
            {ghostMode
              ? <div style={{textAlign:"center",padding:"12px 0",fontSize:11,color:C.dim,fontFamily:C.font}}>👻 Ghost mode — you're invisible</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {USERS.filter(u=>u.online).slice(0,4).map(u=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");setTab("map");}}>
                      <VideoAvatar user={u} size={32} showStatus={false}/>
                      <div style={{flex:1}}><div style={{fontSize:11,color:C.text,fontFamily:C.font}}>{u.name}</div><div style={{fontSize:9,color:C.dim,fontFamily:C.font}}>{u.dist} · {Math.floor(Math.random()*10)+1}m ago</div></div>
                      <div style={{fontSize:9,color:C.accent,fontFamily:C.font}}>{Math.floor(Math.random()*5)+1}x</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* PROFILE DRAWER */}
      {selected&&(
        <>
          <div style={S.overlay} onClick={()=>setSelected(null)}/>
          <div style={S.sheet}>
            <div style={S.handle}/>
            <div style={S.sheetHero}>
              <VideoAvatar user={selected} size={68} borderRadius={12} borderColor={selected.color} showStatus fontSize={34}/>
              <div style={{flex:1,paddingTop:2}}>
                <div style={S.sheetName}>{selected.name}{selected.profileVideo&&<span style={{fontSize:9,color:C.red,marginLeft:6,fontFamily:C.font}}>▶ VIDEO</span>}</div>
                <div style={{display:"flex",alignItems:"center",fontSize:11,marginTop:5,flexWrap:"wrap",gap:2}}>
                  <span style={{color:selected.color}}>{selected.role}</span><span style={S.dot}>·</span>
                  <span style={{color:C.muted}}>{selected.age}yo</span><span style={S.dot}>·</span>
                  <span style={{color:statusColor(selected)}}>{selected.online?(selected.away?"Away":"● Online"):"Offline"}</span>
                </div>
                <div style={{fontSize:11,color:C.dim,marginTop:4,fontFamily:C.font}}>📍 {selected.dist} away</div>
              </div>
              <button style={S.closeBtn} onClick={()=>setSelected(null)}>✕</button>
            </div>

            {/* Vibe score */}
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 18px 0"}}>
              <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,width:80,fontFamily:C.font}}>VIBE CHECK</div>
              <div style={{flex:1,height:6,background:C.surface2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${vibe}%`,background:vibe>70?C.green:vibe>40?C.accent:C.red,transition:"width 0.6s"}}/></div>
              <div style={{fontSize:13,fontWeight:600,width:36,textAlign:"right",color:vibe>70?C.green:vibe>40?C.accent:C.red,fontFamily:C.font}}>{vibe}%</div>
            </div>

            {/* Drawer tabs */}
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,margin:"12px 18px 0"}}>
              {["Profile","Chat","Media"].map(t=><button key={t} onClick={()=>setDrawerTab(t)} style={{flex:1,padding:"8px 0",background:"none",border:"none",fontFamily:C.font,fontSize:10,color:drawerTab===t?C.accent:C.dim,cursor:"pointer",borderBottom:drawerTab===t?`2px solid ${C.accent}`:"2px solid transparent"}}>{t}</button>)}
            </div>

            {drawerTab==="Profile"&&(
              <>
                <div style={S.sec}><div style={S.sLabel}>BIO</div><div style={{fontSize:13,color:C.muted,lineHeight:1.65,fontStyle:"italic"}}>"{selected.bio}"</div></div>
                <div style={S.sec}><div style={S.sLabel}>INTO</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{selected.tags.map(t=><span key={t} style={{...S.tag,padding:"5px 12px"}}>#{t}</span>)}</div></div>
                <div style={S.sec}>
                  <div style={S.sLabel}>PHOTOS · {selected.photos}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {Array.from({length:Math.min(selected.photos,6)}).map((_,i)=>(
                      <div key={i} style={{aspectRatio:"1",borderRadius:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",background:`${selected.color}15`}}><span style={{fontSize:20,opacity:.4}}>📸</span></div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {drawerTab==="Chat"&&(
              <div style={{margin:"0 18px 18px",background:"#0d0f14",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"9px 14px",fontSize:10,color:C.dim,borderBottom:`1px solid ${C.border}`,letterSpacing:1,fontFamily:C.font}}>Chat with {selected.name}</div>
                <div style={{padding:"12px 14px",minHeight:80,maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
                  {msgs.length===0&&!typing&&<div style={{fontSize:11,color:C.dark,textAlign:"center",margin:"auto",fontFamily:C.font}}>Say something 👋</div>}
                  {msgs.map((m,i)=>(
                    <div key={i} style={{maxWidth:"72%",padding:"8px 12px",borderRadius:10,fontSize:12,...(m.from==="me"?{alignSelf:"flex-end",background:C.accentBg,border:`1px solid ${C.accentBorder}`,color:C.accent,borderRadius:"10px 10px 2px 10px"}:{alignSelf:"flex-start",background:C.surface2,border:`1px solid ${C.border}`,color:"#d1d5db",borderRadius:"10px 10px 10px 2px"})}}>
                      {m.media&&<div style={{marginBottom:6}}>{m.media.type==="image"?<img src={m.media.url} alt="" style={{width:"100%",maxWidth:180,borderRadius:6}}/>:<video src={m.media.url} controls style={{width:"100%",maxWidth:180,borderRadius:6}}/>}</div>}
                      {m.text&&<div>{m.text}</div>}
                      <div style={{fontSize:9,color:"#4b5563",marginTop:3}}>{m.t}</div>
                    </div>
                  ))}
                  {typing&&<div style={{alignSelf:"flex-start",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:"10px 10px 10px 2px",maxWidth:"72%",padding:"8px 12px"}}><div style={{display:"flex",gap:4}}>{[0,.15,.3].map(d=><span key={d} style={{fontSize:8,color:C.dim,animation:`typing 1.2s ${d}s infinite`}}>●</span>)}</div></div>}
                  <div ref={chatEnd}/>
                </div>
                {mediaPreview&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(17,19,24,0.95)"}}>
                    {mediaPreview.type==="image"?<img src={mediaPreview.url} alt="" style={{width:36,height:36,borderRadius:4,objectFit:"cover"}}/>:<div style={{width:36,height:36,borderRadius:4,background:C.surface2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎬</div>}
                    <span style={{fontSize:10,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:C.font}}>{mediaPreview.name}</span>
                    <button style={{background:"none",border:"none",color:C.dim,fontSize:12,cursor:"pointer"}} onClick={()=>setMediaPreview(null)}>✕</button>
                  </div>
                )}
                <div style={{display:"flex",borderTop:`1px solid ${C.border}`}}>
                  <button style={{width:44,background:"none",border:"none",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>fileRef.current?.click()}>📷</button>
                  <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={handleFile}/>
                  <input style={{flex:1,background:"none",border:"none",outline:"none",padding:"10px 0",fontSize:12,color:C.text,fontFamily:C.font}} value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Message..."/>
                  <button style={{width:44,background:C.accent,border:"none",color:"#000",fontSize:16,cursor:"pointer",fontWeight:"bold"}} onClick={sendMsg}>↑</button>
                </div>
              </div>
            )}

            {drawerTab==="Media"&&(
              <div style={S.sec}><div style={S.sLabel}>SHARED MEDIA</div><div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:8}}>📂</div><div style={{fontSize:11,color:C.dim,fontFamily:C.font}}>No shared media yet</div></div></div>
            )}

            <div style={{display:"flex",gap:6,padding:"16px 18px",flexWrap:"wrap"}}>
              <button style={S.actBtn} onClick={()=>{setLiked(l=>l.includes(selected.id)?l.filter(x=>x!==selected.id):[...l,selected.id]);}}>{liked.includes(selected.id)?"💖 Liked":"🤍 Like"}</button>
              <button style={{...S.actBtn,...S.actPrimary}} onClick={()=>setDrawerTab("Chat")}>💬 Message</button>
              <button style={S.actBtn} onClick={()=>{setVideoRoom({targetUser:selected});setSelected(null);}}>📹 Call</button>
              <button style={S.actBtn}>🚫 Block</button>
            </div>
          </div>
        </>
      )}

      {/* MY PROFILE SHEET */}
      {showMyProfile&&(
        <>
          <div style={S.overlay} onClick={()=>setShowMyProfile(false)}/>
          <div style={S.sheet}>
            <div style={S.handle}/>
            <div style={S.sheetHero}>
              <VideoAvatar user={me} size={68} borderRadius={12} borderColor={C.accent} showStatus={false} fontSize={34}/>
              <div style={{flex:1,paddingTop:2}}>
                <div style={S.sheetName}>{me.name}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:5}}>{me.role} · {me.age}yo</div>
                <div style={{fontSize:10,color:ghostMode?C.accent:C.green,marginTop:4,fontFamily:C.font}}>{ghostMode?"👻 Ghost Mode":"● Visible on map"}</div>
                {cruisingStatus&&<div style={{fontSize:10,color:C.accent,marginTop:2,fontFamily:C.font}}>📡 {cruisingStatus}</div>}
              </div>
              <button style={S.closeBtn} onClick={()=>setShowMyProfile(false)}>✕</button>
            </div>
            {me.bio&&<div style={S.sec}><div style={S.sLabel}>BIO</div><div style={{fontSize:13,color:C.muted,lineHeight:1.65,fontStyle:"italic"}}>"{me.bio}"</div></div>}
            <div style={S.sec}><div style={S.sLabel}>LOOKING FOR</div><span style={{...S.tag,display:"inline-block"}}>{me.lookingFor}</span>{me.safeOnly&&<span style={{...S.tag,display:"inline-block",marginLeft:6,borderColor:C.green,color:C.green}}>✓ safe only</span>}</div>
            <div style={S.sec}><div style={S.sLabel}>LIKED ({liked.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{liked.length===0?<span style={{color:C.dim,fontSize:12,fontFamily:C.font}}>No likes yet</span>:USERS.filter(u=>liked.includes(u.id)).map(u=><span key={u.id} style={{...S.tag,padding:"5px 12px"}}>{u.avatar} {u.name}</span>)}</div></div>
            <div style={{display:"flex",gap:8,padding:"16px 18px",flexWrap:"wrap"}}>
              <button style={{...S.actBtn,flex:1}} onClick={()=>{setShowMyProfile(false);setShowEditor(true);}}>✏️ Edit Profile</button>
              <button style={{...S.actBtn,flex:1}} onClick={()=>{setShowMyProfile(false);setShowCruising(true);}}>📡 Status</button>
              <button style={{...S.actBtn,flex:1,background:"rgba(239,68,68,0.15)",borderColor:C.red,color:C.red}} onClick={()=>{setShowMyProfile(false);setVideoRoom({targetUser:null});}}>📹 Go Live</button>
            </div>
            <div style={{padding:"0 18px 24px"}}><button onClick={handleReset} style={{background:"none",border:"none",color:C.dim,fontSize:10,fontFamily:C.font,cursor:"pointer"}}>Reset profile</button></div>
          </div>
        </>
      )}

      {/* EDITOR */}
      {showEditor&&<ProfileEditor profile={me} onSave={handleProfileSave} onClose={()=>setShowEditor(false)}/>}

      {/* CRUISING PICKER */}
      {showCruising&&<CruisingPicker current={cruisingStatus} onSet={s=>{setCruisingStatus(s);showToast(`📡 ${s}`,C.accent);}} onClear={()=>setCruisingStatus(null)} onClose={()=>setShowCruising(false)}/>}

      {/* TOAST */}
      {toast&&<div style={{position:"absolute",top:68,right:14,zIndex:700,animation:"notifSlide 0.3s ease",background:C.surface,border:`1px solid ${toast.col}44`,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.text,fontFamily:C.font,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",maxWidth:240}}>{toast.text}</div>}

      {/* NOTIF */}
      {notif&&<div style={{position:"absolute",top:68,right:14,zIndex:200,animation:"notifSlide .35s ease"}}><div style={{display:"flex",alignItems:"center",gap:9,background:"rgba(16,18,28,0.97)",border:`1px solid ${C.border}`,padding:"10px 14px",borderRadius:12,backdropFilter:"blur(14px)",boxShadow:"0 8px 32px rgba(0,0,0,.55)",maxWidth:260}}><span style={{fontSize:20,flexShrink:0}}>{notif.icon}</span><span style={{fontSize:11,color:C.text,lineHeight:1.45,fontFamily:C.font}}>{notif.text}</span></div></div>}
    </div>
  );
}

// ─── MAPBOX HELPERS ───────────────────────────────────────────────────────────
function rebuildMarkers(map, userLoc, filtered, me, setSelected, setMsgs, setDrawerTab) {
  // Remove all custom markers (keep mapbox's own controls)
  document.querySelectorAll(".he-marker").forEach(el=>el.remove());

  // My marker
  const myEl=document.createElement("div");
  myEl.className="he-marker";
  myEl.innerHTML=`<div style="width:42px;height:42px;border-radius:50%;background:rgba(245,158,11,0.15);border:3px solid #f59e0b;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 0 0 6px rgba(245,158,11,0.12),0 0 20px rgba(245,158,11,0.3);position:relative"><span>${me?.avatar||"😏"}</span></div>`;
  new mapboxgl.Marker({element:myEl}).setLngLat(userLoc).addTo(map);

  filtered.forEach((u,i)=>{
    const off=USER_OFFSETS[i+1]||[Math.random()*0.008-0.004,Math.random()*0.008-0.004];
    const el=document.createElement("div");
    el.className="he-marker";
    el.style.cssText="cursor:pointer;transition:transform .15s";
    const sc=u.online?(u.away?"#f59e0b":"#22c55e"):"#374151";
    el.innerHTML=`<div style="width:38px;height:38px;border-radius:50%;background:${u.color}22;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 0 2px ${sc},0 4px 12px rgba(0,0,0,.4);opacity:${u.online?1:0.5};position:relative"><span>${u.avatar}</span><div style="position:absolute;bottom:0;right:0;width:9px;height:9px;border-radius:50%;background:${sc};border:1.5px solid #090b0f"></div></div>`;
    el.onmouseenter=()=>el.style.transform="scale(1.15)";
    el.onmouseleave=()=>el.style.transform="scale(1)";
    el.addEventListener("click",()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");});
    new mapboxgl.Marker({element:el}).setLngLat([userLoc[0]+off[0],userLoc[1]+off[1]]).addTo(map);
  });
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  root:{width:"100%",height:"100dvh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:C.font,overflow:"hidden",position:"relative",userSelect:"none"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"rgba(9,11,15,0.95)",borderBottom:`1px solid ${C.border}`,zIndex:100,flexShrink:0,backdropFilter:"blur(10px)"},
  logo:{fontFamily:C.display,fontWeight:800,fontSize:15,color:C.accent,letterSpacing:1,display:"flex",alignItems:"center",gap:6},
  pill:{display:"flex",alignItems:"center",gap:5,background:C.surface,border:`1px solid ${C.border}`,padding:"4px 10px",borderRadius:20,fontSize:10,color:C.muted,fontFamily:C.font},
  greenDot:{width:7,height:7,borderRadius:"50%",background:C.green,display:"inline-block",boxShadow:`0 0 6px ${C.green}`},
  filterRow:{display:"flex",gap:6,padding:"8px 12px",overflowX:"auto",background:"rgba(9,11,15,0.9)",flexShrink:0,scrollbarWidth:"none"},
  chip:{fontFamily:C.font,fontSize:10,padding:"4px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:C.surface,color:C.dim,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .15s"},
  chipAct:{background:C.accentBg,borderColor:C.accent,color:C.accent},
  tabRow:{display:"flex",background:"#0d0f14",borderBottom:`1px solid ${C.border}`,flexShrink:0},
  tabBtn:{flex:1,padding:"9px 0",background:"none",border:"none",fontFamily:C.font,fontSize:11,color:C.dim,cursor:"pointer",letterSpacing:.5,transition:"all .15s"},
  tabAct:{color:C.accent,borderBottom:`2px solid ${C.accent}`,background:C.accentBg},
  listWrap:{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:8,scrollbarWidth:"none"},
  listCard:{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1px solid ${C.border}`,padding:"12px 14px",borderRadius:10,cursor:"pointer"},
  distBadge:{fontSize:10,color:C.accent,background:C.accentBg,border:`1px solid ${C.accentBorder}`,padding:"2px 8px",borderRadius:10,fontFamily:C.font},
  tag:{fontSize:10,color:C.muted,background:C.surface2,border:`1px solid ${C.border}`,padding:"3px 8px",borderRadius:20,fontFamily:C.font},
  overlay:{position:"absolute",inset:0,zIndex:60,background:"rgba(9,11,15,0.55)",backdropFilter:"blur(2px)",animation:"fadeIn .2s ease"},
  sheet:{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,borderRadius:"14px 14px 0 0",zIndex:70,animation:"slideUp .28s cubic-bezier(0.34,1.2,0.64,1)",maxHeight:"82vh",overflowY:"auto"},
  handle:{width:36,height:4,borderRadius:2,background:C.border,margin:"10px auto 0"},
  sheetHero:{display:"flex",gap:14,alignItems:"flex-start",padding:"16px 18px 0",position:"relative"},
  sheetName:{fontFamily:C.display,fontWeight:800,fontSize:20,color:C.text,lineHeight:1.1},
  dot:{color:C.dark,margin:"0 4px"},
  closeBtn:{position:"absolute",top:0,right:18,background:"none",border:"none",color:C.dim,fontSize:16,cursor:"pointer",padding:4},
  sec:{padding:"14px 18px 0"},
  sLabel:{fontSize:9,color:C.dim,letterSpacing:2,marginBottom:8,fontWeight:500,fontFamily:C.font},
  actBtn:{flex:1,minWidth:70,padding:"10px 0",background:C.surface2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,cursor:"pointer",fontFamily:C.font,fontSize:10,transition:"all .15s",textAlign:"center"},
  actPrimary:{background:C.accentBg,borderColor:C.accent,color:C.accent},
};
