import React,{useState,useEffect,useRef,useCallback}from'react';
import{createClient}from'@supabase/supabase-js';

const SUPABASE_URL="https://ahznewkkcyakkilaatas.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoem5ld2trY3lha2tpbGFhdGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTQzMTIsImV4cCI6MjA5MTg3MDMxMn0.4nFFkuhRTNCXFnkSQDjc_JNi0yoHUBUfT4mgcQ2-3ak";
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

// ─── Tema ──────────────────────────────────────────────────────────
const T={
  green:"#00A868",greenBg:"#F0FAF5",greenBorder:"#B7E4CC",greenDark:"#007A4C",
  blue:"#1D4ED8",blueBg:"#EFF6FF",
  orange:"#EA580C",orangeBg:"#FFF7ED",
  red:"#DC2626",redBg:"#FEF2F2",
  purple:"#7C3AED",purpleBg:"#F5F3FF",
  ink:"#2C2C2A",inkMid:"#5F5E5A",inkFaint:"#9C9B97",inkLight:"#C8C7C3",
  border:"rgba(0,0,0,0.08)",
  surface:"#FFFFFF",bg:"#F7F6F2",bgWarm:"#F2F1EC",
  shadow:"0 1px 3px rgba(0,0,0,0.08)",
  f:"'DM Sans',system-ui,sans-serif",
};

// ─── Helpers ───────────────────────────────────────────────────────
const dataHoje=()=>new Date().toISOString().slice(0,10);

// ─── Banco de dados ────────────────────────────────────────────────
async function carregarEpisodios(){
  const{data}=await supabase.from("episodios")
    .select("*, episodio_acoes(*), episodio_desfechos(*)")
    .order("created_at",{ascending:false});
  return data||[];
}

async function carregarMetricasGerais(){
  const inicio30=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const inicio90=new Date(Date.now()-90*86400000).toISOString().slice(0,10);

  const[
    {count:totalPacientes},
    {count:totalMedicos},
    {count:totalConsultas},
    {count:totalCheckins},
    {data:docsRecentes},
    {data:diagsTop},
    {count:totalPlanoAtivo},
    {data:agendamentos},
    {data:avaliacoesCsat},
    {data:avaliacoesNps},
    {count:noShowPaciente},
    {count:noShowMedico},
    {count:cancelamentos},
  ]=await Promise.all([
    supabase.from("pacientes").select("*",{count:"exact",head:true}),
    supabase.from("medicos").select("*",{count:"exact",head:true}),
    supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("status","realizada"),
    supabase.from("checkins").select("*",{count:"exact",head:true}).gte("data",inicio30),
    supabase.from("documentos").select("tipo,created_at").gte("created_at",new Date(Date.now()-30*86400000).toISOString()),
    supabase.from("diagnosticos").select("cid,nome").order("created_at",{ascending:false}).limit(300),
    supabase.from("plano_cuidado").select("*",{count:"exact",head:true}).eq("ativo",true),
    supabase.from("agendamentos").select("status,medico_id,cancelado_por,created_at").gte("created_at",new Date(Date.now()-90*86400000).toISOString()),
    supabase.from("avaliacoes").select("nota_csat,medico_id,created_at").eq("tipo","csat").gte("created_at",new Date(Date.now()-90*86400000).toISOString()),
    supabase.from("avaliacoes").select("nota_nps,created_at").eq("tipo","nps").order("created_at",{ascending:false}),
    supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("status","nao_compareceu_paciente"),
    supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("status","nao_compareceu_medico"),
    supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("status","cancelado"),
  ]);

  // Top CIDs
  const cidCount={};
  (diagsTop||[]).forEach(d=>{
    const k=d.cid+"|"+d.nome;
    cidCount[k]=(cidCount[k]||0)+1;
  });
  const topCids=Object.entries(cidCount).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>{
    const[cid,nome]=k.split("|");
    return{cid,nome,count:n};
  });

  // Docs por tipo
  const tipoCount={};
  (docsRecentes||[]).forEach(d=>{tipoCount[d.tipo]=(tipoCount[d.tipo]||0)+1;});

  // CSAT médio
  const csatNotas=(avaliacoesCsat||[]).map(a=>a.nota_csat).filter(Boolean);
  const csatMedio=csatNotas.length>0?(csatNotas.reduce((a,b)=>a+b,0)/csatNotas.length).toFixed(1):null;

  // NPS
  const npsNotas=(avaliacoesNps||[]).map(a=>a.nota_nps).filter(n=>n!=null);
  const npsScore=npsNotas.length>0?Math.round(
    ((npsNotas.filter(n=>n>=9).length-npsNotas.filter(n=>n<=6).length)/npsNotas.length)*100
  ):null;

  // Taxa de ocupação — consultas realizadas / total agendadas (excl. bloqueados)
  const totalAgendados=(agendamentos||[]).filter(a=>a.status!=="bloqueado").length;
  const totalRealizadas=(agendamentos||[]).filter(a=>a.status==="realizada").length;
  const taxaOcupacao=totalAgendados>0?Math.round((totalRealizadas/totalAgendados)*100):null;

  return{
    totalPacientes:totalPacientes||0,
    totalMedicos:totalMedicos||0,
    totalConsultas:totalConsultas||0,
    totalCheckins:totalCheckins||0,
    totalPlanoAtivo:totalPlanoAtivo||0,
    topCids,tipoCount,
    csatMedio,csatTotal:csatNotas.length,
    npsScore,npsTotal:npsNotas.length,
    noShowPaciente:noShowPaciente||0,
    noShowMedico:noShowMedico||0,
    cancelamentos:cancelamentos||0,
    taxaOcupacao,
    avaliacoesCsat:avaliacoesCsat||[],
  };
}

async function carregarMedicosDetalhes(){
  const{data:medicos}=await supabase.from("medicos").select("id,nome,crm,especialidade,email");
  if(!medicos)return[];
  const resultados=await Promise.all(medicos.map(async m=>{
    const[
      {count:pacientes},
      {count:consultas},
      {count:noShowPac},
      {count:noShowMed},
      {count:cancelamentos},
      {data:csat},
      {data:plano},
      {data:regs},
    ]=await Promise.all([
      supabase.from("pacientes").select("*",{count:"exact",head:true}).eq("medico_id",m.id),
      supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("medico_id",m.id).eq("status","realizada"),
      supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("medico_id",m.id).eq("status","nao_compareceu_paciente"),
      supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("medico_id",m.id).eq("status","nao_compareceu_medico"),
      supabase.from("agendamentos").select("*",{count:"exact",head:true}).eq("medico_id",m.id).eq("status","cancelado"),
      supabase.from("avaliacoes").select("nota_csat").eq("medico_id",m.id).eq("tipo","csat"),
      supabase.from("plano_cuidado").select("id,paciente_id,frequencia").eq("medico_id",m.id).eq("ativo",true),
      supabase.from("plano_registros").select("paciente_id").gte("data",new Date(Date.now()-30*86400000).toISOString().slice(0,10)),
    ]);

    // CSAT médio
    const csatNotas=(csat||[]).map(a=>a.nota_csat).filter(Boolean);
    const csatMedio=csatNotas.length>0?(csatNotas.reduce((a,b)=>a+b,0)/csatNotas.length).toFixed(1):null;

    // Adesão ao plano — pacientes com registros / total com plano
    const pacientesComPlano=new Set((plano||[]).map(p=>p.paciente_id));
    const pacientesComRegistro=new Set((regs||[]).map(r=>r.paciente_id));
    const adesao=pacientesComPlano.size>0?
      Math.round([...pacientesComPlano].filter(id=>pacientesComRegistro.has(id)).length/pacientesComPlano.size*100):null;

    return{
      ...m,
      totalPacientes:pacientes||0,
      totalConsultas:consultas||0,
      noShowPaciente:noShowPac||0,
      noShowMedico:noShowMed||0,
      cancelamentos:cancelamentos||0,
      csatMedio,
      csatTotal:csatNotas.length,
      adesaoPlano:adesao,
    };
  }));
  return resultados;
}

// ─── Componentes UI ────────────────────────────────────────────────
const Card=({children,style={}})=>(
  <div style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:12,boxShadow:T.shadow,...style}}>
    {children}
  </div>
);

const Badge=({label,color=T.green,bg})=>(
  <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,
    background:bg||color+"18",color,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>
    {label}
  </span>
);

const Btn=({children,onClick,disabled,variant="primary",small,style={}})=>{
  const base={padding:small?"5px 12px":"9px 18px",borderRadius:8,border:"none",cursor:disabled?"not-allowed":"pointer",
    fontFamily:T.f,fontSize:small?11:13,fontWeight:500,transition:"all 0.15s",opacity:disabled?0.5:1,...style};
  const variants={
    primary:{background:T.green,color:"#FFF"},
    outline:{background:"transparent",border:`1px solid ${T.border}`,color:T.inkMid},
    ghost:{background:"transparent",border:"none",color:T.inkMid},
    danger:{background:T.red,color:"#FFF"},
  };
  return<button onClick={onClick} disabled={disabled} style={{...base,...variants[variant]}}>{children}</button>;
};

const Input=({label,value,onChange,placeholder,type="text",required})=>(
  <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.1em",marginBottom:5}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:8,
        fontFamily:T.f,fontSize:13,color:T.ink,outline:"none",boxSizing:"border-box",background:T.surface}}/>
  </div>
);

const Textarea=({label,value,onChange,placeholder,rows=3,required})=>(
  <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.1em",marginBottom:5}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:8,
        fontFamily:T.f,fontSize:13,color:T.ink,outline:"none",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
  </div>
);

const Select=({label,value,onChange,options,required})=>(
  <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.1em",marginBottom:5}}>{label}{required&&<span style={{color:T.red}}> *</span>}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",padding:"9px 12px",border:`1px solid ${T.border}`,borderRadius:8,
        fontFamily:T.f,fontSize:13,color:T.ink,outline:"none",background:T.surface}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Spinner=()=>(
  <div style={{width:20,height:20,border:`2px solid ${T.border}`,borderTop:`2px solid ${T.green}`,
    borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"40px auto"}}/>
);

// ─── Login ─────────────────────────────────────────────────────────
export function ScreenLogin({onLogin,titulo="HVV",subtitulo}){
  const[email,setEmail]=useState("");
  const[senha,setSenha]=useState("");
  const[erro,setErro]=useState("");
  const[loading,setLoading]=useState(false);

  const handle=async()=>{
    if(!email||!senha)return;
    setLoading(true);setErro("");
    const err=await onLogin(email,senha);
    if(err){setErro(err);setLoading(false);}
  };

  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.f,padding:24}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:44,height:44,borderRadius:12,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:20,margin:"0 auto 16px"}}>
            {titulo.charAt(0)}
          </div>
          <div style={{fontSize:22,fontWeight:600,color:T.ink}}>{titulo}</div>
          {subtitulo&&<div style={{fontSize:13,color:T.inkMid,marginTop:4}}>{subtitulo}</div>}
        </div>
        <Card style={{padding:"28px"}}>
          <Input label="E-MAIL" value={email} onChange={setEmail} type="email" placeholder="seu@email.com"/>
          <Input label="SENHA" value={senha} onChange={setSenha} type="password" placeholder="••••••••"/>
          {erro&&<div style={{fontSize:12,color:T.red,marginBottom:12}}>{erro}</div>}
          <button onClick={handle} disabled={loading||!email||!senha}
            style={{width:"100%",padding:"11px",background:T.green,color:"#FFF",border:"none",borderRadius:8,
              fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:T.f,opacity:loading?0.6:1}}>
            {loading?"Entrando...":"Entrar →"}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ─── App Admin Principal ───────────────────────────────────────────
export function AppAdmin({admin,apiKey,onLogout}){
  const[tela,setTela]=useState("metricas");

  const MENU=[
    {id:"metricas",label:"Métricas",icon:"📊"},
    {id:"episodios",label:"Episódios Clínicos",icon:"🏥"},
    {id:"medicos",label:"Médicos",icon:"👨‍⚕️"},
    {id:"programas",label:"Programas",icon:"✨"},
  ];

  return(
    <div style={{display:"flex",height:"100vh",fontFamily:T.f,background:T.bg,overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:220,background:T.surface,borderRight:`0.5px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"20px 16px",borderBottom:`0.5px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:14}}>A</div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:T.ink}}>HVV Admin</div>
              <div style={{fontSize:10,color:T.inkFaint}}>Painel de gestão</div>
            </div>
          </div>
        </div>

        <div style={{flex:1,padding:"12px 8px",overflowY:"auto"}}>
          {MENU.map(m=>(
            <button key={m.id} onClick={()=>setTela(m.id)}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"none",textAlign:"left",
                background:tela===m.id?T.greenBg:"transparent",
                color:tela===m.id?T.green:T.inkMid,
                fontSize:13,cursor:"pointer",fontFamily:T.f,fontWeight:tela===m.id?500:400,
                display:"flex",alignItems:"center",gap:10,marginBottom:2,transition:"all 0.15s"}}>
              <span style={{fontSize:16}}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{padding:"16px",borderTop:`0.5px solid ${T.border}`}}>
          <div style={{fontSize:12,color:T.inkMid,marginBottom:8}}>{admin.email}</div>
          <Btn onClick={onLogout} variant="outline" small style={{width:"100%"}}>Sair</Btn>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{flex:1,overflowY:"auto"}}>
        {tela==="metricas"&&<TelaMetricas/>}
        {tela==="episodios"&&<TelaEpisodios apiKey={apiKey}/>}
        {tela==="medicos"&&<TelaMedicos/>}
        {tela==="programas"&&<TelaProgramas/>}
      </div>
    </div>
  );
}

// ─── Tela Métricas ─────────────────────────────────────────────────
function TelaMetricas(){
  const[metricas,setMetricas]=useState(null);
  const[medicos,setMedicos]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      carregarMetricasGerais(),
      carregarMedicosDetalhes(),
    ]).then(([m,md])=>{
      setMetricas(m);
      setMedicos(md);
      setLoading(false);
    });
  },[]);

  if(loading)return<Spinner/>;

  const TIPO_LABEL={consulta:"Consultas",receita:"Prescrições",pedido_exame:"Pedidos de exame",atestado:"Atestados",estilo_vida:"Estilo de vida",relatorio:"Relatórios"};
  const TIPO_COR={consulta:T.blue,receita:T.green,pedido_exame:T.purple,atestado:T.orange,estilo_vida:T.green,relatorio:T.inkMid};

  return(
    <div style={{padding:"28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Visão geral · Stone</div>
        <div style={{fontSize:13,color:T.inkMid,marginTop:4}}>Últimos 90 dias · atualizado agora</div>
      </div>

      {/* KPIs linha 1 — Operacional */}
      <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.1em",marginBottom:8}}>OPERACIONAL</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:20}}>
        {[
          {label:"Colaboradores",value:metricas.totalPacientes,icon:"👥",cor:T.blue},
          {label:"Médicos",value:metricas.totalMedicos,icon:"👨‍⚕️",cor:T.green},
          {label:"Consultas realizadas",value:metricas.totalConsultas,icon:"🏥",cor:T.purple},
          {label:"Check-ins (30d)",value:metricas.totalCheckins,icon:"📊",cor:T.orange},
          {label:"Taxa de ocupação",value:metricas.taxaOcupacao!=null?metricas.taxaOcupacao+"%":"—",icon:"📅",cor:metricas.taxaOcupacao>=80?T.green:metricas.taxaOcupacao>=60?T.orange:T.red},
          {label:"Cancelamentos (90d)",value:metricas.cancelamentos,icon:"❌",cor:metricas.cancelamentos>10?T.red:T.inkMid},
        ].map(k=>(
          <Card key={k.label} style={{padding:"14px 12px"}}>
            <div style={{fontSize:18,marginBottom:6}}>{k.icon}</div>
            <div style={{fontSize:22,fontWeight:700,color:k.cor,marginBottom:2}}>{k.value}</div>
            <div style={{fontSize:10,color:T.inkFaint,lineHeight:1.4}}>{k.label}</div>
          </Card>
        ))}
      </div>

      {/* KPIs linha 2 — No-show e Satisfação */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24}}>
        {[
          {label:"No-show paciente",value:metricas.noShowPaciente,icon:"🚶",cor:metricas.noShowPaciente>5?T.red:T.orange,sub:"pacientes faltaram"},
          {label:"No-show médico",value:metricas.noShowMedico,icon:"⚕️",cor:metricas.noShowMedico>2?T.red:T.orange,sub:"médicos faltaram"},
          {label:"CSAT médio",value:metricas.csatMedio?metricas.csatMedio+"/5":"—",icon:"⭐",cor:metricas.csatMedio>=4?T.green:metricas.csatMedio>=3?T.orange:T.red,sub:metricas.csatTotal+" avaliações"},
          {label:"NPS",value:metricas.npsScore!=null?metricas.npsScore:"—",icon:"💬",cor:metricas.npsScore>=50?T.green:metricas.npsScore>=0?T.orange:T.red,sub:metricas.npsTotal+" respondentes"},
        ].map(k=>(
          <Card key={k.label} style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:22}}>{k.icon}</span>
              <div>
                <div style={{fontSize:24,fontWeight:700,color:k.cor,lineHeight:1}}>{k.value}</div>
                <div style={{fontSize:10,color:T.inkFaint,marginTop:2}}>{k.sub}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:T.inkMid}}>{k.label}</div>
          </Card>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

        {/* Top diagnósticos */}
        <Card style={{padding:"0",overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`0.5px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:500,color:T.ink}}>Top diagnósticos CID</div>
            <Badge label="últimos 90 dias" color={T.inkMid}/>
          </div>
          {metricas.topCids.length===0?(
            <div style={{padding:"24px",textAlign:"center",color:T.inkFaint,fontSize:13}}>Nenhum diagnóstico registrado ainda</div>
          ):(
            metricas.topCids.map((c,i)=>(
              <div key={c.cid} style={{padding:"10px 18px",borderBottom:`0.5px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:20,fontSize:12,color:T.inkFaint,flexShrink:0}}>#{i+1}</div>
                <Badge label={c.cid} color={T.blue} bg={T.blueBg}/>
                <div style={{flex:1,fontSize:12,color:T.ink}}>{c.nome}</div>
                <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{c.count}</div>
              </div>
            ))
          )}
        </Card>

        {/* Documentos por tipo */}
        <Card style={{padding:"0",overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`0.5px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:500,color:T.ink}}>Documentos emitidos</div>
            <Badge label="últimos 30 dias" color={T.inkMid}/>
          </div>
          {Object.keys(metricas.tipoCount).length===0?(
            <div style={{padding:"24px",textAlign:"center",color:T.inkFaint,fontSize:13}}>Nenhum documento emitido ainda</div>
          ):(
            Object.entries(metricas.tipoCount).sort((a,b)=>b[1]-a[1]).map(([tipo,count])=>{
              const total=Object.values(metricas.tipoCount).reduce((a,b)=>a+b,0);
              const pct=Math.round(count/total*100);
              return(
                <div key={tipo} style={{padding:"10px 18px",borderBottom:`0.5px solid ${T.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{fontSize:12,color:T.ink}}>{TIPO_LABEL[tipo]||tipo}</div>
                    <div style={{fontSize:12,fontWeight:600,color:T.ink}}>{count} <span style={{color:T.inkFaint,fontWeight:400}}>({pct}%)</span></div>
                  </div>
                  <div style={{height:4,background:T.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:pct+"%",height:"100%",background:TIPO_COR[tipo]||T.green,borderRadius:2,transition:"width 0.6s"}}/>
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </div>

      {/* Médicos */}
      <Card style={{padding:"0",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`0.5px solid ${T.border}`}}>
          <div style={{fontSize:14,fontWeight:500,color:T.ink}}>Médicos da plataforma</div>
        </div>
        {medicos.length===0?(
          <div style={{padding:"24px",textAlign:"center",color:T.inkFaint,fontSize:13}}>Nenhum médico cadastrado</div>
        ):(
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:T.bgWarm}}>
                {["Médico","Pacientes","Consultas","No-show pac.","No-show méd.","Cancelamentos","CSAT","Adesão plano"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:T.inkFaint,fontWeight:500,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medicos.map(m=>(
                <tr key={m.id} style={{borderTop:`0.5px solid ${T.border}`}}>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{m.nome}</div>
                    <div style={{fontSize:11,color:T.inkFaint}}>{m.especialidade||"—"}</div>
                  </td>
                  <td style={{padding:"12px 14px"}}><Badge label={m.totalPacientes} color={T.blue}/></td>
                  <td style={{padding:"12px 14px"}}><Badge label={m.totalConsultas} color={T.green}/></td>
                  <td style={{padding:"12px 14px"}}>
                    <Badge label={m.noShowPaciente} color={m.noShowPaciente>5?T.red:m.noShowPaciente>2?T.orange:T.inkMid}/>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <Badge label={m.noShowMedico} color={m.noShowMedico>2?T.red:m.noShowMedico>0?T.orange:T.green}/>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <Badge label={m.cancelamentos} color={m.cancelamentos>5?T.red:T.inkMid}/>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    {m.csatMedio?(
                      <span style={{fontSize:13,fontWeight:600,color:m.csatMedio>=4?T.green:m.csatMedio>=3?T.orange:T.red}}>
                        ⭐ {m.csatMedio}
                        <span style={{fontSize:10,color:T.inkFaint,fontWeight:400}}> ({m.csatTotal})</span>
                      </span>
                    ):<span style={{fontSize:12,color:T.inkFaint}}>—</span>}
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    {m.adesaoPlano!=null?(
                      <span style={{fontSize:13,fontWeight:600,color:m.adesaoPlano>=70?T.green:m.adesaoPlano>=40?T.orange:T.red}}>
                        {m.adesaoPlano}%
                      </span>
                    ):<span style={{fontSize:12,color:T.inkFaint}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Tela Episódios Clínicos ───────────────────────────────────────
function TelaEpisodios({apiKey}){
  const[episodios,setEpisodios]=useState([]);
  const[loading,setLoading]=useState(true);
  const[tela,setTela]=useState("lista"); // lista | novo | detalhe
  const[selecionado,setSelecionado]=useState(null);

  useEffect(()=>{
    carregarEpisodios().then(e=>{setEpisodios(e);setLoading(false);});
  },[]);

  const recarregar=()=>carregarEpisodios().then(setEpisodios);

  if(loading)return<Spinner/>;

  if(tela==="novo")return(
    <FormEpisodio
      apiKey={apiKey}
      onSalvo={()=>{recarregar();setTela("lista");}}
      onCancelar={()=>setTela("lista")}/>
  );

  if(tela==="detalhe"&&selecionado)return(
    <DetalheEpisodio
      episodio={selecionado}
      apiKey={apiKey}
      onVoltar={()=>{recarregar();setTela("lista");setSelecionado(null);}}/>
  );

  return(
    <div style={{padding:"28px",maxWidth:1000,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Episódios Clínicos</div>
          <div style={{fontSize:13,color:T.inkMid,marginTop:4}}>Protocolos de cuidado com ações mínimas e desfechos monitorados</div>
        </div>
        <Btn onClick={()=>setTela("novo")}>+ Novo episódio</Btn>
      </div>

      {episodios.length===0?(
        <Card style={{padding:"48px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>🏥</div>
          <div style={{fontSize:16,fontWeight:500,color:T.ink,marginBottom:8}}>Nenhum episódio cadastrado</div>
          <div style={{fontSize:13,color:T.inkMid,marginBottom:20}}>Crie o primeiro protocolo clínico da plataforma</div>
          <Btn onClick={()=>setTela("novo")}>+ Criar primeiro episódio</Btn>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {episodios.map(ep=>(
            <Card key={ep.id} style={{padding:"0",overflow:"hidden",cursor:"pointer"}}
              onClick={()=>{setSelecionado(ep);setTela("detalhe");}}>
              <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:44,height:44,borderRadius:10,background:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                  🏥
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{fontSize:15,fontWeight:500,color:T.ink}}>{ep.nome}</div>
                    <Badge label={ep.tipo==="institucional"?"Institucional":"Customizado"}
                      color={ep.tipo==="institucional"?T.green:T.blue}/>
                    {!ep.publicado&&<Badge label="Rascunho" color={T.orange}/>}
                  </div>
                  <div style={{fontSize:12,color:T.inkMid}}>
                    {ep.cid_principal&&<span style={{marginRight:12}}>CID: {ep.cid_principal}</span>}
                    <span style={{marginRight:12}}>{ep.duracao_meses} meses</span>
                    {ep.renovavel&&<span style={{marginRight:12}}>✓ Renovável</span>}
                    <span>{ep.episodio_acoes?.length||0} ações · {ep.episodio_desfechos?.length||0} desfechos</span>
                  </div>
                </div>
                <div style={{fontSize:12,color:T.inkFaint}}>→</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Formulário de novo episódio ───────────────────────────────────
function FormEpisodio({apiKey,onSalvo,onCancelar}){
  const[nome,setNome]=useState("");
  const[descricao,setDescricao]=useState("");
  const[cid,setCid]=useState("");
  const[duracao,setDuracao]=useState("12");
  const[renovavel,setRenovavel]=useState(true);
  const[ichomSet,setIchomSet]=useState("");
  const[salvando,setSalvando]=useState(false);
  const[erro,setErro]=useState("");

  // IA — sugestão ICHOM
  const[buscandoIchom,setBuscandoIchom]=useState(false);
  const[sugestaoIchom,setSugestaoIchom]=useState(null);
  const timerRef=useRef(null);

  const buscarIchom=async(cidTxt,nomeTxt)=>{
    if((!cidTxt&&!nomeTxt)||!apiKey.startsWith("sk-"))return;
    setBuscandoIchom(true);
    try{
      const res=await fetch("/.netlify/functions/claude",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:800,
          messages:[{role:"user",content:"Voce e especialista em outcomes de saude e conjuntos ICHOM (International Consortium for Health Outcomes Measurement). Para a condicao clinica: CID "+cidTxt+" / "+nomeTxt+", retorne SOMENTE um JSON com: {ichom_set: nome do conjunto ICHOM mais adequado, ichom_url: url do conjunto, desfechos_sugeridos: [{nome, tipo (clinico ou pro), unidade, frequencia_coleta, ichom_referencia, intermediario}]}. Se nao houver conjunto ICHOM especifico, sugira desfechos baseados em evidencias para esta condicao. Retorne SOMENTE o JSON."}]
        })
      });
      const data=await res.json();
      const raw=(data.content?.[0]?.text||"{}").trim();
      const match=raw.match(/\{[\s\S]*\}/);
      if(match)setSugestaoIchom(JSON.parse(match[0]));
    }catch(e){console.warn(e);}
    finally{setBuscandoIchom(false);}
  };

  const handleCid=(val)=>{
    setCid(val);
    clearTimeout(timerRef.current);
    if(val.length>=3||nome.length>=5){
      timerRef.current=setTimeout(()=>buscarIchom(val,nome),1200);
    }
  };

  const handleNome=(val)=>{
    setNome(val);
    clearTimeout(timerRef.current);
    if(val.length>=8){
      timerRef.current=setTimeout(()=>buscarIchom(cid,val),1500);
    }
  };

  const handleSalvar=async()=>{
    if(!nome.trim()){setErro("Nome é obrigatório");return;}
    setSalvando(true);setErro("");
    try{
      const{data:ep,error}=await supabase.from("episodios").insert({
        nome:nome.trim(),
        descricao:descricao.trim()||null,
        cid_principal:cid.trim().toUpperCase()||null,
        duracao_meses:Number(duracao),
        renovavel,
        tipo:"institucional",
        ichom_set:sugestaoIchom?.ichom_set||ichomSet||null,
        ichom_url:sugestaoIchom?.ichom_url||null,
        publicado:false,
        ativo:true,
      }).select("id").single();

      if(error){setErro(error.message);setSalvando(false);return;}

      // Salvar desfechos sugeridos pela IA
      if(sugestaoIchom?.desfechos_sugeridos?.length>0){
        await supabase.from("episodio_desfechos").insert(
          sugestaoIchom.desfechos_sugeridos.map((d,i)=>({
            episodio_id:ep.id,
            nome:d.nome,
            tipo:d.tipo||"clinico",
            unidade:d.unidade||null,
            frequencia_coleta:d.frequencia_coleta||"trimestral",
            ichom_referencia:d.ichom_referencia||null,
            intermediario:d.intermediario!==false,
            ordem:i,
          }))
        );
      }

      onSalvo();
    }catch(e){setErro(e.message);}
    finally{setSalvando(false);}
  };

  return(
    <div style={{padding:"28px",maxWidth:760,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={onCancelar} style={{background:"none",border:"none",cursor:"pointer",color:T.inkMid,fontSize:20,padding:0}}>←</button>
        <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Novo episódio clínico</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Coluna esquerda — dados básicos */}
        <div>
          <Card style={{padding:"20px",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:16}}>Identificação</div>
            <Input label="NOME DO EPISÓDIO" value={nome} onChange={handleNome} placeholder="Ex: Controle da Hipertensão Arterial" required/>
            <Textarea label="DESCRIÇÃO" value={descricao} onChange={setDescricao} placeholder="Objetivo clínico e população alvo..." rows={2}/>
            <Input label="CID PRINCIPAL" value={cid} onChange={handleCid} placeholder="Ex: I10"/>
            {buscandoIchom&&(
              <div style={{fontSize:12,color:T.blue,display:"flex",alignItems:"center",gap:6,marginTop:-8,marginBottom:12}}>
                <div style={{width:12,height:12,border:`2px solid ${T.blue}30`,borderTop:`2px solid ${T.blue}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                Buscando referências ICHOM...
              </div>
            )}
          </Card>

          <Card style={{padding:"20px"}}>
            <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:16}}>Configuração</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Input label="DURAÇÃO (MESES)" value={duracao} onChange={setDuracao} type="number"/>
              <Select label="RENOVÁVEL" value={renovavel?"sim":"nao"} onChange={v=>setRenovavel(v==="sim")}
                options={[{value:"sim",label:"Sim — doença crônica"},{value:"nao",label:"Não — episódio único"}]}/>
            </div>
            {sugestaoIchom?.ichom_set&&(
              <div style={{padding:"10px 14px",background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,fontSize:12}}>
                <div style={{fontWeight:500,color:T.greenDark,marginBottom:2}}>✦ Conjunto ICHOM identificado</div>
                <div style={{color:T.inkMid}}>{sugestaoIchom.ichom_set}</div>
              </div>
            )}
          </Card>
        </div>

        {/* Coluna direita — desfechos sugeridos pela IA */}
        <div>
          <Card style={{padding:"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:500,color:T.ink}}>Desfechos sugeridos pela IA</div>
              {sugestaoIchom?.desfechos_sugeridos?.length>0&&(
                <Badge label={sugestaoIchom.desfechos_sugeridos.length+" desfechos"} color={T.green}/>
              )}
            </div>

            {!sugestaoIchom&&!buscandoIchom&&(
              <div style={{textAlign:"center",padding:"32px 16px",color:T.inkFaint}}>
                <div style={{fontSize:28,marginBottom:8}}>🎯</div>
                <div style={{fontSize:13}}>Preencha o CID ou nome do episódio</div>
                <div style={{fontSize:11,marginTop:4}}>A IA vai sugerir os desfechos ICHOM recomendados</div>
              </div>
            )}

            {sugestaoIchom?.desfechos_sugeridos?.map((d,i)=>(
              <div key={i} style={{padding:"12px 14px",background:T.bgWarm,borderRadius:8,marginBottom:8,
                borderLeft:`3px solid ${d.tipo==="pro"?T.purple:T.green}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{d.nome}</div>
                  <Badge label={d.tipo==="pro"?"PRO":"Clínico"} color={d.tipo==="pro"?T.purple:T.green}/>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {d.unidade&&<Badge label={d.unidade} color={T.inkMid}/>}
                  <Badge label={d.frequencia_coleta||"trimestral"} color={T.blue} bg={T.blueBg}/>
                  {d.intermediario===false&&<Badge label="Desfecho final" color={T.orange}/>}
                </div>
                {d.ichom_referencia&&(
                  <div style={{fontSize:10,color:T.inkFaint,marginTop:4}}>{d.ichom_referencia}</div>
                )}
              </div>
            ))}

            {sugestaoIchom&&(
              <div style={{fontSize:11,color:T.inkFaint,marginTop:8,padding:"8px 12px",background:T.bgWarm,borderRadius:6}}>
                ✓ Estes desfechos serão adicionados automaticamente ao episódio. Você poderá editar, remover ou adicionar mais após salvar.
              </div>
            )}
          </Card>
        </div>
      </div>

      {erro&&<div style={{marginTop:12,fontSize:13,color:T.red,padding:"10px 14px",background:T.redBg,borderRadius:8}}>{erro}</div>}

      <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"flex-end"}}>
        <Btn onClick={onCancelar} variant="outline">Cancelar</Btn>
        <Btn onClick={handleSalvar} disabled={salvando||!nome.trim()}>
          {salvando?"Salvando...":"✓ Criar episódio →"}
        </Btn>
      </div>
    </div>
  );
}

// ─── Detalhe do Episódio ───────────────────────────────────────────
function DetalheEpisodio({episodio,apiKey,onVoltar}){
  const[ep,setEp]=useState(episodio);
  const[abaAtiva,setAbaAtiva]=useState("desfechos");
  const[novaAcao,setNovaAcao]=useState(false);
  const[novoDesfecho,setNovoDesfecho]=useState(false);
  const[publicando,setPublicando]=useState(false);

  const recarregar=async()=>{
    const{data}=await supabase.from("episodios")
      .select("*, episodio_acoes(*), episodio_desfechos(*)")
      .eq("id",ep.id).single();
    if(data)setEp(data);
  };

  const publicar=async()=>{
    setPublicando(true);
    await supabase.from("episodios").update({publicado:true}).eq("id",ep.id);
    await recarregar();
    setPublicando(false);
  };

  const FREQ_LABEL={diario:"Diário",n_vezes_semana:"N×/sem",uma_vez_semana:"1×/sem",uma_vez_mes:"1×/mês",
    trimestral:"Trimestral",semestral:"Semestral",anual:"Anual",unico:"Único"};

  return(
    <div style={{padding:"28px",maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:20}}>
        <button onClick={onVoltar} style={{background:"none",border:"none",cursor:"pointer",color:T.inkMid,fontSize:20,padding:"4px 0",flexShrink:0}}>←</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <div style={{fontSize:22,fontWeight:600,color:T.ink}}>{ep.nome}</div>
            <Badge label={ep.tipo==="institucional"?"Institucional":"Customizado"} color={ep.tipo==="institucional"?T.green:T.blue}/>
            <Badge label={ep.publicado?"Publicado":"Rascunho"} color={ep.publicado?T.green:T.orange}/>
          </div>
          <div style={{fontSize:13,color:T.inkMid}}>
            {ep.cid_principal&&<span style={{marginRight:16}}>CID: {ep.cid_principal}</span>}
            <span style={{marginRight:16}}>{ep.duracao_meses} meses</span>
            {ep.renovavel&&<span style={{marginRight:16}}>✓ Renovável</span>}
            {ep.ichom_set&&<span>ICHOM: {ep.ichom_set}</span>}
          </div>
        </div>
        {!ep.publicado&&(
          <Btn onClick={publicar} disabled={publicando} style={{flexShrink:0}}>
            {publicando?"Publicando...":"✓ Publicar episódio"}
          </Btn>
        )}
      </div>

      {/* Abas */}
      <div style={{display:"flex",gap:0,borderBottom:`0.5px solid ${T.border}`,marginBottom:20}}>
        {[
          {id:"desfechos",label:`Desfechos (${ep.episodio_desfechos?.length||0})`},
          {id:"acoes",label:`Ações mínimas (${ep.episodio_acoes?.length||0})`},
        ].map(a=>(
          <button key={a.id} onClick={()=>setAbaAtiva(a.id)}
            style={{padding:"8px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:T.f,fontSize:13,
              borderBottom:`2px solid ${abaAtiva===a.id?T.green:"transparent"}`,
              color:abaAtiva===a.id?T.green:T.inkMid,fontWeight:abaAtiva===a.id?500:400}}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Desfechos */}
      {abaAtiva==="desfechos"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:T.inkMid}}>Desfechos clínicos e PROs monitorados neste episódio</div>
            <Btn small onClick={()=>setNovoDesfecho(true)}>+ Adicionar desfecho</Btn>
          </div>

          {(ep.episodio_desfechos||[]).length===0?(
            <Card style={{padding:"32px",textAlign:"center",color:T.inkFaint}}>
              <div style={{fontSize:24,marginBottom:8}}>🎯</div>
              <div>Nenhum desfecho cadastrado ainda</div>
            </Card>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(ep.episodio_desfechos||[]).sort((a,b)=>a.ordem-b.ordem).map(d=>(
                <Card key={d.id} style={{padding:"14px 18px",borderLeft:`3px solid ${d.tipo==="pro"?T.purple:T.green}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{d.nome}</div>
                        <Badge label={d.tipo==="pro"?"PRO":"Clínico"} color={d.tipo==="pro"?T.purple:T.green}/>
                        {!d.intermediario&&<Badge label="Desfecho final" color={T.orange}/>}
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {d.unidade&&<span style={{fontSize:11,color:T.inkMid}}>Unidade: {d.unidade}</span>}
                        {d.valor_meta&&<span style={{fontSize:11,color:T.inkMid}}>Meta: {d.valor_meta}</span>}
                        <Badge label={FREQ_LABEL[d.frequencia_coleta]||d.frequencia_coleta} color={T.blue} bg={T.blueBg}/>
                        <Badge label={d.momento||"durante"} color={T.inkMid}/>
                      </div>
                      {d.ichom_referencia&&<div style={{fontSize:10,color:T.inkFaint,marginTop:4}}>{d.ichom_referencia}</div>}
                    </div>
                    <button onClick={async()=>{await supabase.from("episodio_desfechos").delete().eq("id",d.id);recarregar();}}
                      style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:16,padding:"0 4px",flexShrink:0}}>×</button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {novoDesfecho&&(
            <FormDesfecho episodioId={ep.id} apiKey={apiKey}
              onSalvo={()=>{recarregar();setNovoDesfecho(false);}}
              onCancelar={()=>setNovoDesfecho(false)}/>
          )}
        </div>
      )}

      {/* Ações mínimas */}
      {abaAtiva==="acoes"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:T.inkMid}}>Ações obrigatórias que entram automaticamente no plano de cuidado</div>
            <Btn small onClick={()=>setNovaAcao(true)}>+ Adicionar ação</Btn>
          </div>

          {(ep.episodio_acoes||[]).length===0?(
            <Card style={{padding:"32px",textAlign:"center",color:T.inkFaint}}>
              <div style={{fontSize:24,marginBottom:8}}>📋</div>
              <div>Nenhuma ação cadastrada ainda</div>
            </Card>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(ep.episodio_acoes||[]).sort((a,b)=>a.ordem-b.ordem).map(a=>(
                <Card key={a.id} style={{padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500,color:T.ink,marginBottom:3}}>{a.titulo}</div>
                      <div style={{display:"flex",gap:8}}>
                        <Badge label={a.tipo} color={T.blue} bg={T.blueBg}/>
                        <Badge label={FREQ_LABEL[a.frequencia]||a.frequencia} color={T.green}/>
                        {a.obrigatorio&&<Badge label="Obrigatório" color={T.orange}/>}
                        {(a.mes_inicio||a.mes_fim)&&(
                          <Badge label={"Mês "+(a.mes_inicio||1)+" a "+(a.mes_fim||ep.duracao_meses)} color={T.inkMid}/>
                        )}
                      </div>
                    </div>
                    <button onClick={async()=>{await supabase.from("episodio_acoes").delete().eq("id",a.id);recarregar();}}
                      style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:16}}>×</button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {novaAcao&&(
            <FormAcao episodioId={ep.id} duracaoMeses={ep.duracao_meses}
              onSalvo={()=>{recarregar();setNovaAcao(false);}}
              onCancelar={()=>setNovaAcao(false)}/>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Form Desfecho ─────────────────────────────────────────────────
function FormDesfecho({episodioId,apiKey,onSalvo,onCancelar}){
  const[nome,setNome]=useState("");
  const[tipo,setTipo]=useState("clinico");
  const[unidade,setUnidade]=useState("");
  const[meta,setMeta]=useState("");
  const[freq,setFreq]=useState("trimestral");
  const[momento,setMomento]=useState("durante");
  const[intermediario,setIntermediario]=useState(true);
  const[ichom,setIchom]=useState("");
  const[salvando,setSalvando]=useState(false);

  const salvar=async()=>{
    if(!nome.trim())return;
    setSalvando(true);
    await supabase.from("episodio_desfechos").insert({
      episodio_id:episodioId,
      nome:nome.trim(),
      tipo,
      unidade:unidade||null,
      valor_meta:meta?Number(meta):null,
      frequencia_coleta:freq,
      momento,
      intermediario,
      ichom_referencia:ichom||null,
    });
    setSalvando(false);
    onSalvo();
  };

  return(
    <Card style={{padding:"20px",marginTop:12,border:`1px solid ${T.greenBorder}`,background:T.greenBg}}>
      <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:14}}>Novo desfecho</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
        <Input label="NOME DO DESFECHO" value={nome} onChange={setNome} placeholder="Ex: Pressão arterial sistólica" required/>
        <Select label="TIPO" value={tipo} onChange={setTipo} options={[{value:"clinico",label:"Clínico"},{value:"pro",label:"PRO (relatado pelo paciente)"}]}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
        <Input label="UNIDADE" value={unidade} onChange={setUnidade} placeholder="mmHg"/>
        <Input label="META" value={meta} onChange={setMeta} placeholder="130"/>
        <Select label="FREQUÊNCIA" value={freq} onChange={setFreq} options={[
          {value:"mensal",label:"Mensal"},{value:"bimestral",label:"Bimestral"},
          {value:"trimestral",label:"Trimestral"},{value:"semestral",label:"Semestral"},
          {value:"anual",label:"Anual"},{value:"por_consulta",label:"Por consulta"},
          {value:"unico_inicio",label:"Único — início"},{value:"unico_fim",label:"Único — fim"},
        ]}/>
        <Select label="MOMENTO" value={momento} onChange={setMomento} options={[
          {value:"inicio",label:"Início"},{value:"durante",label:"Durante"},
          {value:"fim",label:"Fim"},{value:"inicio_e_fim",label:"Início e fim"},
        ]}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
        <Input label="REFERÊNCIA ICHOM" value={ichom} onChange={setIchom} placeholder="Ex: ICHOM HF v2.0 — Outcome 3"/>
        <Select label="TIPO DE DESFECHO" value={intermediario?"inter":"final"} onChange={v=>setIntermediario(v==="inter")}
          options={[{value:"inter",label:"Intermediário"},{value:"final",label:"Final do episódio"}]}/>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={onCancelar} variant="outline" small>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando||!nome.trim()} small>
          {salvando?"Salvando...":"Adicionar desfecho"}
        </Btn>
      </div>
    </Card>
  );
}

// ─── Form Ação ─────────────────────────────────────────────────────
function FormAcao({episodioId,duracaoMeses,onSalvo,onCancelar}){
  const[titulo,setTitulo]=useState("");
  const[tipo,setTipo]=useState("consulta");
  const[freq,setFreq]=useState("uma_vez_mes");
  const[metaSemanal,setMetaSemanal]=useState("1");
  const[obrigatorio,setObrigatorio]=useState(true);
  const[mesInicio,setMesInicio]=useState("1");
  const[mesFim,setMesFim]=useState(String(duracaoMeses));
  const[salvando,setSalvando]=useState(false);

  const salvar=async()=>{
    if(!titulo.trim())return;
    setSalvando(true);
    await supabase.from("episodio_acoes").insert({
      episodio_id:episodioId,
      titulo:titulo.trim(),
      tipo,
      frequencia:freq,
      meta_semanal:freq==="n_vezes_semana"?Number(metaSemanal):null,
      obrigatorio,
      mes_inicio:Number(mesInicio)||null,
      mes_fim:Number(mesFim)||null,
    });
    setSalvando(false);
    onSalvo();
  };

  return(
    <Card style={{padding:"20px",marginTop:12,border:`1px solid ${T.border}`,background:T.bgWarm}}>
      <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:14}}>Nova ação mínima</div>
      <Input label="TÍTULO DA AÇÃO" value={titulo} onChange={setTitulo} placeholder="Ex: Consulta de acompanhamento" required/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <Select label="TIPO" value={tipo} onChange={setTipo} options={[
          {value:"consulta",label:"Consulta"},{value:"exame",label:"Exame"},
          {value:"medicamento",label:"Medicamento"},{value:"estilo_vida",label:"Estilo de vida"},
          {value:"questionario",label:"Questionário"},{value:"outro",label:"Outro"},
        ]}/>
        <Select label="FREQUÊNCIA" value={freq} onChange={setFreq} options={[
          {value:"diario",label:"Diário"},{value:"n_vezes_semana",label:"N×/semana"},
          {value:"uma_vez_semana",label:"1×/semana"},{value:"uma_vez_mes",label:"1×/mês"},
          {value:"trimestral",label:"Trimestral"},{value:"semestral",label:"Semestral"},
          {value:"anual",label:"Anual"},{value:"unico",label:"Único"},
        ]}/>
        <Select label="OBRIGATÓRIO" value={obrigatorio?"sim":"nao"} onChange={v=>setObrigatorio(v==="sim")}
          options={[{value:"sim",label:"Sim"},{value:"nao",label:"Não"}]}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Input label="MÊS INÍCIO" value={mesInicio} onChange={setMesInicio} type="number" placeholder="1"/>
        <Input label="MÊS FIM" value={mesFim} onChange={setMesFim} type="number" placeholder={String(duracaoMeses)}/>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={onCancelar} variant="outline" small>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando||!titulo.trim()} small>
          {salvando?"Salvando...":"Adicionar ação"}
        </Btn>
      </div>
    </Card>
  );
}

// ─── Tela Médicos ──────────────────────────────────────────────────
function TelaMedicos(){
  const[medicos,setMedicos]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    carregarMedicosDetalhes().then(m=>{setMedicos(m);setLoading(false);});
  },[]);

  if(loading)return<Spinner/>;

  return(
    <div style={{padding:"28px",maxWidth:1000,margin:"0 auto"}}>
      <div style={{fontSize:22,fontWeight:600,color:T.ink,marginBottom:24}}>Médicos</div>
      <Card style={{padding:"0",overflow:"hidden"}}>
        {medicos.length===0?(
          <div style={{padding:"48px",textAlign:"center",color:T.inkFaint}}>
            <div style={{fontSize:32,marginBottom:12}}>👨‍⚕️</div>
            <div>Nenhum médico cadastrado</div>
          </div>
        ):(
          medicos.map(m=>(
            <div key={m.id} style={{padding:"16px 20px",borderBottom:`0.5px solid ${T.border}`,display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:40,height:40,borderRadius:10,background:T.greenBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                👨‍⚕️
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:2}}>{m.nome}</div>
                <div style={{fontSize:12,color:T.inkMid}}>{m.especialidade||"—"} · CRM {m.crm||"—"} · {m.email}</div>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:700,color:T.blue}}>{m.totalPacientes}</div>
                  <div style={{fontSize:10,color:T.inkFaint}}>pacientes</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:700,color:T.green}}>{m.totalConsultas}</div>
                  <div style={{fontSize:10,color:T.inkFaint}}>consultas</div>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ─── Tela Empresas ─────────────────────────────────────────────────
function TelaEmpresas(){
  const[empresas,setEmpresas]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    supabase.from("empresas").select("*").order("created_at",{ascending:false})
      .then(({data})=>{setEmpresas(data||[]);setLoading(false);});
  },[]);

  if(loading)return<Spinner/>;

  return(
    <div style={{padding:"28px",maxWidth:900,margin:"0 auto"}}>
      <div style={{fontSize:22,fontWeight:600,color:T.ink,marginBottom:24}}>Empresas / Tenants</div>
      <Card style={{padding:"0",overflow:"hidden"}}>
        {empresas.length===0?(
          <div style={{padding:"48px",textAlign:"center",color:T.inkFaint}}>
            <div style={{fontSize:32,marginBottom:12}}>🏢</div>
            <div>Nenhuma empresa cadastrada</div>
          </div>
        ):(
          empresas.map(e=>(
            <div key={e.id} style={{padding:"14px 20px",borderBottom:`0.5px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:8,background:e.cor||T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:14,flexShrink:0}}>
                {e.nome?.charAt(0)||"E"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{e.nome}</div>
                <div style={{fontSize:11,color:T.inkMid}}>slug: {e.slug} · tipo: {e.tipo||"empresa"}</div>
              </div>
              <Badge label={e.ativo?"Ativo":"Inativo"} color={e.ativo?T.green:T.red}/>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ─── Tela Programas ────────────────────────────────────────────────
function TelaProgramas(){
  const[programas,setProgramas]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    supabase.from("programas").select("*,empresas(nome)").order("ordem")
      .then(({data})=>{setProgramas(data||[]);setLoading(false);});
  },[]);

  if(loading)return<Spinner/>;

  return(
    <div style={{padding:"28px",maxWidth:900,margin:"0 auto"}}>
      <div style={{fontSize:22,fontWeight:600,color:T.ink,marginBottom:24}}>Programas de saúde</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {programas.map(p=>(
          <Card key={p.id} style={{padding:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:24}}>{p.icone}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{p.nome}</div>
                <div style={{fontSize:11,color:T.inkFaint}}>{p.empresas?.nome||"—"}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:T.inkMid,lineHeight:1.5,marginBottom:8}}>{p.descricao}</div>
            <div style={{display:"flex",gap:6}}>
              <Badge label={p.publico} color={T.blue}/>
              <Badge label={p.ativo?"Ativo":"Inativo"} color={p.ativo?T.green:T.red}/>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
