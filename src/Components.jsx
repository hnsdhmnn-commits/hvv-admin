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
const Card=({children,style={},onClick,...props})=>(
  <div onClick={onClick} style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:12,boxShadow:T.shadow,...style,...(onClick?{cursor:"pointer"}:{})}} {...props}>
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
              onClick={async()=>{
                console.log("[ADMIN] Clicou no episódio:", ep.id, ep.nome);
                const{data,error}=await supabase.from("episodios")
                  .select("*, episodio_acoes(*), episodio_desfechos(*)")
                  .eq("id",ep.id).single();
                console.log("[ADMIN] Dados carregados:", data, "Erro:", error);
                setSelecionado(data||ep);
                setTela("detalhe");
                console.log("[ADMIN] Tela setada para detalhe");
              }}>
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
  // Campos básicos
  const[nome,setNome]=useState("");
  const[descricao,setDescricao]=useState("");
  const[cid,setCid]=useState("");
  const[duracao,setDuracao]=useState("12");
  const[renovavel,setRenovavel]=useState(true);

  // IA
  const[buscando,setBuscando]=useState(false);
  const[sugestao,setSugestao]=useState(null); // {ichom_set, ichom_url, etapas:[]}
  const timerRef=useRef(null);

  // Etapas editáveis (acoes + desfechos unificados)
  const[etapas,setEtapas]=useState([]);
  const[salvando,setSalvando]=useState(false);
  const[erro,setErro]=useState("");

  const TIPO_COR={consulta:T.green,exame:T.purple,medicamento:T.blue,estilo_vida:T.orange,questionario:T.blue,desfecho_clinico:T.green,desfecho_pro:T.purple,outro:T.inkMid};
  const TIPO_ICON={consulta:"🩺",exame:"🔬",medicamento:"💊",estilo_vida:"🌿",questionario:"📝",desfecho_clinico:"🎯",desfecho_pro:"📊",outro:"📋"};

  const buscarSugestoes=async(cidTxt,nomeTxt)=>{
    if((!cidTxt&&nomeTxt.length<5)||!apiKey.startsWith("sk-"))return;
    setBuscando(true);
    setSugestao(null);
    try{
      const res=await fetch("/.netlify/functions/claude",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1200,
          messages:[{role:"user",content:"Voce e especialista em medicina baseada em evidencias e conjuntos ICHOM. Para a condicao: CID "+cidTxt+" / "+nomeTxt+" com duracao de "+duracao+" meses, sugira um protocolo de episodio clinico completo. Retorne SOMENTE um JSON com: {ichom_set, ichom_url, etapas:[{titulo, tipo (consulta|exame|medicamento|estilo_vida|questionario|desfecho_clinico|desfecho_pro), dia, responsavel (medico|paciente|ana), unidade, meta, frequencia_coleta, intermediario, ichom_ref, descricao}]}. dia = dia apos inicio (0=inicio, 30=1mes, 90=3meses etc). Para desfechos inclua unidade e meta. Para acoes inclua descricao curta. Retorne SOMENTE o JSON."}]
        })
      });
      const data=await res.json();
      const raw=(data.content?.[0]?.text||"{}").trim();
      const match=raw.match(/\{[\s\S]*\}/);
      if(match){
        const parsed=JSON.parse(match[0]);
        setSugestao(parsed);
        // Pré-popular etapas com as sugestões
        setEtapas((parsed.etapas||[]).map((e,i)=>({...e,id:"temp_"+i,incluir:true})));
      }
    }catch(e){console.warn(e);}
    finally{setBuscando(false);}
  };

  const handleCid=(val)=>{
    setCid(val);
    clearTimeout(timerRef.current);
    if(val.length>=3)timerRef.current=setTimeout(()=>buscarSugestoes(val,nome),1200);
  };

  const handleNome=(val)=>{
    setNome(val);
    clearTimeout(timerRef.current);
    if(val.length>=8)timerRef.current=setTimeout(()=>buscarSugestoes(cid,val),1500);
  };

  const adicionarEtapa=()=>{
    setEtapas(prev=>[...prev,{id:"temp_"+Date.now(),titulo:"",tipo:"consulta",dia:0,responsavel:"medico",descricao:"",incluir:true}]);
  };

  const removerEtapa=(id)=>setEtapas(prev=>prev.filter(e=>e.id!==id));

  const atualizarEtapa=(id,campo,valor)=>setEtapas(prev=>prev.map(e=>e.id===id?{...e,[campo]:valor}:e));

  const handleSalvar=async()=>{
    if(!nome.trim()){setErro("Nome é obrigatório");return;}
    setSalvando(true);setErro("");
    try{
      // Salvar episódio
      const{data:ep,error}=await supabase.from("episodios").insert({
        nome:nome.trim(),
        descricao:descricao.trim()||null,
        cid_principal:cid.trim().toUpperCase()||null,
        duracao_meses:Number(duracao),
        renovavel,
        tipo:"institucional",
        ichom_set:sugestao?.ichom_set||null,
        ichom_url:sugestao?.ichom_url||null,
        publicado:false,
        ativo:true,
      }).select("id").single();

      if(error){setErro(error.message);setSalvando(false);return;}

      // Salvar etapas incluídas
      const incluidas=etapas.filter(e=>e.incluir&&e.titulo?.trim());
      const acoes=incluidas.filter(e=>!e.tipo?.startsWith("desfecho"));
      const desfechos=incluidas.filter(e=>e.tipo?.startsWith("desfecho"));

      if(acoes.length>0){
        await supabase.from("episodio_acoes").insert(acoes.map((e,i)=>({
          episodio_id:ep.id,
          titulo:e.titulo.trim(),
          descricao:e.descricao||null,
          tipo:e.tipo,
          frequencia:e.frequencia||"unico",
          responsavel:e.responsavel||"medico",
          dia_inicio:Number(e.dia)||0,
          obrigatorio:true,
          ordem:i,
        })));
      }

      if(desfechos.length>0){
        await supabase.from("episodio_desfechos").insert(desfechos.map((e,i)=>({
          episodio_id:ep.id,
          nome:e.titulo.trim(),
          descricao:e.descricao||null,
          tipo:e.tipo==="desfecho_pro"?"pro":"clinico",
          unidade:e.unidade||null,
          valor_meta:e.meta?Number(e.meta):null,
          frequencia_coleta:e.frequencia_coleta||"trimestral",
          ichom_referencia:e.ichom_ref||null,
          intermediario:e.intermediario!==false,
          dia_inicio:Number(e.dia)||null,
          ordem:i,
        })));
      }

      onSalvo();
    }catch(e){setErro(e.message);}
    finally{setSalvando(false);}
  };

  const etapasOrdenadas=[...etapas].sort((a,b)=>(Number(a.dia)||0)-(Number(b.dia)||0));

  return(
    <div style={{padding:"28px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={onCancelar} style={{background:"none",border:"none",cursor:"pointer",color:T.inkMid,fontSize:20,padding:0}}>←</button>
        <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Novo episódio clínico</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:20,alignItems:"flex-start"}}>

        {/* Coluna esquerda — identificação */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card style={{padding:"20px"}}>
            <div style={{fontSize:13,fontWeight:500,color:T.ink,marginBottom:14}}>Identificação</div>
            <Input label="NOME DO EPISÓDIO" value={nome} onChange={handleNome}
              placeholder="Ex: Controle da Hipertensão Arterial" required/>
            <Textarea label="DESCRIÇÃO" value={descricao} onChange={setDescricao}
              placeholder="Objetivo clínico e população alvo..." rows={2}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Input label="CID PRINCIPAL" value={cid} onChange={handleCid} placeholder="Ex: I10"/>
              <Input label="DURAÇÃO (MESES)" value={duracao} onChange={setDuracao} type="number"/>
            </div>
            <Select label="RENOVÁVEL" value={renovavel?"sim":"nao"} onChange={v=>setRenovavel(v==="sim")}
              options={[{value:"sim",label:"Sim — doença crônica"},{value:"nao",label:"Não — episódio único"}]}/>

            {buscando&&(
              <div style={{fontSize:12,color:T.blue,display:"flex",alignItems:"center",gap:6,padding:"8px 0"}}>
                <div style={{width:12,height:12,border:`2px solid ${T.blue}30`,borderTop:`2px solid ${T.blue}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                Consultando evidências e ICHOM...
              </div>
            )}

            {sugestao?.ichom_set&&(
              <div style={{padding:"10px 14px",background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,fontSize:12}}>
                <div style={{fontWeight:500,color:T.greenDark,marginBottom:2}}>✦ ICHOM: {sugestao.ichom_set}</div>
                {sugestao.ichom_url&&<div style={{color:T.inkFaint,fontSize:10}}>{sugestao.ichom_url}</div>}
              </div>
            )}
          </Card>

          {/* Legenda de tipos */}
          <Card style={{padding:"14px 16px"}}>
            <div style={{fontSize:11,color:T.inkFaint,marginBottom:10,fontWeight:500,letterSpacing:"0.08em"}}>TIPOS DE ETAPA</div>
            {Object.entries(TIPO_ICON).map(([tipo,icon])=>(
              <div key={tipo} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontSize:14}}>{icon}</span>
                <span style={{fontSize:11,color:T.inkMid,textTransform:"capitalize"}}>{tipo.replace("_"," ")}</span>
                <div style={{width:8,height:8,borderRadius:"50%",background:TIPO_COR[tipo]||T.inkMid,marginLeft:"auto"}}/>
              </div>
            ))}
          </Card>
        </div>

        {/* Coluna direita — timeline */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:500,color:T.ink}}>Timeline do episódio</div>
              <div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>
                {etapas.filter(e=>e.incluir).length} etapas selecionadas
                {sugestao&&" · sugeridas pela IA com base em evidências"}
              </div>
            </div>
            <Btn small onClick={adicionarEtapa}>+ Adicionar etapa</Btn>
          </div>

          {etapas.length===0&&!buscando&&(
            <Card style={{padding:"40px",textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:12}}>🏥</div>
              <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:6}}>Preencha o CID ou nome</div>
              <div style={{fontSize:12,color:T.inkMid}}>A IA vai sugerir as etapas do episódio com base em evidências clínicas e ICHOM</div>
            </Card>
          )}

          {buscando&&(
            <Card style={{padding:"40px",textAlign:"center"}}>
              <Spinner/>
              <div style={{fontSize:13,color:T.inkMid,marginTop:8}}>Gerando protocolo clínico...</div>
            </Card>
          )}

          {etapasOrdenadas.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {etapasOrdenadas.map((etapa,idx)=>{
                const cor=TIPO_COR[etapa.tipo]||T.inkMid;
                const icon=TIPO_ICON[etapa.tipo]||"📋";
                const dia=Number(etapa.dia)||0;
                const diaLabel=dia===0?"Início":dia<30?"Dia "+dia:dia%30===0?"Mês "+(dia/30):"Dia "+dia;
                const isDesfecho=etapa.tipo?.startsWith("desfecho");

                return(
                  <div key={etapa.id} style={{display:"flex",gap:10,alignItems:"flex-start",
                    opacity:etapa.incluir?1:0.4,transition:"opacity 0.2s"}}>

                    {/* Checkbox + dia */}
                    <div style={{flexShrink:0,width:64,display:"flex",flexDirection:"column",alignItems:"center",gap:3,paddingTop:10}}>
                      <input type="checkbox" checked={etapa.incluir!==false}
                        onChange={e=>atualizarEtapa(etapa.id,"incluir",e.target.checked)}
                        style={{width:16,height:16,accentColor:T.green}}/>
                      <div style={{fontSize:9,color:T.inkFaint,textAlign:"center",lineHeight:1.3}}>{diaLabel}</div>
                    </div>

                    {/* Card da etapa */}
                    <Card style={{flex:1,padding:"12px 14px",borderLeft:`3px solid ${cor}`}}>
                      <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                        <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{icon}</span>
                        <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                          {/* Título */}
                          <input value={etapa.titulo||""} onChange={e=>atualizarEtapa(etapa.id,"titulo",e.target.value)}
                            placeholder="Título da etapa"
                            style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:6,
                              fontFamily:T.f,fontSize:13,fontWeight:500,color:T.ink,outline:"none",boxSizing:"border-box"}}/>
                          {/* Linha de controles */}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                            <select value={etapa.tipo||"consulta"} onChange={e=>atualizarEtapa(etapa.id,"tipo",e.target.value)}
                              style={{fontSize:11,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.f,color:T.inkMid}}>
                              <option value="consulta">🩺 Consulta</option>
                              <option value="exame">🔬 Exame</option>
                              <option value="medicamento">💊 Medicamento</option>
                              <option value="estilo_vida">🌿 Estilo de vida</option>
                              <option value="questionario">📝 Questionário</option>
                              <option value="desfecho_clinico">🎯 Desfecho clínico</option>
                              <option value="desfecho_pro">📊 Desfecho PRO</option>
                              <option value="outro">📋 Outro</option>
                            </select>
                            <select value={etapa.responsavel||"medico"} onChange={e=>atualizarEtapa(etapa.id,"responsavel",e.target.value)}
                              style={{fontSize:11,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.f,color:T.inkMid}}>
                              <option value="medico">Médico</option>
                              <option value="paciente">Paciente</option>
                              <option value="ana">Ana</option>
                              <option value="equipe">Equipe</option>
                            </select>
                            <input type="number" value={etapa.dia||0} min={0} max={duracao*30}
                              onChange={e=>atualizarEtapa(etapa.id,"dia",e.target.value)}
                              title="Dia após início do episódio"
                              style={{width:56,fontSize:11,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.f,color:T.inkMid,textAlign:"center"}}/>
                            <span style={{fontSize:10,color:T.inkFaint}}>dias</span>
                            {isDesfecho&&(
                              <>
                                <input value={etapa.unidade||""} onChange={e=>atualizarEtapa(etapa.id,"unidade",e.target.value)}
                                  placeholder="Unidade (ex: %)"
                                  style={{width:70,fontSize:11,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.f,color:T.inkMid}}/>
                                <input value={etapa.meta||""} onChange={e=>atualizarEtapa(etapa.id,"meta",e.target.value)}
                                  placeholder="Meta"
                                  style={{width:54,fontSize:11,padding:"3px 6px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.f,color:T.inkMid}}/>
                              </>
                            )}
                          </div>
                          {/* Descrição */}
                          {etapa.descricao&&(
                            <div style={{fontSize:11,color:T.inkFaint,lineHeight:1.5}}>{etapa.descricao}</div>
                          )}
                        </div>
                        <button onClick={()=>removerEtapa(etapa.id)}
                          style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:16,flexShrink:0,opacity:0.4}}
                          onMouseOver={e=>e.currentTarget.style.opacity=1}
                          onMouseOut={e=>e.currentTarget.style.opacity=0.4}>×</button>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {erro&&<div style={{marginTop:16,fontSize:13,color:T.red,padding:"10px 14px",background:T.redBg,borderRadius:8}}>{erro}</div>}

      <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
        <Btn onClick={onCancelar} variant="outline">Cancelar</Btn>
        <Btn onClick={handleSalvar} disabled={salvando||!nome.trim()}>
          {salvando?"Salvando...":"✓ Criar episódio →"}
        </Btn>
      </div>
    </div>
  );
}


// ─── Detalhe do Episódio — Timeline ─────────────────────────────
function DetalheEpisodio({episodio,apiKey,onVoltar}){
  const[ep,setEp]=useState(episodio);
  const[publicando,setPublicando]=useState(false);
  const[mostrarForm,setMostrarForm]=useState(false);

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

  const excluirAcao=async(id)=>{
    await supabase.from("episodio_acoes").delete().eq("id",id);
    recarregar();
  };

  const excluirDesfecho=async(id)=>{
    await supabase.from("episodio_desfechos").delete().eq("id",id);
    recarregar();
  };

  // Montar timeline unificada — ações + desfechos ordenados por dia
  const timeline=[
    ...(ep.episodio_acoes||[]).map(a=>({...a,_tipo:"acao"})),
    ...(ep.episodio_desfechos||[]).map(d=>({...d,_tipo:"desfecho"})),
  ].sort((a,b)=>(a.dia_inicio||a.mes_inicio*30||0)-(b.dia_inicio||b.mes_inicio*30||0));

  const TIPO_COR={consulta:T.green,exame:T.purple,medicamento:T.blue,estilo_vida:T.orange,questionario:T.blue,outro:T.inkMid};
  const TIPO_ICON={consulta:"🩺",exame:"🔬",medicamento:"💊",estilo_vida:"🌿",questionario:"📝",outro:"📋"};
  const RESP_LABEL={medico:"Médico",paciente:"Paciente",ana:"Ana",equipe:"Equipe"};

  return(
    <div style={{padding:"28px",maxWidth:860,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:24}}>
        <button onClick={onVoltar} style={{background:"none",border:"none",cursor:"pointer",color:T.inkMid,fontSize:20,padding:"4px 0",flexShrink:0}}>←</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <div style={{fontSize:22,fontWeight:600,color:T.ink}}>{ep.nome}</div>
            <Badge label={ep.tipo==="institucional"?"Institucional":"Customizado"} color={ep.tipo==="institucional"?T.green:T.blue}/>
            <Badge label={ep.publicado?"Publicado":"Rascunho"} color={ep.publicado?T.green:T.orange}/>
          </div>
          <div style={{fontSize:13,color:T.inkMid,display:"flex",gap:16,flexWrap:"wrap"}}>
            {ep.cid_principal&&<span>CID: <strong>{ep.cid_principal}</strong></span>}
            <span>Duração: <strong>{ep.duracao_meses} meses</strong></span>
            {ep.renovavel&&<span>✓ Renovável (doenças crônicas)</span>}
            {ep.ichom_set&&<span>ICHOM: <strong>{ep.ichom_set}</strong></span>}
          </div>
          {ep.descricao&&<div style={{fontSize:12,color:T.inkFaint,marginTop:4}}>{ep.descricao}</div>}
        </div>
        {!ep.publicado&&(
          <Btn onClick={publicar} disabled={publicando} style={{flexShrink:0}}>
            {publicando?"Publicando...":"✓ Publicar"}
          </Btn>
        )}
      </div>

      {/* Resumo */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[
          {label:"Etapas totais",value:timeline.length,icon:"📋"},
          {label:"Ações clínicas",value:(ep.episodio_acoes||[]).length,icon:"🩺"},
          {label:"Desfechos",value:(ep.episodio_desfechos||[]).length,icon:"🎯"},
          {label:"Duração",value:ep.duracao_meses+"m",icon:"📅"},
        ].map(s=>(
          <div key={s.label} style={{padding:"12px 14px",background:T.bgWarm,borderRadius:10,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>{s.icon}</span>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:T.ink}}>{s.value}</div>
              <div style={{fontSize:10,color:T.inkFaint}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:500,color:T.ink}}>Linha do tempo do episódio</div>
        <Btn small onClick={()=>setMostrarForm(true)}>+ Adicionar etapa</Btn>
      </div>

      {timeline.length===0?(
        <Card style={{padding:"48px",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <div style={{fontSize:15,fontWeight:500,color:T.ink,marginBottom:8}}>Nenhuma etapa cadastrada</div>
          <div style={{fontSize:13,color:T.inkMid,marginBottom:20}}>Adicione ações e desfechos para montar a jornada do paciente</div>
          <Btn onClick={()=>setMostrarForm(true)}>+ Adicionar primeira etapa</Btn>
        </Card>
      ):(
        <div style={{position:"relative"}}>
          {/* Linha vertical da timeline */}
          <div style={{position:"absolute",left:28,top:0,bottom:0,width:2,background:T.border,zIndex:0}}/>

          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {timeline.map((item,idx)=>{
              const isDesfecho=item._tipo==="desfecho";
              const cor=isDesfecho?(item.tipo==="pro"?T.purple:T.blue):TIPO_COR[item.tipo]||T.inkMid;
              const icon=isDesfecho?(item.tipo==="pro"?"📊":"🎯"):TIPO_ICON[item.tipo]||"📋";
              const dia=item.dia_inicio||(item.mes_inicio?item.mes_inicio*30:null);
              const FREQ={diario:"Diário",n_vezes_semana:"N×/sem",uma_vez_semana:"1×/sem",uma_vez_mes:"1×/mês",trimestral:"Trimestral",semestral:"Semestral",anual:"Anual",unico:"Único",mensal:"Mensal",bimestral:"Bimestral",por_consulta:"Por consulta",unico_inicio:"Início",unico_fim:"Fim"};

              return(
                <div key={item.id} style={{display:"flex",gap:16,marginBottom:12,position:"relative",zIndex:1}}>
                  {/* Ponto na timeline */}
                  <div style={{width:58,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:cor+"20",border:`2px solid ${cor}`,
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,background:T.surface}}>
                      {icon}
                    </div>
                    {dia!=null&&(
                      <div style={{fontSize:9,color:T.inkFaint,textAlign:"center",lineHeight:1.3}}>
                        {dia===0?"Início":dia<30?"Dia "+dia:dia%30===0?"Mês "+(dia/30):"Dia "+dia}
                      </div>
                    )}
                  </div>

                  {/* Card da etapa */}
                  <Card style={{flex:1,padding:"14px 16px",borderLeft:`3px solid ${cor}`}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                          <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{item.titulo||item.nome}</div>
                          {isDesfecho&&<Badge label={item.tipo==="pro"?"PRO":"Clínico"} color={cor}/>}
                          {!isDesfecho&&<Badge label={item.tipo} color={cor}/>}
                          {isDesfecho&&!item.intermediario&&<Badge label="Desfecho final" color={T.orange}/>}
                          <Badge label="Obrigatório" color={T.inkLight}/>
                        </div>
                        {item.descricao&&<div style={{fontSize:12,color:T.inkMid,marginBottom:4}}>{item.descricao}</div>}
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {!isDesfecho&&item.frequencia&&<Badge label={FREQ[item.frequencia]||item.frequencia} color={T.inkLight}/>}
                          {!isDesfecho&&item.responsavel&&<Badge label={RESP_LABEL[item.responsavel]||item.responsavel} color={T.blue} bg={T.blueBg}/>}
                          {isDesfecho&&item.unidade&&<span style={{fontSize:11,color:T.inkMid}}>Unidade: {item.unidade}</span>}
                          {isDesfecho&&item.valor_meta&&<span style={{fontSize:11,color:T.inkMid}}>Meta: {item.valor_meta}</span>}
                          {isDesfecho&&item.frequencia_coleta&&<Badge label={FREQ[item.frequencia_coleta]||item.frequencia_coleta} color={T.inkLight}/>}
                          {isDesfecho&&item.ichom_referencia&&<span style={{fontSize:10,color:T.inkFaint}}>{item.ichom_referencia}</span>}
                        </div>
                      </div>
                      <button
                        onClick={()=>isDesfecho?excluirDesfecho(item.id):excluirAcao(item.id)}
                        style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:16,padding:"0 4px",flexShrink:0,opacity:0.5}}
                        onMouseOver={e=>e.currentTarget.style.opacity=1}
                        onMouseOut={e=>e.currentTarget.style.opacity=0.5}>
                        ×
                      </button>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form de nova etapa */}
      {mostrarForm&&(
        <FormEtapa
          episodioId={ep.id}
          duracaoMeses={ep.duracao_meses}
          apiKey={apiKey}
          onSalvo={()=>{recarregar();setMostrarForm(false);}}
          onCancelar={()=>setMostrarForm(false)}/>
      )}
    </div>
  );
}

// ─── Form Etapa — ação OU desfecho ────────────────────────────────
function FormEtapa({episodioId,duracaoMeses,apiKey,onSalvo,onCancelar}){
  const[tipoEtapa,setTipoEtapa]=useState("acao"); // acao | desfecho
  const[salvando,setSalvando]=useState(false);

  // Campos ação
  const[titulo,setTitulo]=useState("");
  const[tipo,setTipo]=useState("consulta");
  const[freq,setFreq]=useState("unico");
  const[responsavel,setResponsavel]=useState("medico");
  const[diaInicio,setDiaInicio]=useState("0");
  const[descricao,setDescricao]=useState("");

  // Campos desfecho
  const[nome,setNome]=useState("");
  const[tipoDesfecho,setTipoDesfecho]=useState("clinico");
  const[unidade,setUnidade]=useState("");
  const[meta,setMeta]=useState("");
  const[freqColeta,setFreqColeta]=useState("trimestral");
  const[momento,setMomento]=useState("durante");
  const[intermediario,setIntermediario]=useState(true);
  const[ichom,setIchom]=useState("");
  const[diaDesfecho,setDiaDesfecho]=useState("");

  const diasPreset=[
    {label:"Início (Dia 0)",value:"0"},
    {label:"Dia 7",value:"7"},
    {label:"Dia 15",value:"15"},
    {label:"Dia 30 (1 mês)",value:"30"},
    {label:"Dia 60 (2 meses)",value:"60"},
    {label:"Dia 90 (3 meses)",value:"90"},
    {label:"Dia 180 (6 meses)",value:"180"},
    {label:"Dia 270 (9 meses)",value:"270"},
    {label:"Dia 365 (12 meses)",value:"365"},
  ].filter(d=>Number(d.value)<=duracaoMeses*30);

  const salvar=async()=>{
    setSalvando(true);
    if(tipoEtapa==="acao"){
      if(!titulo.trim()){setSalvando(false);return;}
      await supabase.from("episodio_acoes").insert({
        episodio_id:episodioId,
        titulo:titulo.trim(),
        descricao:descricao||null,
        tipo,
        frequencia:freq,
        responsavel,
        dia_inicio:Number(diaInicio)||0,
        obrigatorio:true,
      });
    } else {
      if(!nome.trim()){setSalvando(false);return;}
      await supabase.from("episodio_desfechos").insert({
        episodio_id:episodioId,
        nome:nome.trim(),
        tipo:tipoDesfecho,
        unidade:unidade||null,
        valor_meta:meta?Number(meta):null,
        frequencia_coleta:freqColeta,
        momento,
        intermediario,
        ichom_referencia:ichom||null,
        dia_inicio:Number(diaDesfecho)||null,
      });
    }
    setSalvando(false);
    onSalvo();
  };

  return(
    <Card style={{padding:"20px",marginTop:16,border:`1px solid ${T.greenBorder}`,background:T.greenBg}}>
      <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:16}}>Nova etapa</div>

      {/* Tipo de etapa */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[
          {id:"acao",label:"🩺 Ação clínica",desc:"consulta, exame, medicamento, orientação"},
          {id:"desfecho",label:"🎯 Desfecho",desc:"clínico ou PRO — medição de resultado"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTipoEtapa(t.id)}
            style={{flex:1,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${tipoEtapa===t.id?T.green:T.border}`,
              background:tipoEtapa===t.id?T.surface:"transparent",cursor:"pointer",textAlign:"left",fontFamily:T.f}}>
            <div style={{fontSize:13,fontWeight:500,color:tipoEtapa===t.id?T.green:T.inkMid}}>{t.label}</div>
            <div style={{fontSize:11,color:T.inkFaint,marginTop:2}}>{t.desc}</div>
          </button>
        ))}
      </div>

      {tipoEtapa==="acao"&&(
        <>
          <Input label="TÍTULO DA AÇÃO" value={titulo} onChange={setTitulo} placeholder="Ex: Consulta inicial com médico" required/>
          <Input label="DESCRIÇÃO (opcional)" value={descricao} onChange={setDescricao} placeholder="Detalhes sobre esta etapa..."/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
            <Select label="TIPO" value={tipo} onChange={setTipo} options={[
              {value:"consulta",label:"🩺 Consulta"},
              {value:"exame",label:"🔬 Exame"},
              {value:"medicamento",label:"💊 Medicamento"},
              {value:"estilo_vida",label:"🌿 Estilo de vida"},
              {value:"questionario",label:"📝 Questionário"},
              {value:"outro",label:"📋 Outro"},
            ]}/>
            <Select label="RESPONSÁVEL" value={responsavel} onChange={setResponsavel} options={[
              {value:"medico",label:"Médico"},
              {value:"paciente",label:"Paciente"},
              {value:"ana",label:"Ana"},
              {value:"equipe",label:"Equipe"},
            ]}/>
            <Select label="FREQUÊNCIA" value={freq} onChange={setFreq} options={[
              {value:"unico",label:"Único"},
              {value:"diario",label:"Diário"},
              {value:"n_vezes_semana",label:"N×/semana"},
              {value:"uma_vez_semana",label:"1×/semana"},
              {value:"uma_vez_mes",label:"1×/mês"},
              {value:"trimestral",label:"Trimestral"},
              {value:"semestral",label:"Semestral"},
            ]}/>
            <Select label="QUANDO (DIA)" value={diaInicio} onChange={setDiaInicio} options={diasPreset}/>
          </div>
        </>
      )}

      {tipoEtapa==="desfecho"&&(
        <>
          <Input label="NOME DO DESFECHO" value={nome} onChange={setNome} placeholder="Ex: Hemoglobina glicada (HbA1c)" required/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
            <Select label="TIPO" value={tipoDesfecho} onChange={setTipoDesfecho} options={[
              {value:"clinico",label:"Clínico (médico mede)"},
              {value:"pro",label:"PRO (paciente responde)"},
            ]}/>
            <Input label="UNIDADE" value={unidade} onChange={setUnidade} placeholder="%, mmHg, kg..."/>
            <Input label="META" value={meta} onChange={setMeta} placeholder="Ex: 7"/>
            <Select label="QUANDO (DIA)" value={diaDesfecho} onChange={setDiaDesfecho}
              options={[{value:"",label:"Selecionar..."},...diasPreset]}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <Select label="FREQUÊNCIA DE COLETA" value={freqColeta} onChange={setFreqColeta} options={[
              {value:"por_consulta",label:"A cada consulta"},
              {value:"mensal",label:"Mensal"},
              {value:"bimestral",label:"Bimestral"},
              {value:"trimestral",label:"Trimestral"},
              {value:"semestral",label:"Semestral"},
              {value:"anual",label:"Anual"},
              {value:"unico_inicio",label:"Único — início"},
              {value:"unico_fim",label:"Único — fim"},
            ]}/>
            <Select label="TIPO DE DESFECHO" value={intermediario?"inter":"final"} onChange={v=>setIntermediario(v==="inter")}
              options={[{value:"inter",label:"Intermediário"},{value:"final",label:"Final do episódio"}]}/>
            <Input label="REFERÊNCIA ICHOM" value={ichom} onChange={setIchom} placeholder="Ex: ICHOM Diabetes v2.0"/>
          </div>
        </>
      )}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
        <Btn onClick={onCancelar} variant="outline" small>Cancelar</Btn>
        <Btn onClick={salvar} disabled={salvando||(tipoEtapa==="acao"?!titulo.trim():!nome.trim())} small>
          {salvando?"Salvando...":"✓ Adicionar à timeline"}
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
