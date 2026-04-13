import { useState, useEffect, useRef } from "react";

// ─── TOKENS ─────────────────────────────────────────────────────────────────
const C = {
  bg:"#090b0f", surface:"#111318", surface2:"#1a1d24", border:"#222530",
  text:"#e8e4d8", muted:"#9ca3af", dim:"#6b7280", dark:"#374151",
  accent:"#f59e0b", accentBg:"rgba(245,158,11,0.15)", accentBorder:"rgba(245,158,11,0.25)",
  green:"#22c55e", red:"#ef4444", pink:"#ff5277", away:"#f59e0b",
  font:"'JetBrains Mono',monospace", display:"'Syne',sans-serif",
};
const statusColor = u => u.online ? (u.away ? C.away : C.green) : C.dark;
const pad = n => String(n).padStart(2,"0");
const timestamp = () => { const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ─── BUTT ICON ──────────────────────────────────────────────────────────────
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

// ─── VIDEO AVATAR ───────────────────────────────────────────────────────────
function VideoAvatar({ user, size=38, borderRadius="50%", borderColor, showStatus=true, fontSize }) {
  const vRef = useRef(null);
  const hasVideo = !!user.profileVideo;
  const fs = fontSize || Math.round(size * 0.47);

  useEffect(() => {
    if (hasVideo && vRef.current) vRef.current.play().catch(() => {});
  }, [hasVideo]);

  return (
    <div style={{
      width:size, height:size, borderRadius, overflow:"hidden", position:"relative",
      flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
      background: hasVideo ? "#000" : (user.color||C.accent)+"22",
      border: borderColor ? `2px solid ${borderColor}` : undefined,
      ...(hasVideo ? {animation:"vidRing 2s ease infinite"} : {}),
    }}>
      {hasVideo ? (
        <video ref={vRef} src={user.profileVideo} autoPlay loop muted playsInline
          style={{width:"100%",height:"100%",objectFit:"cover"}} />
      ) : (
        <span style={{fontSize:fs}}>{user.avatar}</span>
      )}
      {hasVideo && (
        <div style={{position:"absolute",bottom:2,left:2,width:10,height:7,borderRadius:2,background:C.red,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:5,color:"#fff",fontWeight:700,lineHeight:1}}>▶</span>
        </div>
      )}
      {showStatus && (
        <div style={{
          position:"absolute", bottom:0, right:0,
          width:size>50?14:9, height:size>50?14:9, borderRadius:"50%",
          background:statusColor(user),
          border:`${size>50?2:1.5}px solid ${size>50?C.surface:C.bg}`,
        }}/>
      )}
    </div>
  );
}

// ─── DATA ───────────────────────────────────────────────────────────────────
const VIDS = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://www.w3schools.com/html/movie.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
];
const USERS = [
  { id:1,  name:"DaddyDeep",      age:38, role:"Top",      bio:"Experienced. Patient. Here for a good time.",    tags:["top","dom","hosted"],     avatar:"😈", online:true,  away:false, dist:"45m",  color:"#ef4444", photos:3, lastSeen:"now",  profileVideo:VIDS[0] },
  { id:2,  name:"BottomlessJay",  age:26, role:"Bottom",   bio:"Hungry 24/7. No time wasters.",                  tags:["bottom","young","now"],   avatar:"🍑", online:true,  away:false, dist:"120m", color:"#8b5cf6", photos:5, lastSeen:"now",  profileVideo:null },
  { id:3,  name:"VersKing",       age:33, role:"Vers",     bio:"Switch hitter. Love a good connection.",          tags:["vers","fit","discreet"],  avatar:"👑", online:true,  away:true,  dist:"200m", color:"#3b82f6", photos:2, lastSeen:"5m",   profileVideo:VIDS[1] },
  { id:4,  name:"HungryMike",     age:41, role:"Top",      bio:"Big energy. Loves giving. No drama.",            tags:["top","thick","generous"], avatar:"🔥", online:true,  away:false, dist:"80m",  color:"#f97316", photos:4, lastSeen:"now",  profileVideo:null },
  { id:5,  name:"AssConnoisseur", age:29, role:"Top",      bio:"Quality over quantity. Know what I want.",        tags:["top","selective","clean"],avatar:"🎯", online:false, away:false, dist:"310m", color:"#10b981", photos:1, lastSeen:"2h",   profileVideo:null },
  { id:6,  name:"NightCrawler",   age:35, role:"Bottom",   bio:"Night owl. Best after midnight.",                tags:["bottom","late","hosted"], avatar:"🌙", online:true,  away:false, dist:"55m",  color:"#6366f1", photos:6, lastSeen:"now",  profileVideo:VIDS[2] },
  { id:7,  name:"OpenMouth99",    age:24, role:"Oral",     bio:"Worship game on point. Enthusiastic.",            tags:["oral","eager","young"],   avatar:"👅", online:true,  away:true,  dist:"90m",  color:"#ec4899", photos:2, lastSeen:"12m",  profileVideo:null },
  { id:8,  name:"BearDaddy",      age:52, role:"Top/Bear", bio:"Big. Hairy. Warm. Good hands.",                  tags:["bear","daddy","hairy"],   avatar:"🐻", online:true,  away:false, dist:"170m", color:"#a855f7", photos:3, lastSeen:"now",  profileVideo:null },
  { id:9,  name:"ChubChaser",     age:31, role:"Chaser",   bio:"Love a bigger guy. No discrimination.",           tags:["chaser","open","chill"],  avatar:"💪", online:false, away:false, dist:"400m", color:"#14b8a6", photos:0, lastSeen:"1d",   profileVideo:null },
  { id:10, name:"QuickStop",      age:27, role:"Vers",     bio:"In the area for 20 mins. No BS.",                tags:["vers","quick","mobile"],  avatar:"⚡", online:true,  away:false, dist:"30m",  color:"#eab308", photos:2, lastSeen:"now",  profileVideo:null },
  { id:11, name:"SlowBurn_",      age:44, role:"Vers Top", bio:"I like taking my time. Edging pro.",             tags:["vers","edging","patient"],avatar:"🕯️", online:true,  away:false, dist:"150m", color:"#f43f5e", photos:4, lastSeen:"now",  profileVideo:VIDS[0] },
  { id:12, name:"RimJobRonnie",   age:36, role:"Oral",     bio:"Face first. No apologies. Grade A.",             tags:["oral","rim","skilled"],   avatar:"😛", online:false, away:false, dist:"280m", color:"#0ea5e9", photos:1, lastSeen:"3h",   profileVideo:null },
];
const ME_INIT = { id:0, name:"You", age:28, role:"Vers", bio:"New here. Curious. Down for whatever with the right vibe.", tags:["vers","clean","discreet"], avatar:"😏", online:true, away:false, color:"#f59e0b", lookingFor:"hookup", safeOnly:true, profileVideo:null };
const POSITIONS = [{x:50,y:50},{x:53,y:46},{x:46,y:54},{x:62,y:43},{x:37,y:57},{x:66,y:61},{x:34,y:39},{x:71,y:47},{x:44,y:67},{x:56,y:33},{x:29,y:59},{x:73,y:36},{x:41,y:28}];
const BLOCKS = [{left:"8%",top:"12%",width:"18%",height:"14%"},{left:"30%",top:"8%",width:"12%",height:"10%"},{left:"55%",top:"10%",width:"22%",height:"12%"},{left:"80%",top:"18%",width:"14%",height:"18%"},{left:"5%",top:"35%",width:"14%",height:"20%"},{left:"24%",top:"28%",width:"10%",height:"8%"},{left:"74%",top:"38%",width:"18%",height:"14%"},{left:"8%",top:"62%",width:"16%",height:"16%"},{left:"30%",top:"68%",width:"14%",height:"12%"},{left:"60%",top:"65%",width:"20%",height:"16%"},{left:"82%",top:"58%",width:"12%",height:"22%"},{left:"45%",top:"74%",width:"10%",height:"10%"}];
const FILTERS = ["All","Online","Top","Bottom","Vers","Oral","Bear","Hosting","<100m"];
const REPLIES = ["👀 hey","Sounds good","Where are you?","Host or travel?","Pic?","What are you into?","Be there in 10","Send location","Discreet?","Let's do it","🔥🔥🔥","You close?","Come over","Nice 👀"];
const filterUsers = (users, f) => { if(f==="All") return users; if(f==="Online") return users.filter(u=>u.online); if(f==="<100m") return users.filter(u=>parseInt(u.dist)<100); if(f==="Hosting") return users.filter(u=>u.tags.includes("hosted")); return users.filter(u=>u.tags.some(t=>t.toLowerCase().includes(f.toLowerCase()))||u.role.toLowerCase().includes(f.toLowerCase())); };
const vibeScore = (me, them) => { const s=me.tags.filter(t=>them.tags.includes(t)).length; const c=(me.role==="Vers"||them.role==="Vers")?1:(me.role==="Top"&&them.role.includes("Bottom"))?1:(me.role==="Bottom"&&them.role.includes("Top"))?1:0; return Math.min(99,Math.round(s*18+c*35+Math.random()*20)); };

// ─── KEYFRAMES ──────────────────────────────────────────────────────────────
const KF = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}
@keyframes pulse{0%{transform:translate(-50%,-50%) scale(0.9);opacity:.7}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes notifSlide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes typing{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
@keyframes glow{0%,100%{box-shadow:0 0 8px rgba(245,158,11,.3)}50%{box-shadow:0 0 20px rgba(245,158,11,.6)}}
@keyframes vidRing{0%,100%{box-shadow:0 0 0 2px rgba(239,68,68,0.4),0 0 6px rgba(239,68,68,0.2)}50%{box-shadow:0 0 0 2px rgba(239,68,68,0.9),0 0 12px rgba(239,68,68,0.5)}}
@keyframes radarSweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
`;

// ─── APP ────────────────────────────────────────────────────────────────────
export default function HoleEatersApp() {
  const [boarded,setBoarded]=useState(false);
  const [tab,setTab]=useState("map");
  const [filter,setFilter]=useState("All");
  const [selected,setSelected]=useState(null);
  const [myProfile,setMyProfile]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [liked,setLiked]=useState([]);
  const [msgs,setMsgs]=useState([]);
  const [drawerTab,setDrawerTab]=useState("Profile");
  const [chatMsg,setChatMsg]=useState("");
  const [typing,setTyping]=useState(false);
  const [mediaPreview,setMediaPreview]=useState(null);
  const [videoRoom,setVideoRoom]=useState(null);
  const [notif,setNotif]=useState(null);
  const [camOn,setCamOn]=useState(true);
  const [micOn,setMicOn]=useState(true);
  const [elapsed,setElapsed]=useState(0);
  const [camError,setCamError]=useState(null);
  const [me,setMe]=useState(ME_INIT);
  const [ghostMode,setGhostMode]=useState(false);
  const [radarPulse,setRadarPulse]=useState(0);
  const [aiIcebreakers,setAiIcebreakers]=useState({});
  const chatEnd=useRef(null); const fileRef=useRef(null); const profileVidRef=useRef(null);
  const vidRef=useRef(null); const streamRef=useRef(null);

  const filtered=filterUsers(USERS,filter);
  const toggleLike=id=>setLiked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[msgs,typing]);

  useEffect(()=>{ if(!boarded) return; const iv=setInterval(()=>{ const u=USERS[Math.floor(Math.random()*USERS.length)]; if(u.online){ const m=[`${u.name} just went online`,`${u.name} is nearby (${u.dist})`,`${u.name} viewed your profile`,`${u.name} liked you`]; setNotif({text:m[Math.floor(Math.random()*m.length)],icon:u.avatar}); setTimeout(()=>setNotif(null),3000); } },12000+Math.random()*8000); return ()=>clearInterval(iv); },[boarded]);

  // Radar sonar pulse
  useEffect(()=>{
    if(tab!=="radar"||!boarded) return;
    const iv=setInterval(()=>setRadarPulse(p=>(p+1)%360),50);
    return ()=>clearInterval(iv);
  },[tab,boarded]);

  // AI Icebreaker generator
  const generateIcebreaker = (user) => {
    const openers = [
      [`Your bio says "${user.bio.slice(0,20)}..." — I'm intrigued. What's the full story?`, "curiosity"],
      [`${user.role} energy at ${user.dist}? The universe is testing me rn.`, "flirty"],
      [`I see you're into #${user.tags[0]}. That's my frequency too.`, "shared interest"],
      [`${user.dist} away and online at this hour? We might be on the same wavelength.`, "proximity"],
      [`Your vibe score with me is ${vibeScore(me,user)}%. Want to see if the algorithm is right?`, "data-driven"],
      [`I have a theory about ${user.role}s named ${user.name.slice(0,4)}. Want to help me test it?`, "playful"],
      [`Three things: I'm ${me.role}, I'm ${me.tags[0]}, and I'm ${parseInt(user.dist)}m away. Your move.`, "direct"],
    ];
    const picked = openers[Math.floor(Math.random()*openers.length)];
    setAiIcebreakers(p=>({...p,[user.id]:{text:picked[0],style:picked[1],ts:Date.now()}}));
  };

  // Predict heat map hours
  const heatHours = [
    {h:"6PM",v:20},{h:"7PM",v:35},{h:"8PM",v:45},{h:"9PM",v:65},{h:"10PM",v:80},
    {h:"11PM",v:95},{h:"12AM",v:100},{h:"1AM",v:90},{h:"2AM",v:70},{h:"3AM",v:45},{h:"4AM",v:20},{h:"5AM",v:8},
  ];
  useEffect(()=>{ if(!videoRoom) return; setElapsed(0); const iv=setInterval(()=>setElapsed(e=>e+1),1000); return ()=>clearInterval(iv); },[videoRoom]);
  useEffect(()=>{ if(!videoRoom) return; let m=true; (async()=>{ try{ const s=await navigator.mediaDevices.getUserMedia({video:true,audio:true}); if(!m){s.getTracks().forEach(t=>t.stop());return;} streamRef.current=s; if(vidRef.current) vidRef.current.srcObject=s; setCamError(null); }catch(e){setCamError("Camera access denied");} })(); return ()=>{m=false;streamRef.current?.getTracks().forEach(t=>t.stop());}; },[videoRoom]);

  const sendMsg=()=>{ if(!chatMsg.trim()&&!mediaPreview) return; setMsgs(p=>[...p,{from:"me",text:chatMsg.trim(),t:timestamp(),...(mediaPreview?{media:mediaPreview}:{})}]); setChatMsg("");setMediaPreview(null); setTyping(true); setTimeout(()=>{ setTyping(false); setMsgs(p=>[...p,{from:"them",text:REPLIES[Math.floor(Math.random()*REPLIES.length)],t:timestamp(),...(Math.random()<.2?{media:{type:"image",placeholder:true}}:{})}]); },800+Math.random()*1200); };
  const handleFile=e=>{ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>setMediaPreview({type:f.type.startsWith("video")?"video":"image",url:r.result,name:f.name}); r.readAsDataURL(f); };
  const handleProfileVideo=e=>{ const f=e.target.files?.[0]; if(!f) return; if(!f.type.startsWith("video")){alert("Please select a video file");return;} if(f.size>10*1024*1024){alert("Video must be under 10MB");return;} const r=new FileReader(); r.onload=()=>setMe(p=>({...p,profileVideo:r.result})); r.readAsDataURL(f); };
  const removeProfileVideo=()=>setMe(p=>({...p,profileVideo:null}));
  const toggleCam=()=>{const t=streamRef.current?.getVideoTracks();if(t?.[0]){t[0].enabled=!t[0].enabled;setCamOn(t[0].enabled);}};
  const toggleMic=()=>{const t=streamRef.current?.getAudioTracks();if(t?.[0]){t[0].enabled=!t[0].enabled;setMicOn(t[0].enabled);}};
  const fmtTime=s=>`${pad(Math.floor(s/60))}:${pad(s%60)}`;

  // ── ONBOARDING ──
  if(!boarded) return (
    <div style={{...S.root,alignItems:"center",justifyContent:"center"}}><style>{KF}</style>
      <div style={S.onCard}>
        <div style={{fontSize:48,marginBottom:16}}><ButtIcon size={64}/></div>
        <div style={{fontFamily:C.display,fontWeight:800,fontSize:22,color:C.accent,marginBottom:8}}>THE HOLE EATERS</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:16}}>Location-based. Anonymous. Adults only.</div>
        <div style={{height:1,background:C.border,margin:"16px 0"}}/>
        <div style={{fontSize:14,color:C.text,fontWeight:500,marginBottom:16}}>Are you 18 or older?</div>
        <button style={S.onBtn} onClick={()=>setBoarded(true)}>Yes, I'm 18+</button>
        <button style={{...S.onBtn,background:C.surface2,borderColor:C.border,color:C.dim,marginTop:10}} onClick={()=>alert("You must be 18+ to use this app.")}>No</button>
        <div style={{fontSize:9,color:C.dark,marginTop:16,lineHeight:1.5}}>By continuing you agree to our Terms of Service and Privacy Policy.</div>
      </div>
    </div>
  );

  // ── VIDEO ROOM ──
  if(videoRoom) {
    const remotes=videoRoom.targetUser?[videoRoom.targetUser]:USERS.filter(u=>u.online&&!u.away).slice(0,3);
    return (
      <div style={S.root}><style>{KF}</style>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted}}><span style={{width:8,height:8,borderRadius:"50%",background:C.red,display:"inline-block",animation:"glow 2s ease infinite"}}/>LIVE · {remotes.length+1} in room</div>
          <div style={{fontSize:12,color:C.dim}}>{fmtTime(elapsed)}</div>
          <button style={{padding:"6px 14px",background:"rgba(239,68,68,0.15)",border:`1px solid ${C.red}`,color:C.red,borderRadius:6,cursor:"pointer",fontFamily:C.font,fontSize:11}} onClick={()=>{setVideoRoom(null);setCamOn(true);setMicOn(true);}}>Leave</button>
        </div>
        <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,padding:6}}>
          <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:C.surface,border:`1px solid ${C.border}`,minHeight:140}}>
            {camError?<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:28,marginBottom:8}}>📷</div><div style={{fontSize:11,color:C.dim,textAlign:"center",padding:"0 12px"}}>{camError}</div></div>
            :<video ref={vidRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)",borderRadius:10,...(!camOn?{display:"none"}:{})}}/>}
            {!camOn&&!camError&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:C.surface}}><span style={{fontSize:32}}>😏</span><span style={{fontSize:10,color:C.dim,marginTop:4}}>Camera off</span></div>}
            <div style={S.vidTag}>You {!micOn&&"🔇"}</div>
          </div>
          {remotes.map(u=>(
            <div key={u.id} style={{position:"relative",borderRadius:10,overflow:"hidden",background:C.surface,border:`1px solid ${C.border}`,minHeight:140}}>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:u.color+"15"}}><span style={{fontSize:36}}>{u.avatar}</span><div style={{position:"absolute",width:60,height:60,borderRadius:"50%",border:"2px solid rgba(245,158,11,0.3)",animation:"pulse 3s ease-out infinite",top:"50%",left:"50%"}}/></div>
              <div style={S.vidTag}>{u.name}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:16,padding:"16px 0",borderTop:`1px solid ${C.border}`}}>
          <button style={{...S.ctrlBtn,...(!micOn?{background:"rgba(239,68,68,0.15)",borderColor:C.red}:{})}} onClick={toggleMic}>{micOn?"🎙":"🔇"}</button>
          <button style={{...S.ctrlBtn,...(!camOn?{background:"rgba(239,68,68,0.15)",borderColor:C.red}:{})}} onClick={toggleCam}>{camOn?"📹":"📷"}</button>
          <button style={{padding:"0 24px",borderRadius:26,background:C.red,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:C.font,fontWeight:600}} onClick={()=>{setVideoRoom(null);setCamOn(true);setMicOn(true);}}>📞 End</button>
        </div>
      </div>
    );
  }

  const vibe=selected?vibeScore(me,selected):0;

  return (
    <div style={S.root}><style>{KF}</style>

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.logo}><ButtIcon size={18}/> THE HOLE EATERS</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={S.pill}><span style={S.greenDot}/><span>{USERS.filter(u=>u.online).length} nearby</span></div>
          <div style={{cursor:"pointer"}} onClick={()=>{setMyProfile(true);setSelected(null)}}>
            <VideoAvatar user={me} size={34} borderColor={C.accent} showStatus={false}/>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div style={S.filterRow}>{FILTERS.map(f=><button key={f} onClick={()=>setFilter(f)} style={{...S.chip,...(filter===f?S.chipAct:{})}}>{f}</button>)}</div>

      {/* TABS */}
      <div style={S.tabRow}>{[{k:"map",l:"🗺 Map"},{k:"list",l:"☰ List"},{k:"matches",l:"💘 Matches"},{k:"radar",l:"📡 Radar"}].map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{...S.tabBtn,...(tab===t.k?S.tabAct:{})}}>{t.l}</button>)}</div>

      {/* MAP */}
      {tab==="map"&&(
        <div style={S.mapWrap} onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
          <div style={S.mapBg}/><div style={S.mapGrid}/><div style={S.mapRoads}/><div style={S.heatmap}/>
          {BLOCKS.map((b,i)=><div key={i} style={{position:"absolute",background:"#0f1117",border:"1px solid rgba(245,158,11,0.05)",borderRadius:3,...b}}/>)}
          <div style={S.zoomCtrl}>
            <button style={S.zoomBtn} onClick={()=>setZoom(z=>Math.min(z+.2,2))}>+</button>
            <button style={S.zoomBtn} onClick={()=>setZoom(z=>Math.max(z-.2,.6))}>−</button>
            <button style={S.zoomBtn} onClick={()=>setZoom(1)}>⊙</button>
          </div>
          <div style={{position:"absolute",inset:0,transition:"transform .3s",transform:`scale(${zoom})`,transformOrigin:"center center"}}>
            <div style={{...S.pin,left:"50%",top:"50%"}}>
              <div style={S.pulseRing}/>
              <VideoAvatar user={me} size={38} borderColor={C.accent} showStatus={false}/>
              <div style={S.pinLabel}>YOU</div>
            </div>
            {filtered.map((u,i)=>{
              const p=POSITIONS[i+1]||{x:30+Math.random()*40,y:30+Math.random()*40};
              const sel=selected?.id===u.id;
              return(
                <div key={u.id} style={{...S.pin,left:`${p.x}%`,top:`${p.y}%`,transform:`translate(-50%,-50%) scale(${sel?1.25:1})`,zIndex:sel?30:10,transition:"transform .15s"}} onClick={e=>{e.stopPropagation();setSelected(u);setMsgs([]);setDrawerTab("Profile")}}>
                  <VideoAvatar user={u} size={38} showStatus={true}/>
                  {sel&&<div style={S.pinLabel}>{u.name}</div>}
                </div>
              );
            })}
          </div>
          <div style={S.ring100}/><div style={S.ring200}/>
        </div>
      )}

      {/* LIST */}
      {tab==="list"&&(
        <div style={S.listWrap}>
          {filtered.map(u=>(
            <div key={u.id} style={S.listCard} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");setTab("map")}}>
              <VideoAvatar user={u} size={46} borderRadius={10} showStatus={true}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.text,fontWeight:500}}>
                  {u.name}
                  {u.profileVideo&&<span style={{fontSize:8,color:C.red,marginLeft:4,verticalAlign:"middle"}}>▶ VID</span>}
                  <span style={{color:C.dim,fontSize:11,marginLeft:4}}>{u.age}</span>
                </div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{u.role}</div>
                <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>{u.tags.map(t=><span key={t} style={S.tag}>#{t}</span>)}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={S.distBadge}>{u.dist}</div>
                <div style={{width:10,height:10,borderRadius:"50%",background:statusColor(u)}}/>
                <div style={{fontSize:9,color:C.dim}}>{u.lastSeen}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MATCHES */}
      {tab==="matches"&&(
        <div style={S.listWrap}>
          {liked.length===0?(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>💘</div>
              <div style={{fontSize:13,color:C.dim}}>No matches yet</div>
              <div style={{fontSize:11,color:C.dark,marginTop:4}}>Like someone on the map to see them here</div>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10,padding:4}}>
              {USERS.filter(u=>liked.includes(u.id)).map(u=>(
                <div key={u.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 8px",textAlign:"center",cursor:"pointer"}} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");setTab("map")}}>
                  <div style={{margin:"0 auto 8px"}}><VideoAvatar user={u} size={48} showStatus={false}/></div>
                  <div style={{fontSize:11,color:C.text,fontWeight:500}}>{u.name}</div>
                  <div style={{fontSize:9,color:C.dim,marginTop:3}}>{u.role} · {u.dist}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI CRUISING RADAR */}
      {tab==="radar"&&(
        <div style={S.listWrap}>
          {/* Ghost Mode Toggle */}
          <div style={{background:C.surface,border:`1px solid ${ghostMode?C.accent:C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:12,color:C.text,fontWeight:500}}>👻 Ghost Mode</div>
              <div style={{fontSize:10,color:C.dim,marginTop:2}}>Browse invisibly. No one sees you on the map.</div>
            </div>
            <div style={{width:44,height:24,borderRadius:12,background:ghostMode?"rgba(245,158,11,0.3)":C.surface2,border:`1px solid ${ghostMode?C.accent:C.border}`,cursor:"pointer",position:"relative",transition:"all .2s"}} onClick={()=>setGhostMode(!ghostMode)}>
              <div style={{width:18,height:18,borderRadius:"50%",background:ghostMode?C.accent:C.dim,position:"absolute",top:2,left:ghostMode?23:3,transition:"all .2s",boxShadow:ghostMode?`0 0 8px ${C.accent}`:"none"}}/>
            </div>
          </div>

          {/* Sonar Visualization */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16,position:"relative",overflow:"hidden",height:200}}>
            <div style={{position:"absolute",top:8,left:16,fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,zIndex:2}}>PROXIMITY SONAR</div>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}>
              {[120,80,40].map((r,i)=><div key={i} style={{position:"absolute",width:r*2,height:r*2,borderRadius:"50%",border:`1px solid rgba(245,158,11,${0.08+i*0.04})`,top:`-${r}px`,left:`-${r}px`}}/>)}
              <div style={{width:8,height:8,borderRadius:"50%",background:C.accent,boxShadow:`0 0 12px ${C.accent}`}}/>
              {/* Sweep line */}
              <div style={{position:"absolute",top:"-120px",left:"3px",width:1,height:120,background:`linear-gradient(to top,${C.accent},transparent)`,transformOrigin:"bottom center",transform:`rotate(${radarPulse}deg)`,opacity:0.6}}/>
              {/* User blips */}
              {USERS.filter(u=>u.online).slice(0,6).map((u,i)=>{
                const angle=(i*60+radarPulse*0.1)*(Math.PI/180);
                const dist=20+parseInt(u.dist)*0.25;
                const x=Math.cos(angle)*Math.min(dist,100);
                const y=Math.sin(angle)*Math.min(dist,100);
                return <div key={u.id} style={{position:"absolute",left:x-4,top:y-4,width:8,height:8,borderRadius:"50%",background:u.color,boxShadow:`0 0 6px ${u.color}`,opacity:0.8,transition:"all .3s"}} title={u.name}/>;
              })}
            </div>
          </div>

          {/* Predicted Heat Timeline */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:12}}>🔥 PREDICTED HEAT TIMELINE</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:60}}>
              {heatHours.map((h,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:"100%",height:`${h.v*0.55}px`,borderRadius:3,background:h.v>80?`linear-gradient(to top,${C.red},${C.accent})`:h.v>50?C.accentBg:`rgba(245,158,11,0.06)`,border:`1px solid ${h.v>80?C.red:h.v>50?C.accent:"transparent"}`,transition:"height .3s"}}/>
                  <span style={{fontSize:7,color:C.dark,transform:"rotate(-45deg)",transformOrigin:"center",whiteSpace:"nowrap"}}>{h.h}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:10,textAlign:"center"}}>Peak activity predicted: <span style={{color:C.accent,fontWeight:600}}>11PM–1AM</span></div>
          </div>

          {/* AI Icebreakers */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:12}}>🧠 AI ICEBREAKERS</div>
            <div style={{fontSize:10,color:C.muted,marginBottom:10}}>Tap a user to generate a personalized opener</div>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>
              {USERS.filter(u=>u.online).slice(0,6).map(u=>(
                <div key={u.id} style={{flexShrink:0,cursor:"pointer",textAlign:"center"}} onClick={()=>generateIcebreaker(u)}>
                  <VideoAvatar user={u} size={40} showStatus={false}/>
                  <div style={{fontSize:8,color:C.dim,marginTop:4,maxWidth:44,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                </div>
              ))}
            </div>
            {Object.keys(aiIcebreakers).length>0&&(
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                {Object.entries(aiIcebreakers).map(([id,ice])=>{
                  const u=USERS.find(x=>x.id===parseInt(id));
                  if(!u) return null;
                  return(
                    <div key={id} style={{background:"#0d0f14",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:14}}>{u.avatar}</span>
                        <span style={{fontSize:10,color:C.text,fontWeight:500}}>{u.name}</span>
                        <span style={{fontSize:8,color:C.accent,background:C.accentBg,padding:"2px 6px",borderRadius:8,marginLeft:"auto"}}>{ice.style}</span>
                      </div>
                      <div style={{fontSize:11,color:C.muted,lineHeight:1.5,fontStyle:"italic"}}>"{ice.text}"</div>
                      <div style={{display:"flex",gap:6,marginTop:8}}>
                        <button style={{...S.actBtn,flex:1,padding:"6px 0",fontSize:9}} onClick={()=>{setSelected(u);setDrawerTab("Chat");setTab("map");setChatMsg(ice.text)}}>📋 Use in Chat</button>
                        <button style={{...S.actBtn,flex:1,padding:"6px 0",fontSize:9}} onClick={()=>generateIcebreaker(u)}>🔄 Regenerate</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Who's Checking You */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,marginBottom:12}}>👁️ WHO'S CHECKING YOU</div>
            {ghostMode?(
              <div style={{textAlign:"center",padding:"12px 0",fontSize:11,color:C.dim}}>👻 Ghost mode active — you're invisible</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {USERS.filter(u=>u.online).slice(0,4).map(u=>(
                  <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>{setSelected(u);setMsgs([]);setDrawerTab("Profile");setTab("map")}}>
                    <VideoAvatar user={u} size={32} showStatus={false}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:C.text}}>{u.name}</div>
                      <div style={{fontSize:9,color:C.dim}}>{u.dist} · viewed {Math.floor(Math.random()*10)+1}m ago</div>
                    </div>
                    <div style={{fontSize:9,color:C.accent}}>{Math.floor(Math.random()*5)+1}x</div>
                  </div>
                ))}
              </div>
            )}
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
              <VideoAvatar user={selected} size={68} borderRadius={12} borderColor={selected.color} showStatus={true} fontSize={34}/>
              <div style={{flex:1,paddingTop:2}}>
                <div style={S.sheetName}>{selected.name}{selected.profileVideo&&<span style={{fontSize:9,color:C.red,marginLeft:6,fontWeight:400,fontFamily:C.font}}>▶ VIDEO</span>}</div>
                <div style={{display:"flex",alignItems:"center",fontSize:11,marginTop:5,flexWrap:"wrap",gap:2}}>
                  <span style={{color:selected.color}}>{selected.role}</span><span style={S.dot}>·</span><span style={{color:C.muted}}>{selected.age} y/o</span><span style={S.dot}>·</span>
                  <span style={{color:statusColor(selected),fontSize:11}}>{selected.online?(selected.away?"Away":"● Online"):"Offline"}</span>
                </div>
                <div style={{fontSize:11,color:C.dim,marginTop:4}}>📍 {selected.dist} away</div>
              </div>
              <button style={S.closeBtn} onClick={()=>setSelected(null)}>✕</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 18px 0"}}>
              <div style={{fontSize:9,color:C.dim,letterSpacing:2,fontWeight:500,width:80}}>VIBE CHECK</div>
              <div style={{flex:1,height:6,background:C.surface2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,transition:"width .6s ease",width:`${vibe}%`,background:vibe>70?C.green:vibe>40?C.accent:C.red}}/></div>
              <div style={{fontSize:13,fontWeight:600,width:36,textAlign:"right",color:vibe>70?C.green:vibe>40?C.accent:C.red}}>{vibe}%</div>
            </div>
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,margin:"12px 18px 0"}}>{["Profile","Chat","Media"].map(t=><button key={t} onClick={()=>setDrawerTab(t)} style={{flex:1,padding:"8px 0",background:"none",border:"none",fontFamily:C.font,fontSize:10,color:drawerTab===t?C.accent:C.dim,cursor:"pointer",borderBottom:drawerTab===t?`2px solid ${C.accent}`:"2px solid transparent"}}>{t}</button>)}</div>

            {drawerTab==="Profile"&&(<>
              <div style={S.sec}><div style={S.sLabel}>BIO</div><div style={{fontSize:13,color:C.muted,lineHeight:1.65,fontStyle:"italic"}}>"{selected.bio}"</div></div>
              <div style={S.sec}><div style={S.sLabel}>INTO</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{selected.tags.map(t=><span key={t} style={{...S.tag,padding:"5px 12px"}}>#{t}</span>)}</div></div>
              <div style={S.sec}>
                <div style={S.sLabel}>PHOTOS · {selected.photos}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  {Array.from({length:Math.min(selected.photos,6)}).map((_,i)=>(
                    <div key={i} style={{aspectRatio:"1",borderRadius:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${selected.color}15,${selected.color}08)`}}><span style={{fontSize:20,opacity:.4}}>📸</span></div>
                  ))}
                </div>
              </div>
            </>)}

            {drawerTab==="Chat"&&(
              <div style={{margin:"0 18px 18px",background:"#0d0f14",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"9px 14px",fontSize:10,color:C.dim,borderBottom:`1px solid ${C.border}`,letterSpacing:1}}>Chat with {selected.name}</div>
                <div style={{padding:"12px 14px",minHeight:80,maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,scrollbarWidth:"none"}}>
                  {msgs.length===0&&!typing&&<div style={{fontSize:11,color:C.dark,textAlign:"center",margin:"auto"}}>Say something 👋</div>}
                  {msgs.map((m,i)=>(<div key={i} style={{maxWidth:"72%",padding:"8px 12px",borderRadius:10,fontSize:12,...(m.from==="me"?{alignSelf:"flex-end",background:C.accentBg,border:`1px solid ${C.accentBorder}`,color:C.accent,borderRadius:"10px 10px 2px 10px"}:{alignSelf:"flex-start",background:C.surface2,border:`1px solid ${C.border}`,color:"#d1d5db",borderRadius:"10px 10px 10px 2px"})}}>{m.media&&<div style={{marginBottom:6}}>{m.media.placeholder?<div style={{width:120,height:90,borderRadius:6,background:`linear-gradient(135deg,${C.surface2},${C.border})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>📸</div>:m.media.type==="image"?<img src={m.media.url} alt="" style={{width:"100%",maxWidth:180,borderRadius:6}}/>:<video src={m.media.url} controls style={{width:"100%",maxWidth:180,borderRadius:6}}/>}</div>}{m.text&&<div>{m.text}</div>}<div style={{fontSize:9,color:"#4b5563",marginTop:3}}>{m.t}</div></div>))}
                  {typing&&<div style={{alignSelf:"flex-start",background:C.surface2,border:`1px solid ${C.border}`,color:"#d1d5db",borderRadius:"10px 10px 10px 2px",maxWidth:"72%",padding:"8px 12px",fontSize:12}}><div style={{display:"flex",gap:4}}>{[0,.15,.3].map(d=><span key={d} style={{fontSize:8,color:C.dim,animation:`typing 1.2s ${d}s infinite`}}>●</span>)}</div></div>}
                  <div ref={chatEnd}/>
                </div>
                {mediaPreview&&(<div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderTop:`1px solid ${C.border}`,background:"rgba(17,19,24,0.95)"}}>{mediaPreview.type==="image"?<img src={mediaPreview.url} alt="" style={{width:36,height:36,borderRadius:4,objectFit:"cover"}}/>:<div style={{width:36,height:36,borderRadius:4,background:C.surface2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎬</div>}<span style={{fontSize:10,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mediaPreview.name}</span><button style={{background:"none",border:"none",color:C.dim,fontSize:12,cursor:"pointer"}} onClick={()=>setMediaPreview(null)}>✕</button></div>)}
                <div style={{display:"flex",borderTop:`1px solid ${C.border}`}}>
                  <button style={{width:44,background:"none",border:"none",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>fileRef.current?.click()}>📷</button>
                  <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={handleFile}/>
                  <input style={{flex:1,background:"none",border:"none",outline:"none",padding:"10px 0",fontSize:12,color:C.text,fontFamily:C.font}} value={chatMsg} onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Message..."/>
                  <button style={{width:44,background:C.accent,border:"none",color:"#000",fontSize:16,cursor:"pointer",fontWeight:"bold"}} onClick={sendMsg}>↑</button>
                </div>
              </div>
            )}

            {drawerTab==="Media"&&(<div style={S.sec}><div style={S.sLabel}>SHARED MEDIA</div><div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:8}}>📂</div><div style={{fontSize:11,color:C.dim}}>No shared media yet</div><div style={{fontSize:10,color:C.dark,marginTop:4}}>Send photos or videos in Chat</div></div></div>)}

            <div style={{display:"flex",gap:6,padding:"16px 18px",flexWrap:"wrap"}}>
              <button style={S.actBtn} onClick={()=>toggleLike(selected.id)}>{liked.includes(selected.id)?"💖 Liked":"🤍 Like"}</button>
              <button style={{...S.actBtn,...S.actPrimary}} onClick={()=>setDrawerTab("Chat")}>💬 Message</button>
              <button style={S.actBtn} onClick={()=>{setVideoRoom({targetUser:selected});setSelected(null)}}>📹 Call</button>
              <button style={S.actBtn}>🚫 Block</button>
            </div>
          </div>
        </>
      )}

      {/* MY PROFILE */}
      {myProfile&&(
        <>
          <div style={S.overlay} onClick={()=>setMyProfile(false)}/>
          <div style={S.sheet}>
            <div style={S.handle}/>
            <div style={S.sheetHero}>
              <div style={{position:"relative"}}>
                <VideoAvatar user={me} size={68} borderRadius={12} borderColor={C.accent} showStatus={true} fontSize={34}/>
                <div style={{position:"absolute",inset:0,borderRadius:12,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0"} onClick={()=>me.profileVideo?removeProfileVideo():profileVidRef.current?.click()}>
                  <span style={{fontSize:11,color:"#fff",fontWeight:600}}>{me.profileVideo?"✕ Remove":"📹 Add Video"}</span>
                </div>
              </div>
              <input ref={profileVidRef} type="file" accept="video/*" style={{display:"none"}} onChange={handleProfileVideo}/>
              <div style={{flex:1,paddingTop:2}}>
                <div style={S.sheetName}>{me.name}{me.profileVideo&&<span style={{fontSize:9,color:C.red,marginLeft:6,fontWeight:400,fontFamily:C.font}}>▶ VIDEO</span>}</div>
                <div style={{display:"flex",alignItems:"center",fontSize:11,marginTop:5,gap:2}}><span style={{color:C.accent}}>{me.role}</span><span style={S.dot}>·</span><span style={{color:C.muted}}>{me.age} y/o</span></div>
              </div>
              <button style={S.closeBtn} onClick={()=>setMyProfile(false)}>✕</button>
            </div>

            <div style={S.sec}>
              <div style={S.sLabel}>PROFILE VIDEO</div>
              {me.profileVideo?(
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:80,height:80,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,flexShrink:0}}><video src={me.profileVideo} autoPlay loop muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
                  <div><div style={{fontSize:11,color:C.green,marginBottom:4}}>✓ Video set</div><div style={{fontSize:10,color:C.dim}}>Loops on your map pin and profile</div><button style={{...S.actBtn,marginTop:8,padding:"6px 12px",fontSize:9,flex:"none"}} onClick={removeProfileVideo}>Remove video</button></div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:80,height:80,borderRadius:8,border:`1px dashed ${C.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,background:C.surface2}} onClick={()=>profileVidRef.current?.click()}><span style={{fontSize:24,marginBottom:4}}>📹</span><span style={{fontSize:8,color:C.dim}}>Upload</span></div>
                  <div><div style={{fontSize:11,color:C.muted}}>Add a short video clip</div><div style={{fontSize:10,color:C.dim,marginTop:2}}>Loops silently on your map pin. Max 10MB.</div></div>
                </div>
              )}
            </div>

            <div style={S.sec}><div style={S.sLabel}>MY BIO</div><div style={{fontSize:13,color:C.muted,lineHeight:1.65,fontStyle:"italic"}}>"{me.bio}"</div></div>
            <div style={S.sec}><div style={S.sLabel}>MY TAGS</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{me.tags.map(t=><span key={t} style={{...S.tag,padding:"5px 12px"}}>#{t}</span>)}</div></div>
            <div style={S.sec}><div style={S.sLabel}>LOOKING FOR</div><div style={{display:"flex",gap:6}}><span style={{...S.tag,display:"inline-block"}}>{me.lookingFor}</span>{me.safeOnly&&<span style={{...S.tag,display:"inline-block",borderColor:C.green,color:C.green}}>✓ safe only</span>}</div></div>
            <div style={S.sec}><div style={S.sLabel}>LIKED ({liked.length})</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{liked.length===0?<span style={{color:C.dim,fontSize:12}}>No likes yet</span>:USERS.filter(u=>liked.includes(u.id)).map(u=><span key={u.id} style={{...S.tag,padding:"5px 12px"}}>{u.avatar} {u.name}</span>)}</div></div>
            <div style={{display:"flex",gap:8,padding:"16px 18px"}}>
              <button style={{...S.actBtn,flex:1}}>✏️ Edit Profile</button>
              <button style={{...S.actBtn,flex:1}}>⚙️ Settings</button>
              <button style={{...S.actBtn,flex:1,background:"rgba(239,68,68,0.15)",borderColor:C.red,color:C.red}} onClick={()=>{setMyProfile(false);setVideoRoom({targetUser:null})}}>📹 Go Live</button>
            </div>
          </div>
        </>
      )}

      {notif&&(<div style={{position:"absolute",top:68,right:14,zIndex:200,animation:"notifSlide .35s ease"}}><div style={{display:"flex",alignItems:"center",gap:9,background:"rgba(16,18,28,0.97)",border:`1px solid ${C.border}`,padding:"10px 14px",borderRadius:12,backdropFilter:"blur(14px)",boxShadow:"0 8px 32px rgba(0,0,0,.55)",maxWidth:260}}><span style={{fontSize:20,flexShrink:0}}>{notif.icon}</span><span style={{fontSize:11,color:C.text,lineHeight:1.45}}>{notif.text}</span></div></div>)}
    </div>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const S = {
  root:{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:C.bg,color:C.text,fontFamily:C.font,overflow:"hidden",position:"relative",userSelect:"none"},
  onCard:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"36px 28px",textAlign:"center",maxWidth:320,width:"90%"},
  onBtn:{padding:"12px 0",width:"100%",background:C.accentBg,border:`1px solid ${C.accent}`,color:C.accent,borderRadius:10,cursor:"pointer",fontFamily:C.font,fontSize:13,fontWeight:600},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"rgba(9,11,15,0.95)",borderBottom:`1px solid ${C.border}`,zIndex:100,flexShrink:0,backdropFilter:"blur(10px)"},
  logo:{fontFamily:C.display,fontWeight:800,fontSize:15,color:C.accent,letterSpacing:1},
  pill:{display:"flex",alignItems:"center",gap:5,background:C.surface,border:`1px solid ${C.border}`,padding:"4px 10px",borderRadius:20,fontSize:10,color:C.muted},
  greenDot:{width:7,height:7,borderRadius:"50%",background:C.green,display:"inline-block",boxShadow:`0 0 6px ${C.green}`},
  filterRow:{display:"flex",gap:6,padding:"8px 12px",overflowX:"auto",background:"rgba(9,11,15,0.9)",flexShrink:0,scrollbarWidth:"none"},
  chip:{fontFamily:C.font,fontSize:10,padding:"4px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:C.surface,color:C.dim,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .15s"},
  chipAct:{background:C.accentBg,borderColor:C.accent,color:C.accent},
  tabRow:{display:"flex",background:"#0d0f14",borderBottom:`1px solid ${C.border}`,flexShrink:0},
  tabBtn:{flex:1,padding:"9px 0",background:"none",border:"none",fontFamily:C.font,fontSize:11,color:C.dim,cursor:"pointer",letterSpacing:.5,transition:"all .15s"},
  tabAct:{color:C.accent,borderBottom:`2px solid ${C.accent}`,background:"rgba(245,158,11,0.04)"},
  mapWrap:{flex:1,position:"relative",overflow:"hidden",cursor:"default"},
  mapBg:{position:"absolute",inset:0,background:"radial-gradient(ellipse at 30% 60%,rgba(245,158,11,0.05) 0%,transparent 55%),radial-gradient(ellipse at 70% 30%,rgba(139,92,246,0.03) 0%,transparent 50%)"},
  mapGrid:{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(245,158,11,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,0.035) 1px,transparent 1px)",backgroundSize:"44px 44px"},
  mapRoads:{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(20,24,35,0.9) 2px,transparent 2px),linear-gradient(90deg,rgba(20,24,35,0.9) 2px,transparent 2px)",backgroundSize:"132px 132px"},
  heatmap:{position:"absolute",inset:0,background:"radial-gradient(circle at 52% 48%,rgba(245,158,11,0.08) 0%,transparent 30%),radial-gradient(circle at 65% 60%,rgba(239,68,68,0.06) 0%,transparent 25%)",pointerEvents:"none"},
  pin:{position:"absolute",transform:"translate(-50%,-50%)",cursor:"pointer",zIndex:10},
  pinLabel:{position:"absolute",top:-22,left:"50%",transform:"translateX(-50%)",fontSize:9,background:"rgba(9,11,15,0.88)",border:`1px solid ${C.accentBorder}`,color:C.text,padding:"2px 7px",whiteSpace:"nowrap",borderRadius:3,backdropFilter:"blur(4px)"},
  pulseRing:{position:"absolute",width:"100%",height:"100%",borderRadius:"50%",border:"2px solid rgba(245,158,11,0.4)",animation:"pulse 2.5s ease-out infinite",top:"50%",left:"50%"},
  ring100:{position:"absolute",top:"50%",left:"50%",width:160,height:160,borderRadius:"50%",border:"1px dashed rgba(245,158,11,0.1)",transform:"translate(-50%,-50%)",pointerEvents:"none"},
  ring200:{position:"absolute",top:"50%",left:"50%",width:320,height:320,borderRadius:"50%",border:"1px dashed rgba(245,158,11,0.05)",transform:"translate(-50%,-50%)",pointerEvents:"none"},
  zoomCtrl:{position:"absolute",right:12,bottom:16,display:"flex",flexDirection:"column",gap:4,zIndex:40},
  zoomBtn:{width:34,height:34,background:"rgba(13,15,20,0.92)",border:`1px solid ${C.border}`,color:C.text,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",borderRadius:6,backdropFilter:"blur(6px)",fontFamily:"monospace"},
  listWrap:{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:8,scrollbarWidth:"none"},
  listCard:{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1px solid ${C.border}`,padding:"12px 14px",borderRadius:10,cursor:"pointer"},
  distBadge:{fontSize:10,color:C.accent,background:C.accentBg,border:`1px solid ${C.accentBorder}`,padding:"2px 8px",borderRadius:10},
  tag:{fontSize:10,color:C.muted,background:C.surface2,border:`1px solid ${C.border}`,padding:"3px 8px",borderRadius:20},
  overlay:{position:"absolute",inset:0,zIndex:60,background:"rgba(9,11,15,0.55)",backdropFilter:"blur(2px)",animation:"fadeIn .2s ease"},
  sheet:{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,borderRadius:"14px 14px 0 0",zIndex:70,animation:"slideUp .28s cubic-bezier(0.34,1.2,0.64,1)",maxHeight:"82vh",overflowY:"auto",scrollbarWidth:"none"},
  handle:{width:36,height:4,borderRadius:2,background:C.border,margin:"10px auto 0"},
  sheetHero:{display:"flex",gap:14,alignItems:"flex-start",padding:"16px 18px 0",position:"relative"},
  sheetName:{fontFamily:C.display,fontWeight:800,fontSize:20,color:C.text,lineHeight:1.1},
  dot:{color:C.dark,margin:"0 4px"},
  closeBtn:{position:"absolute",top:0,right:18,background:"none",border:"none",color:C.dim,fontSize:16,cursor:"pointer",padding:4},
  sec:{padding:"14px 18px 0"},
  sLabel:{fontSize:9,color:C.dim,letterSpacing:2,marginBottom:8,fontWeight:500},
  actBtn:{flex:1,minWidth:70,padding:"10px 0",background:C.surface2,border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,cursor:"pointer",fontFamily:C.font,fontSize:10,transition:"all .15s",textAlign:"center"},
  actPrimary:{background:C.accentBg,borderColor:C.accent,color:C.accent},
  vidTag:{position:"absolute",bottom:6,left:6,fontSize:10,color:C.text,background:"rgba(9,11,15,0.7)",padding:"3px 8px",borderRadius:4,backdropFilter:"blur(4px)"},
  ctrlBtn:{width:52,height:52,borderRadius:"50%",background:C.surface2,border:`1px solid ${C.border}`,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"},
};
