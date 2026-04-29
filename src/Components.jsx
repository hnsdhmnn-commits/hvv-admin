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
async function criarNovaVersao(ep){
  // Copia o episódio como rascunho nova versão
  const versaoAtual=ep.versao||1;
  const{data:novo,error}=await supabase.from("episodios").insert({
    nome:ep.nome,
    descricao:ep.descricao,
    cid_principal:ep.cid_principal,
    cids_relacionados:ep.cids_relacionados,
    tipo:ep.tipo,
    empresa_id:ep.empresa_id,
    medico_id:ep.medico_id,
    duracao_meses:ep.duracao_meses,
    renovavel:ep.renovavel,
    ichom_set:ep.ichom_set,
    ichom_url:ep.ichom_url,
    publicado:false,
    ativo:true,
    versao:versaoAtual+1,
    episodio_pai_id:ep.id,
  }).select("id").single();
  if(error||!novo)return null;

  // Copiar ações
  const acoes=(ep.episodio_acoes||[]).map(a=>({
    episodio_id:novo.id,titulo:a.titulo,descricao:a.descricao,tipo:a.tipo,
    frequencia:a.frequencia,responsavel:a.responsavel,dia_inicio:a.dia_inicio,
    obrigatorio:a.obrigatorio,ordem:a.ordem,
  }));
  if(acoes.length>0)await supabase.from("episodio_acoes").insert(acoes);

  // Copiar desfechos
  const desfechos=(ep.episodio_desfechos||[]).map(d=>({
    episodio_id:novo.id,nome:d.nome,descricao:d.descricao,tipo:d.tipo,
    unidade:d.unidade,valor_meta:d.valor_meta,frequencia_coleta:d.frequencia_coleta,
    momento:d.momento,ichom_referencia:d.ichom_referencia,intermediario:d.intermediario,
    dia_inicio:d.dia_inicio,ordem:d.ordem,
  }));
  if(desfechos.length>0)await supabase.from("episodio_desfechos").insert(desfechos);

  return novo.id;
}

async function publicarNovaVersao(novoId,velhoId){
  // 1. Migrar pacientes do episódio antigo para o novo
  await supabase.from("paciente_episodios")
    .update({episodio_id:novoId,updated_at:new Date().toISOString()})
    .eq("episodio_id",velhoId)
    .eq("status","ativo");

  // 2. Publicar novo
  await supabase.from("episodios").update({publicado:true,ativo:true}).eq("id",novoId);

  // 3. Arquivar antigo
  await supabase.from("episodios").update({publicado:false,ativo:false}).eq("id",velhoId);
}

async function deletarEpisodio(id){
  // Deletar em cascata — acoes e desfechos primeiro
  await supabase.from("episodio_acoes").delete().eq("episodio_id",id);
  await supabase.from("episodio_desfechos").delete().eq("episodio_id",id);
  await supabase.from("episodios").delete().eq("id",id);
}

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
  const{data:medicos,error}=await supabase.from("medicos").select("*");
  console.log("[MEDICOS] data:",medicos,"error:",error);
  if(error||!medicos)return[];
  return medicos.map(m=>({...m,totalPacientes:0,totalConsultas:0,mediaCSAT:null,adesao:null}));
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
  const[todosMedicos,setTodosMedicos]=useState([]);
  const[medicosFiltro,setMedicosFiltro]=useState([]); // IDs selecionados — vazio = todos

  useEffect(()=>{
    carregarMedicosDetalhes().then(m=>setTodosMedicos(m));
  },[]);

  const toggleMedico=(id)=>{
    setMedicosFiltro(prev=>
      prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]
    );
  };

  const medicosFiltroAtivos=medicosFiltro.length>0?medicosFiltro:todosMedicos.map(m=>m.id);

  const MENU=[
    {id:"metricas",label:"Métricas",icon:"📊"},
    {id:"episodios",label:"Episódios Clínicos",icon:"🏥"},
    {id:"presencial",label:"Atendimento Presencial",icon:"🏨"},
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

          {/* Filtro de médicos */}
          {todosMedicos.length>0&&(
            <div style={{marginTop:16,paddingTop:16,borderTop:`0.5px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.1em",marginBottom:8,paddingLeft:4}}>
                FILTRAR POR MÉDICO
              </div>
              {medicosFiltro.length>0&&(
                <button onClick={()=>setMedicosFiltro([])}
                  style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"none",
                    background:T.orangeBg||"#FFF7ED",color:T.orange,fontSize:11,
                    cursor:"pointer",fontFamily:T.f,marginBottom:6,textAlign:"left"}}>
                  ✕ Limpar filtro
                </button>
              )}
              {todosMedicos.map(m=>{
                const sel=medicosFiltro.includes(m.id);
                return(
                  <button key={m.id} onClick={()=>toggleMedico(m.id)}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"none",
                      textAlign:"left",cursor:"pointer",fontFamily:T.f,marginBottom:2,
                      background:sel?T.greenBg:"transparent",
                      display:"flex",alignItems:"center",gap:8,transition:"all 0.1s"}}>
                    <div style={{width:14,height:14,borderRadius:4,flexShrink:0,
                      border:sel?"none":"1px solid "+T.border,
                      background:sel?T.green:"transparent",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {sel&&<span style={{fontSize:9,color:"#FFF",fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{fontSize:12,color:sel?T.green:T.inkMid,fontWeight:sel?500:400,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {m.nome?.split(" ")[0]||"Médico"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{padding:"16px",borderTop:`0.5px solid ${T.border}`}}>
          <div style={{fontSize:12,color:T.inkMid,marginBottom:8}}>{admin.email}</div>
          <Btn onClick={onLogout} variant="outline" small style={{width:"100%"}}>Sair</Btn>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{flex:1,overflowY:"auto"}}>
        {tela==="metricas"&&<TelaMetricas medicosFiltro={medicosFiltroAtivos}/>}
        {tela==="episodios"&&<TelaEpisodios apiKey={apiKey}/>}
        {tela==="presencial"&&<TelaPresencial medicosFiltro={medicosFiltroAtivos}/>}
        {tela==="medicos"&&<TelaMedicos/>}
        {tela==="programas"&&<TelaProgramas/>}
      </div>
    </div>
  );
}

// ─── Tela Métricas ─────────────────────────────────────────────────
function TelaMetricas({medicosFiltro=[]}){
  const[metricas,setMetricas]=useState(null);
  const[medicos,setMedicos]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      carregarMetricasGerais(medicosFiltro),
      carregarMedicosDetalhes(),
    ]).then(([m,md])=>{
      setMetricas(m);
      setMedicos(md.filter(m=>medicosFiltro.length===0||medicosFiltro.includes(m.id)));
      setLoading(false);
    });
  },[JSON.stringify(medicosFiltro)]);

  if(loading)return<Spinner/>;

  const TIPO_LABEL={consulta:"Consultas",receita:"Prescrições",pedido_exame:"Pedidos de exame",atestado:"Atestados",estilo_vida:"Estilo de vida",relatorio:"Relatórios"};
  const TIPO_COR={consulta:T.blue,receita:T.green,pedido_exame:T.purple,atestado:T.orange,estilo_vida:T.green,relatorio:T.inkMid};

  return(
    <div style={{padding:"28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Visão geral · Stone</div>
          {medicosFiltro.length<(medicos.length||999)&&medicosFiltro.length>0&&(
            <div style={{fontSize:11,padding:"3px 10px",borderRadius:10,background:T.greenBg,color:T.green,fontWeight:500}}>
              {medicosFiltro.length} médico{medicosFiltro.length>1?"s":""} selecionado{medicosFiltro.length>1?"s":""}
            </div>
          )}
        </div>
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
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <div style={{fontSize:15,fontWeight:500,color:T.ink}}>{ep.nome}</div>
                    <Badge label={ep.tipo==="institucional"?"Institucional":"Customizado"}
                      color={ep.tipo==="institucional"?T.green:T.blue}/>
                    {!ep.publicado&&!ep.episodio_pai_id&&<Badge label="Rascunho" color={T.orange}/>}
                    {!ep.publicado&&ep.episodio_pai_id&&<Badge label="Nova versão — aguardando publicação" color={T.orange}/>}
                    {ep.publicado&&ep.tem_versao_pendente&&<Badge label="Nova versão em revisão" color={T.blue}/>}
                    {ep.versao&&ep.versao>1&&<Badge label={"v"+ep.versao} color={T.inkLight}/>}
                  </div>
                  <div style={{fontSize:12,color:T.inkMid}}>
                    {ep.cid_principal&&<span style={{marginRight:12}}>CID: {ep.cid_principal}</span>}
                    <span style={{marginRight:12}}>{ep.duracao_meses} meses</span>
                    {ep.renovavel&&<span style={{marginRight:12}}>✓ Renovável</span>}
                    <span>{ep.episodio_acoes?.length||0} ações · {ep.episodio_desfechos?.length||0} desfechos</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{fontSize:12,color:T.inkFaint}}>→</div>
                  <button onClick={async e=>{
                    e.stopPropagation();
                    if(window.confirm("Deletar o episódio "+ep.nome+"? Esta ação não pode ser desfeita.")){{
                      await deletarEpisodio(ep.id);
                      recarregar();
                    }}
                  }} style={{background:"none",border:"none",cursor:"pointer",color:T.red,fontSize:14,opacity:0.4,padding:"4px"}}
                  onMouseOver={e=>e.currentTarget.style.opacity=1}
                  onMouseOut={e=>e.currentTarget.style.opacity=0.4}>
                    🗑
                  </button>
                </div>
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
          messages:[{role:"user",content:"Voce e especialista em medicina baseada em evidencias e ICHOM. Para a condicao: CID "+cidTxt+" / "+nomeTxt+" com duracao "+duracao+" meses, crie um protocolo clinico. Retorne SOMENTE JSON valido sem comentarios nem trailing commas. Formato exato: {\"ichom_set\":\"nome\",\"ichom_url\":\"url ou empty string\",\"etapas\":[{\"titulo\":\"texto\",\"tipo\":\"consulta\",\"dia\":0,\"responsavel\":\"medico\",\"descricao\":\"texto curto\",\"unidade\":\"\",\"meta\":\"\",\"intermediario\":true}]}. Tipos validos: consulta, exame, medicamento, estilo_vida, questionario, desfecho_clinico, desfecho_pro. Responsaveis: medico, paciente, ana, equipe. dia = inteiro (0=inicio 30=1mes 90=3meses 180=6meses 365=12meses). Inclua 8 a 15 etapas ordenadas por dia. Para desfechos preencha unidade e meta."}]
        })
      });
      const data=await res.json();
      const raw=(data.content?.[0]?.text||"{}").trim();
      const match=raw.match(/\{[\s\S]*\}/);
      if(match){
        try{
          // Sanitizar: remover trailing commas, comentários e caracteres de controle em strings
          const sanitized=match[0]
            .replace(/,\s*([}\]])/g,"$1")
            .replace(/\/\/[^\n"]*/g,"")
            .replace(/[\x00-\x1F\x7F]/g," ") // caracteres de controle
            .replace(/\n\s*/g," "); // quebras de linha dentro de strings
          const parsed=JSON.parse(sanitized);
          setSugestao(parsed);
          setEtapas((parsed.etapas||[]).map((e,i)=>({...e,id:"temp_"+i,incluir:true})));
        }catch(e){
          console.warn("JSON falhou:",e.message);
        }
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
        versao:1,
        episodio_pai_id:null,
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
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          {!ep.publicado&&(
            <Btn onClick={publicar} disabled={publicando}>
              {publicando?"Publicando...":"✓ Publicar"}
            </Btn>
          )}
          {ep.publicado&&!ep.tem_versao_pendente&&(
            <Btn variant="outline" onClick={async()=>{
              if(window.confirm("Criar nova versão de rascunho de "+ep.nome+"? O episódio atual continua ativo até você publicar a nova versão.")){{
                const novoId=await criarNovaVersao(ep);
                if(novoId){
                  // Marcar que tem versão pendente
                  await supabase.from("episodios").update({tem_versao_pendente:true}).eq("id",ep.id);
                  onVoltar();
                }
              }}
            }}>
              📋 Nova versão
            </Btn>
          )}
          {ep.publicado&&(
            <Btn variant="outline" onClick={async()=>{
              if(window.confirm("Arquivar este episódio? Ele não ficará mais disponível para novos pacientes.")){{
                await supabase.from("episodios").update({ativo:false,publicado:false}).eq("id",ep.id);
                onVoltar();
              }}
            }}>
              Arquivar
            </Btn>
          )}
          {!ep.publicado&&ep.episodio_pai_id&&(
            <Btn onClick={async()=>{
              if(window.confirm("Publicar esta nova versão? Os pacientes do episódio anterior serão migrados automaticamente e o episódio anterior será arquivado.")){{
                await publicarNovaVersao(ep.id,ep.episodio_pai_id);
                onVoltar();
              }}
            }}>
              ✓ Publicar nova versão →
            </Btn>
          )}
          <Btn variant="danger" onClick={async()=>{
            if(window.confirm("Deletar permanentemente "+ep.nome+"? Esta ação não pode ser desfeita.")){{
              await deletarEpisodio(ep.id);
              onVoltar();
            }}
          }}>
            Deletar
          </Btn>
        </div>
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
  const[modalAberto,setModalAberto]=useState(false);
  const[salvando,setSalvando]=useState(false);
  const[sucesso,setSucesso]=useState(false);
  const[erro,setErro]=useState("");
  const[editando,setEditando]=useState(null);

  // Campos do formulário
  const[nome,setNome]=useState("");
  const[email,setEmail]=useState("");
  const[crm,setCrm]=useState("");
  const[especialidade,setEspecialidade]=useState("Medicina de Família e Comunidade");
  const[telefone,setTelefone]=useState("");
  const[senha,setSenha]=useState("");
  const[criarLogin,setCriarLogin]=useState(true);

  const especialidades=[
    "Medicina de Família e Comunidade",
    "Clínica Médica",
    "Cardiologia",
    "Endocrinologia",
    "Ortopedia",
    "Psiquiatria",
    "Ginecologia",
    "Pediatria",
    "Neurologia",
    "Reumatologia",
    "Outra",
  ];

  useEffect(()=>{
    carregarMedicos();
  },[]);

  const carregarMedicos=()=>{
    setLoading(true);
    carregarMedicosDetalhes().then(m=>{setMedicos(m);setLoading(false);});
  };

  const abrirModal=(med=null)=>{
    if(med){
      setEditando(med);
      setNome(med.nome||"");
      setEmail(med.email||"");
      setCrm(med.crm||"");
      setEspecialidade(med.especialidade||"Medicina de Família e Comunidade");
      setTelefone(med.telefone||"");
      setSenha("");
      setCriarLogin(false);
    } else {
      setEditando(null);
      setNome("");setEmail("");setCrm("");
      setEspecialidade("Medicina de Família e Comunidade");
      setTelefone("");setSenha("");setCriarLogin(true);
    }
    setErro("");setSucesso(false);
    setModalAberto(true);
  };

  const fecharModal=()=>{
    setModalAberto(false);
    setEditando(null);
    setErro("");setSucesso(false);
  };

  const salvar=async()=>{
    if(!nome.trim()||!email.trim()||!crm.trim()){
      setErro("Nome, e-mail e CRM são obrigatórios.");
      return;
    }
    setSalvando(true);setErro("");

    try{
      if(editando){
        // Atualizar médico existente
        const{error}=await supabase.from("medicos").update({
          nome:nome.trim(),email:email.trim(),crm:crm.trim(),
          especialidade,telefone:telefone.trim(),
        }).eq("id",editando.id);
        if(error)throw error;
      } else {
        // Criar novo médico
        let userId=null;

        if(criarLogin&&senha.length>=6){
          // Criar usuário no Auth
          const{data:authData,error:authErr}=await supabase.auth.admin
            ? await supabase.auth.signUp({email:email.trim(),password:senha,options:{data:{name:nome.trim(),role:"medico"}}})
            : {data:null,error:{message:"Admin API não disponível — crie o login manualmente"}};

          if(authErr&&!authErr.message.includes("Admin")){
            // Tentar criar via signUp normal
            const{data:sd}=await supabase.auth.signUp({
              email:email.trim(),password:senha,
              options:{data:{name:nome.trim(),role:"medico"}}
            });
            userId=sd?.user?.id||null;
          } else {
            userId=authData?.user?.id||null;
          }
        }

        const{error}=await supabase.from("medicos").insert({
          nome:nome.trim(),email:email.trim(),crm:crm.trim(),
          especialidade,telefone:telefone.trim(),
          user_id:userId,
          ativo:true,
        });
        if(error)throw error;
      }

      setSucesso(true);
      carregarMedicos();
      setTimeout(fecharModal,1500);
    }catch(e){
      setErro(e.message||"Erro ao salvar médico.");
    }finally{
      setSalvando(false);
    }
  };

  const inativar=async(id)=>{
    if(!window.confirm("Inativar este médico? Ele não poderá acessar o sistema."))return;
    await supabase.from("medicos").update({ativo:false}).eq("id",id);
    carregarMedicos();
  };

  if(loading)return<Spinner/>;

  return(
    <div style={{padding:"28px",maxWidth:1000,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Médicos</div>
          <div style={{fontSize:13,color:T.inkMid,marginTop:2}}>{medicos.length} médico{medicos.length!==1?"s":""} cadastrado{medicos.length!==1?"s":""}</div>
        </div>
        <button onClick={()=>abrirModal()}
          style={{padding:"10px 20px",background:T.green,color:"#FFF",border:"none",borderRadius:8,
            fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:T.f,display:"flex",alignItems:"center",gap:6}}>
          + Cadastrar médico
        </button>
      </div>

      {/* Lista */}
      <Card style={{padding:"0",overflow:"hidden"}}>
        {medicos.length===0?(
          <div style={{padding:"60px",textAlign:"center",color:T.inkFaint}}>
            <div style={{fontSize:40,marginBottom:12}}>👨‍⚕️</div>
            <div style={{fontSize:15,fontWeight:500,marginBottom:6,color:T.ink}}>Nenhum médico cadastrado</div>
            <div style={{fontSize:13,marginBottom:20}}>Cadastre o primeiro médico para começar o piloto</div>
            <button onClick={()=>abrirModal()}
              style={{padding:"10px 24px",background:T.green,color:"#FFF",border:"none",borderRadius:8,
                fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:T.f}}>
              + Cadastrar primeiro médico
            </button>
          </div>
        ):(
          <>
            {/* Cabeçalho */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 80px 80px 100px",
              padding:"10px 20px",background:T.bgWarm,borderBottom:"0.5px solid "+T.border,
              fontSize:10,color:T.inkFaint,fontWeight:500,letterSpacing:"0.08em"}}>
              <div>MÉDICO</div><div>ESPECIALIDADE</div><div>CRM</div>
              <div style={{textAlign:"center"}}>PACIENTES</div>
              <div style={{textAlign:"center"}}>CONSULTAS</div>
              <div></div>
            </div>
            {medicos.map(m=>(
              <div key={m.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 80px 80px 100px",
                padding:"14px 20px",borderBottom:"0.5px solid "+T.border,alignItems:"center",
                cursor:"pointer",transition:"background 0.1s"}}
                onClick={()=>abrirModal(m)}
                onMouseOver={e=>e.currentTarget.style.background=T.bgWarm}
                onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:T.greenBg,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                    👨‍⚕️
                  </div>
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:T.ink}}>{m.nome}</div>
                    <div style={{fontSize:11,color:T.inkMid}}>{m.email}</div>
                  </div>
                </div>
                <div style={{fontSize:12,color:T.inkMid}}>{m.especialidade||"—"}</div>
                <div style={{fontSize:12,color:T.inkMid,fontFamily:"monospace"}}>CRM {m.crm||"—"}</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:600,color:T.blue}}>{m.totalPacientes||0}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:600,color:T.green}}>{m.totalConsultas||0}</div>
                </div>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button onClick={e=>{e.stopPropagation();abrirModal(m);}}
                    style={{padding:"5px 12px",borderRadius:6,border:"0.5px solid "+T.border,
                      background:T.surface,fontSize:12,cursor:"pointer",fontFamily:T.f,color:T.ink}}>
                    Editar
                  </button>
                  <button onClick={e=>{e.stopPropagation();inativar(m.id);}}
                    style={{padding:"5px 10px",borderRadius:6,border:"0.5px solid "+T.border,
                      background:T.surface,fontSize:12,cursor:"pointer",fontFamily:T.f,color:T.inkMid}}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Modal */}
      {modalAberto&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:1000,padding:24}}>
          <div style={{background:T.surface,borderRadius:16,padding:"32px",maxWidth:480,
            width:"100%",boxShadow:"0 12px 40px rgba(0,0,0,0.15)",maxHeight:"90vh",overflowY:"auto"}}>

            <div style={{fontSize:18,fontWeight:600,color:T.ink,marginBottom:4}}>
              {editando?"Editar médico":"Cadastrar novo médico"}
            </div>
            <div style={{fontSize:13,color:T.inkMid,marginBottom:24}}>
              {editando?"Atualize os dados do médico":"Preencha os dados para criar o perfil do médico na plataforma"}
            </div>

            {sucesso?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>✅</div>
                <div style={{fontSize:16,fontWeight:500,color:T.green}}>
                  {editando?"Médico atualizado!":"Médico cadastrado com sucesso!"}
                </div>
              </div>
            ):(
              <>
                {/* Nome */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>NOME COMPLETO *</div>
                  <input value={nome} onChange={e=>setNome(e.target.value)}
                    placeholder="Dr(a). Nome Sobrenome"
                    style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                      fontFamily:T.f,fontSize:13,color:T.ink,outline:"none"}}/>
                </div>

                {/* Email */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>E-MAIL *</div>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                    placeholder="medico@exemplo.com"
                    style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                      fontFamily:T.f,fontSize:13,color:T.ink,outline:"none"}}/>
                </div>

                {/* CRM e Especialidade */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>CRM *</div>
                    <input value={crm} onChange={e=>setCrm(e.target.value)}
                      placeholder="123456/SP"
                      style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                        fontFamily:T.f,fontSize:13,color:T.ink,outline:"none"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>TELEFONE</div>
                    <input value={telefone} onChange={e=>setTelefone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                        fontFamily:T.f,fontSize:13,color:T.ink,outline:"none"}}/>
                  </div>
                </div>

                {/* Especialidade */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>ESPECIALIDADE *</div>
                  <select value={especialidade} onChange={e=>setEspecialidade(e.target.value)}
                    style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                      fontFamily:T.f,fontSize:13,color:T.ink,outline:"none",background:T.surface}}>
                    {especialidades.map(e=><option key={e}>{e}</option>)}
                  </select>
                </div>

                {/* Criar login */}
                {!editando&&(
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <input type="checkbox" checked={criarLogin} onChange={e=>setCriarLogin(e.target.checked)}
                        style={{accentColor:T.green,width:15,height:15}}/>
                      <div style={{fontSize:13,color:T.ink}}>Criar login de acesso ao app médico</div>
                    </div>
                    {criarLogin&&(
                      <div>
                        <div style={{fontSize:11,fontWeight:500,color:T.inkMid,marginBottom:5}}>SENHA PROVISÓRIA (mín. 6 caracteres)</div>
                        <input type="password" value={senha} onChange={e=>setSenha(e.target.value)}
                          placeholder="Senha provisória"
                          style={{width:"100%",padding:"10px 12px",border:"0.5px solid "+T.border,borderRadius:8,
                            fontFamily:T.f,fontSize:13,color:T.ink,outline:"none"}}/>
                        <div style={{fontSize:11,color:T.inkFaint,marginTop:4}}>O médico poderá alterar a senha no primeiro acesso</div>
                      </div>
                    )}
                  </div>
                )}

                {erro&&(
                  <div style={{padding:"10px 12px",background:T.redBg||"#FEF2F2",borderRadius:8,
                    fontSize:12,color:T.red||"#DC2626",marginBottom:14}}>
                    ⚠️ {erro}
                  </div>
                )}

                <div style={{display:"flex",gap:10}}>
                  <button onClick={fecharModal}
                    style={{flex:1,padding:"11px",borderRadius:8,border:"0.5px solid "+T.border,
                      background:T.surface,color:T.inkMid,fontSize:13,cursor:"pointer",fontFamily:T.f}}>
                    Cancelar
                  </button>
                  <button onClick={salvar} disabled={salvando}
                    style={{flex:2,padding:"11px",borderRadius:8,border:"none",
                      background:salvando?"#ccc":T.green,color:"#FFF",fontSize:13,fontWeight:500,
                      cursor:salvando?"not-allowed":"pointer",fontFamily:T.f}}>
                    {salvando?"Salvando...":(editando?"Salvar alterações":"Cadastrar médico")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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

// ─── Tela Atendimento Presencial ──────────────────────────────────
function TelaPresencial({medicosFiltro=[]}){
  const[aba,setAba]=useState("internacoes");
  const ABAS=[
    {id:"internacoes",label:"🏥 Internações"},
    {id:"ps",label:"🚨 Pronto-Socorro"},
    {id:"eletivas",label:"🏨 Consultas Eletivas"},
    {id:"exames",label:"🔬 Exames"},
    {id:"mensagens",label:"💬 Mensagens"},
  ];
  return(
    <div style={{padding:"28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:600,color:T.ink}}>Atendimento Presencial</div>
        <div style={{fontSize:13,color:T.inkMid,marginTop:4}}>Gestão de internações, encaminhamentos, exames e comunicação</div>
      </div>
      <div style={{display:"flex",gap:0,borderBottom:`0.5px solid ${T.border}`,marginBottom:20}}>
        {ABAS.map(a=>(
          <button key={a.id} onClick={()=>setAba(a.id)}
            style={{padding:"10px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:T.f,fontSize:13,
              borderBottom:`2px solid ${aba===a.id?T.green:"transparent"}`,
              color:aba===a.id?T.green:T.inkMid,fontWeight:aba===a.id?500:400,whiteSpace:"nowrap"}}>
            {a.label}
          </button>
        ))}
      </div>
      {aba==="internacoes"&&<AbaInternacoes/>}
      {aba==="ps"&&<AbaPS/>}
      {aba==="eletivas"&&<AbaEletivas/>}
      {aba==="exames"&&<AbaExamesAdmin/>}
      {aba==="mensagens"&&<AbaMensagensAdmin/>}
    </div>
  );
}

// ─── Aba Internações ──────────────────────────────────────────────
function AbaInternacoes(){
  const[lista,setLista]=useState([]);
  const[loading,setLoading]=useState(true);
  const[mostrarForm,setMostrarForm]=useState(false);
  const[editando,setEditando]=useState(null);
  const[pacientes,setPacientes]=useState([]);
  const[unidades,setUnidades]=useState([]);

  useEffect(()=>{
    Promise.all([
      supabase.from("internacoes").select("*,pacientes(nome),unidades_hospitalares(nome,tipo)").order("created_at",{ascending:false}),
      supabase.from("pacientes").select("id,nome").order("nome"),
      supabase.from("unidades_hospitalares").select("*").eq("ativo",true).order("nome"),
    ]).then(([{data:int},{data:pac},{data:uni}])=>{
      setLista(int||[]);setPacientes(pac||[]);setUnidades(uni||[]);setLoading(false);
    });
  },[]);

  const STATUS_COR={internado:T.orange,alta:T.green,transferido:T.blue,obito:T.red};
  const STATUS_LABEL={internado:"Internado",alta:"Alta",transferido:"Transferido",obito:"Óbito"};

  const salvarInternacao=async(dados)=>{
    if(editando){
      await supabase.from("internacoes").update({...dados,updated_at:new Date().toISOString()}).eq("id",editando.id);
    }else{
      await supabase.from("internacoes").insert(dados);
    }
    const{data}=await supabase.from("internacoes").select("*,pacientes(nome),unidades_hospitalares(nome,tipo)").order("created_at",{ascending:false});
    setLista(data||[]);setMostrarForm(false);setEditando(null);
  };

  if(loading)return<Spinner/>;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:13,color:T.inkMid}}>{lista.filter(i=>i.status==="internado").length} paciente(s) internado(s)</div>
        <Btn small onClick={()=>{setEditando(null);setMostrarForm(true)}}>+ Registrar internação</Btn>
      </div>

      {(mostrarForm||editando)&&(
        <FormInternacao
          inicial={editando}
          pacientes={pacientes}
          unidades={unidades}
          onSalvar={salvarInternacao}
          onCancelar={()=>{setMostrarForm(false);setEditando(null);}}/>
      )}

      {lista.length===0?(
        <Card style={{padding:"40px",textAlign:"center",color:T.inkFaint}}>
          <div style={{fontSize:32,marginBottom:8}}>🏥</div>
          <div>Nenhuma internação registrada</div>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {lista.map(i=>(
            <Card key={i.id} style={{padding:"16px 20px",borderLeft:`3px solid ${STATUS_COR[i.status]||T.border}`}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{i.pacientes?.nome||"—"}</div>
                    <Badge label={STATUS_LABEL[i.status]||i.status} color={STATUS_COR[i.status]||T.inkMid}/>
                    {i.unidade_parceira&&<Badge label="Parceiro" color={T.green} bg={T.greenBg}/>}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:T.inkMid}}>
                    {i.senha_internacao&&<span>Senha: <strong>{i.senha_internacao}</strong></span>}
                    <span>Unidade: {i.unidades_hospitalares?.nome||i.unidade_texto||"—"}</span>
                    {i.unidade_telefone&&<span>Tel: {i.unidade_telefone}</span>}
                    <span>Internação: {i.data_internacao}</span>
                    {i.data_prevista_alta&&<span>Prev. alta: {i.data_prevista_alta}</span>}
                    {i.data_efetiva_alta&&<span style={{color:T.green}}>Alta: {i.data_efetiva_alta}</span>}
                  </div>
                  {i.oportunidades_auditoria&&(
                    <div style={{marginTop:6,fontSize:12,color:T.orange,padding:"4px 10px",background:T.orangeBg,borderRadius:6,display:"inline-block"}}>
                      ⚠️ Auditoria: {i.oportunidades_auditoria}
                    </div>
                  )}
                </div>
                <Btn small variant="outline" onClick={()=>{setEditando(i);setMostrarForm(false);}}>Editar</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Form Internação ──────────────────────────────────────────────
function FormInternacao({inicial,pacientes,unidades,onSalvar,onCancelar}){
  const[pacId,setPacId]=useState(inicial?.paciente_id||"");
  const[senha,setSenha]=useState(inicial?.senha_internacao||"");
  const[unidadeId,setUnidadeId]=useState(inicial?.unidade_id||"");
  const[unidadeTxt,setUnidadeTxt]=useState(inicial?.unidade_texto||"");
  const[tel,setTel]=useState(inicial?.unidade_telefone||"");
  const[parceira,setParceira]=useState(inicial?.unidade_parceira||false);
  const[dataInt,setDataInt]=useState(inicial?.data_internacao||dataHoje());
  const[dataPrevAlta,setDataPrevAlta]=useState(inicial?.data_prevista_alta||"");
  const[dataEfAlta,setDataEfAlta]=useState(inicial?.data_efetiva_alta||"");
  const[auditoria,setAuditoria]=useState(inicial?.oportunidades_auditoria||"");
  const[status,setStatus]=useState(inicial?.status||"internado");
  const[salvando,setSalvando]=useState(false);

  // Auto-preencher telefone ao selecionar unidade
  useEffect(()=>{
    if(unidadeId){
      const u=unidades.find(u=>u.id===unidadeId);
      if(u){setTel(u.telefone||"");setParceira(u.tipo==="parceiro");}
    }
  },[unidadeId]);

  const handleSalvar=async()=>{
    if(!pacId||!dataInt)return;
    setSalvando(true);
    await onSalvar({
      paciente_id:pacId,
      senha_internacao:senha||null,
      unidade_id:unidadeId||null,
      unidade_texto:unidadeTxt||null,
      unidade_telefone:tel||null,
      unidade_parceira:parceira,
      data_internacao:dataInt,
      data_prevista_alta:dataPrevAlta||null,
      data_efetiva_alta:dataEfAlta||null,
      oportunidades_auditoria:auditoria||null,
      status,
    });
    setSalvando(false);
  };

  return(
    <Card style={{padding:"20px",marginBottom:16,border:`1px solid ${T.greenBorder}`,background:T.greenBg}}>
      <div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:14}}>{inicial?"Editar internação":"Nova internação"}</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12}}>
        <Select label="PACIENTE" value={pacId} onChange={setPacId} required
          options={[{value:"",label:"Selecionar paciente..."},...pacientes.map(p=>({value:p.id,label:p.nome}))]}/>
        <Input label="SENHA DA INTERNAÇÃO" value={senha} onChange={setSenha} placeholder="Ex: 123456"/>
        <Select label="STATUS" value={status} onChange={setStatus} options={[
          {value:"internado",label:"Internado"},{value:"alta",label:"Alta"},
          {value:"transferido",label:"Transferido"},{value:"obito",label:"Óbito"},
        ]}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12}}>
        <Select label="UNIDADE HOSPITALAR" value={unidadeId} onChange={setUnidadeId}
          options={[{value:"",label:"Selecionar ou digitar abaixo..."},...unidades.map(u=>({value:u.id,label:u.nome+" "+(u.tipo==="parceiro"?"★":"")}))]}/>
        <Input label="UNIDADE (texto livre)" value={unidadeTxt} onChange={setUnidadeTxt} placeholder="Se não cadastrada"/>
        <Input label="TELEFONE" value={tel} onChange={setTel} placeholder="(11) 9999-9999"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
        <Input label="DATA INTERNAÇÃO" value={dataInt} onChange={setDataInt} type="date" required/>
        <Input label="PREV. ALTA" value={dataPrevAlta} onChange={setDataPrevAlta} type="date"/>
        <Input label="ALTA EFETIVA" value={dataEfAlta} onChange={setDataEfAlta} type="date"/>
        <div style={{paddingTop:18,display:"flex",alignItems:"center",gap:8}}>
          <input type="checkbox" id="parceira" checked={parceira} onChange={e=>setParceira(e.target.checked)} style={{accentColor:T.green}}/>
          <label htmlFor="parceira" style={{fontSize:12,color:T.inkMid,cursor:"pointer"}}>Unidade parceira</label>
        </div>
      </div>
      <Textarea label="OPORTUNIDADES DE AUDITORIA" value={auditoria} onChange={setAuditoria} placeholder="Registre observações de auditoria..." rows={2}/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn variant="outline" small onClick={onCancelar}>Cancelar</Btn>
        <Btn small onClick={handleSalvar} disabled={salvando||!pacId||!dataInt}>{salvando?"Salvando...":"✓ Salvar"}</Btn>
      </div>
    </Card>
  );
}

// ─── Aba PS ───────────────────────────────────────────────────────
function AbaPS(){
  const[lista,setLista]=useState([]);
  const[loading,setLoading]=useState(true);
  const[expandido,setExpandido]=useState(null);
  const[unidades,setUnidades]=useState([]);

  useEffect(()=>{
    Promise.all([
      supabase.from("encaminhamentos").select("*,pacientes(nome),medicos(nome)").eq("tipo","ps").order("created_at",{ascending:false}),
      supabase.from("unidades_hospitalares").select("*").eq("ativo",true).order("nome"),
    ]).then(([{data:enc},{data:uni}])=>{setLista(enc||[]);setUnidades(uni||[]);setLoading(false);});
  },[]);

  const atualizar=async(id,campos)=>{
    await supabase.from("encaminhamentos").update({...campos,updated_at:new Date().toISOString()}).eq("id",id);
    const{data}=await supabase.from("encaminhamentos").select("*,pacientes(nome),medicos(nome)").eq("tipo","ps").order("created_at",{ascending:false});
    setLista(data||[]);
  };

  const STATUS_COR={pendente:T.red,contato_realizado:T.orange,agendado:T.blue,realizado:T.green,cancelado:T.inkMid};
  const DESFECHO_LABEL={liberado:"🏠 Liberado para casa",observacao:"👁 Em observação",enfermaria:"🛏 Internado — Enfermaria",cti:"🚨 Internado — CTI",cirurgia:"🔪 Indicação cirúrgica"};
  const URGENCIA_COR={emergencia:T.red,urgente:T.orange,normal:T.inkMid};

  if(loading)return<Spinner/>;
  return(
    <div>
      <div style={{fontSize:13,color:T.inkMid,marginBottom:16}}>
        {lista.filter(e=>e.status==="pendente").length} encaminhamento(s) pendente(s) de contato
      </div>
      {lista.length===0?(
        <Card style={{padding:"40px",textAlign:"center",color:T.inkFaint}}>
          <div style={{fontSize:32,marginBottom:8}}>🚨</div>
          <div>Nenhum encaminhamento ao PS</div>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {lista.map(enc=>{
            const aberto=expandido===enc.id;
            return(
              <Card key={enc.id} style={{padding:"0",overflow:"hidden",borderLeft:`3px solid ${STATUS_COR[enc.status]||T.border}`}}>
                <div style={{padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}} onClick={()=>setExpandido(aberto?null:enc.id)}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{enc.pacientes?.nome||"—"}</div>
                      <Badge label={enc.status.replace("_"," ")} color={STATUS_COR[enc.status]||T.inkMid}/>
                      {enc.urgencia==="emergencia"&&<Badge label="⚡ EMERGÊNCIA" color={T.red}/>}
                      {enc.urgencia==="urgente"&&<Badge label="⚠️ URGENTE" color={T.orange}/>}
                    </div>
                    <div style={{fontSize:12,color:T.inkMid}}>
                      Médico: {enc.medicos?.nome||"—"} · {new Date(enc.created_at).toLocaleString("pt-BR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                      {enc.motivo&&<span> · {enc.motivo}</span>}
                    </div>
                    {enc.desfecho_ps&&(
                      <div style={{marginTop:4,fontSize:12,fontWeight:500,color:T.green}}>{DESFECHO_LABEL[enc.desfecho_ps]}</div>
                    )}
                  </div>
                  <span style={{fontSize:12,color:T.inkFaint}}>{aberto?"▲":"▼"}</span>
                </div>
                {aberto&&(
                  <div style={{borderTop:`0.5px solid ${T.border}`,padding:"16px 18px",background:T.bgWarm}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>TENTATIVA DE CONTATO</div>
                        <input type="datetime-local" defaultValue={enc.hora_tentativa_contato?.slice(0,16)||""}
                          onBlur={e=>atualizar(enc.id,{hora_tentativa_contato:e.target.value||null,tentativas_contato:(enc.tentativas_contato||0)+1})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>CONTATO REALIZADO</div>
                        <input type="datetime-local" defaultValue={enc.hora_contato_realizado?.slice(0,16)||""}
                          onBlur={e=>atualizar(enc.id,{hora_contato_realizado:e.target.value||null,status:e.target.value?"contato_realizado":enc.status})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>UNIDADE COMBINADA</div>
                        <input defaultValue={enc.unidade_texto||""} placeholder="Nome da unidade"
                          onBlur={e=>atualizar(enc.id,{unidade_texto:e.target.value,status:"agendado"})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:8}}>DESFECHO</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {Object.entries(DESFECHO_LABEL).map(([val,label])=>(
                          <button key={val} onClick={()=>atualizar(enc.id,{desfecho_ps:val,status:"realizado"})}
                            style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${enc.desfecho_ps===val?T.green:T.border}`,
                              background:enc.desfecho_ps===val?T.greenBg:T.surface,
                              color:enc.desfecho_ps===val?T.green:T.inkMid,
                              fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Aba Consultas Eletivas ───────────────────────────────────────
function AbaEletivas(){
  const[lista,setLista]=useState([]);
  const[loading,setLoading]=useState(true);
  const[expandido,setExpandido]=useState(null);

  useEffect(()=>{
    supabase.from("encaminhamentos").select("*,pacientes(nome),medicos(nome)")
      .eq("tipo","eletiva").order("created_at",{ascending:false})
      .then(({data})=>{setLista(data||[]);setLoading(false);});
  },[]);

  const atualizar=async(id,campos)=>{
    await supabase.from("encaminhamentos").update({...campos,updated_at:new Date().toISOString()}).eq("id",id);
    const{data}=await supabase.from("encaminhamentos").select("*,pacientes(nome),medicos(nome)").eq("tipo","eletiva").order("created_at",{ascending:false});
    setLista(data||[]);
  };

  const STATUS_COR={pendente:T.orange,contato_realizado:T.blue,agendado:T.blue,realizado:T.green,cancelado:T.inkMid};

  if(loading)return<Spinner/>;
  return(
    <div>
      <div style={{fontSize:13,color:T.inkMid,marginBottom:16}}>
        {lista.filter(e=>e.status==="pendente").length} encaminhamento(s) pendente(s)
      </div>
      {lista.length===0?(
        <Card style={{padding:"40px",textAlign:"center",color:T.inkFaint}}>
          <div style={{fontSize:32,marginBottom:8}}>🏨</div>
          <div>Nenhum encaminhamento eletivo</div>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {lista.map(enc=>{
            const aberto=expandido===enc.id;
            return(
              <Card key={enc.id} style={{padding:"0",overflow:"hidden",borderLeft:`3px solid ${STATUS_COR[enc.status]||T.border}`}}>
                <div style={{padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}} onClick={()=>setExpandido(aberto?null:enc.id)}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{enc.pacientes?.nome||"—"}</div>
                      <Badge label={enc.status.replace("_"," ")} color={STATUS_COR[enc.status]||T.inkMid}/>
                      {enc.especialidade&&<Badge label={enc.especialidade} color={T.blue} bg={T.blueBg}/>}
                    </div>
                    <div style={{fontSize:12,color:T.inkMid}}>
                      Médico: {enc.medicos?.nome||"—"} · {new Date(enc.created_at).toLocaleString("pt-BR",{day:"numeric",month:"short"})}
                      {enc.motivo&&<span> · {enc.motivo}</span>}
                    </div>
                    {enc.data_agendada&&<div style={{fontSize:12,color:T.blue,marginTop:2}}>📅 Agendado: {enc.data_agendada} {enc.hora_agendada&&enc.hora_agendada.slice(0,5)} — {enc.unidade_texto||"—"}</div>}
                    {enc.consulta_realizada&&<div style={{fontSize:12,color:T.green,marginTop:2}}>✓ Realizada em {enc.data_consulta_realizada}</div>}
                    {enc.retorno_medico_pessoal&&<div style={{fontSize:12,color:T.green,marginTop:2}}>✓ Retorno ao médico em {enc.data_retorno_medico||"—"}</div>}
                  </div>
                  <span style={{fontSize:12,color:T.inkFaint}}>{aberto?"▲":"▼"}</span>
                </div>
                {aberto&&(
                  <div style={{borderTop:`0.5px solid ${T.border}`,padding:"16px 18px",background:T.bgWarm}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>TENTATIVA DE CONTATO</div>
                        <input type="datetime-local" defaultValue={enc.hora_tentativa_contato?.slice(0,16)||""}
                          onBlur={e=>atualizar(enc.id,{hora_tentativa_contato:e.target.value||null,tentativas_contato:(enc.tentativas_contato||0)+1})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>CONTATO REALIZADO</div>
                        <input type="datetime-local" defaultValue={enc.hora_contato_realizado?.slice(0,16)||""}
                          onBlur={e=>atualizar(enc.id,{hora_contato_realizado:e.target.value||null,status:e.target.value?"contato_realizado":enc.status})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>Nº TENTATIVAS</div>
                        <div style={{fontSize:20,fontWeight:700,color:T.ink,padding:"7px 0"}}>{enc.tentativas_contato||0}</div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>LOCAL COMBINADO</div>
                        <input defaultValue={enc.unidade_texto||""} placeholder="Nome da unidade / endereço"
                          onBlur={e=>atualizar(enc.id,{unidade_texto:e.target.value})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>DATA</div>
                        <input type="date" defaultValue={enc.data_agendada||""}
                          onBlur={e=>atualizar(enc.id,{data_agendada:e.target.value||null,status:"agendado"})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>HORA</div>
                        <input type="time" defaultValue={enc.hora_agendada?.slice(0,5)||""}
                          onBlur={e=>atualizar(enc.id,{hora_agendada:e.target.value||null})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      <button onClick={()=>atualizar(enc.id,{consulta_realizada:!enc.consulta_realizada,data_consulta_realizada:enc.consulta_realizada?null:dataHoje(),status:enc.consulta_realizada?"agendado":"realizado"})}
                        style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${enc.consulta_realizada?T.green:T.border}`,background:enc.consulta_realizada?T.greenBg:T.surface,color:enc.consulta_realizada?T.green:T.inkMid,fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                        {enc.consulta_realizada?"✓ Consulta realizada":"Marcar como realizada"}
                      </button>
                      {enc.consulta_realizada&&(
                        <button onClick={()=>atualizar(enc.id,{retorno_medico_pessoal:!enc.retorno_medico_pessoal,data_retorno_medico:enc.retorno_medico_pessoal?null:dataHoje()})}
                          style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${enc.retorno_medico_pessoal?T.green:T.border}`,background:enc.retorno_medico_pessoal?T.greenBg:T.surface,color:enc.retorno_medico_pessoal?T.green:T.inkMid,fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                          {enc.retorno_medico_pessoal?"✓ Retorno ao médico registrado":"Registrar retorno ao médico pessoal"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Aba Exames Admin ─────────────────────────────────────────────
function AbaExamesAdmin(){
  const[lista,setLista]=useState([]);
  const[loading,setLoading]=useState(true);
  const[expandido,setExpandido]=useState(null);

  useEffect(()=>{
    // Buscar exames acompanhamento + documentos pedido_exame sem acompanhamento
    Promise.all([
      supabase.from("exames_acompanhamento")
        .select("*,pacientes(nome),medicos(nome),documentos(titulo,conteudo_json)")
        .order("created_at",{ascending:false}),
      supabase.from("documentos")
        .select("id,paciente_id,medico_id,titulo,conteudo_json,created_at,pacientes(nome),medicos(nome)")
        .eq("tipo","pedido_exame")
        .order("created_at",{ascending:false})
        .limit(50),
    ]).then(async([{data:acomp},{data:docs}])=>{
      // Encontrar docs sem acompanhamento e criar registros
      const acompIds=new Set((acomp||[]).map(a=>a.documento_id));
      const semAcomp=(docs||[]).filter(d=>!acompIds.has(d.id));
      if(semAcomp.length>0){
        await supabase.from("exames_acompanhamento").insert(
          semAcomp.map(d=>({paciente_id:d.paciente_id,medico_id:d.medico_id,documento_id:d.id,status:"pendente"}))
        );
        // Recarregar
        const{data:novo}=await supabase.from("exames_acompanhamento")
          .select("*,pacientes(nome),medicos(nome),documentos(titulo,conteudo_json)")
          .order("created_at",{ascending:false});
        setLista(novo||[]);
      } else {
        setLista(acomp||[]);
      }
      setLoading(false);
    });
  },[]);

  const atualizar=async(id,campos)=>{
    await supabase.from("exames_acompanhamento").update({...campos,updated_at:new Date().toISOString()}).eq("id",id);
    const{data}=await supabase.from("exames_acompanhamento").select("*,pacientes(nome),medicos(nome),documentos(titulo,conteudo_json)").order("created_at",{ascending:false});
    setLista(data||[]);
  };

  const STATUS_COR={pendente:T.orange,contato_realizado:T.blue,agendado:T.blue,realizado:T.green,resultado_recebido:T.green,cancelado:T.inkMid};

  if(loading)return<Spinner/>;
  return(
    <div>
      <div style={{fontSize:13,color:T.inkMid,marginBottom:16}}>
        {lista.filter(e=>e.status==="pendente").length} pedido(s) pendente(s) de agendamento
      </div>
      {lista.length===0?(
        <Card style={{padding:"40px",textAlign:"center",color:T.inkFaint}}>
          <div style={{fontSize:32,marginBottom:8}}>🔬</div>
          <div>Nenhum pedido de exame para acompanhar</div>
          <div style={{fontSize:12,color:T.inkFaint,marginTop:6}}>Os exames aparecem aqui quando o médico emite um pedido no app</div>
        </Card>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {lista.map(ex=>{
            const aberto=expandido===ex.id;
            const doc=ex.documentos;
            const conteudo=doc?.conteudo_json?(typeof doc.conteudo_json==="string"?JSON.parse(doc.conteudo_json):doc.conteudo_json):null;
            const examesLista=conteudo?.exames||[];
            return(
              <Card key={ex.id} style={{padding:"0",overflow:"hidden",borderLeft:`3px solid ${STATUS_COR[ex.status]||T.border}`}}>
                <div style={{padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,cursor:"pointer"}} onClick={()=>setExpandido(aberto?null:ex.id)}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{ex.pacientes?.nome||"—"}</div>
                      <Badge label={ex.status.replace(/_/g," ")} color={STATUS_COR[ex.status]||T.inkMid}/>
                    </div>
                    <div style={{fontSize:12,color:T.inkMid}}>
                      Médico: {ex.medicos?.nome||"—"} · {new Date(ex.created_at).toLocaleString("pt-BR",{day:"numeric",month:"short"})}
                    </div>
                    {examesLista.length>0&&(
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                        {examesLista.map((e,i)=><Badge key={i} label={e.nome} color={T.purple} bg={T.purpleBg}/>)}
                      </div>
                    )}
                    {ex.data_agendada&&<div style={{fontSize:12,color:T.blue,marginTop:2}}>📅 {ex.data_agendada} {ex.hora_agendada&&ex.hora_agendada.slice(0,5)} — {ex.unidade_texto||"—"}</div>}
                  </div>
                  <span style={{fontSize:12,color:T.inkFaint}}>{aberto?"▲":"▼"}</span>
                </div>
                {aberto&&(
                  <div style={{borderTop:`0.5px solid ${T.border}`,padding:"16px 18px",background:T.bgWarm}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>TENTATIVA DE CONTATO</div>
                        <input type="datetime-local" defaultValue={ex.hora_tentativa_contato?.slice(0,16)||""}
                          onBlur={e=>atualizar(ex.id,{hora_tentativa_contato:e.target.value||null,tentativas_contato:(ex.tentativas_contato||0)+1})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>CONTATO REALIZADO</div>
                        <input type="datetime-local" defaultValue={ex.hora_contato_realizado?.slice(0,16)||""}
                          onBlur={e=>atualizar(ex.id,{hora_contato_realizado:e.target.value||null,status:e.target.value?"contato_realizado":ex.status})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>Nº TENTATIVAS</div>
                        <div style={{fontSize:20,fontWeight:700,color:T.ink,padding:"7px 0"}}>{ex.tentativas_contato||0}</div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>LOCAL / LABORATÓRIO</div>
                        <input defaultValue={ex.unidade_texto||""} placeholder="Nome do laboratório / clínica"
                          onBlur={e=>atualizar(ex.id,{unidade_texto:e.target.value,status:"agendado"})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>DATA</div>
                        <input type="date" defaultValue={ex.data_agendada||""}
                          onBlur={e=>atualizar(ex.id,{data_agendada:e.target.value||null})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:T.inkFaint,letterSpacing:"0.08em",marginBottom:5}}>HORA</div>
                        <input type="time" defaultValue={ex.hora_agendada?.slice(0,5)||""}
                          onBlur={e=>atualizar(ex.id,{hora_agendada:e.target.value||null})}
                          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:12}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      <button onClick={()=>atualizar(ex.id,{realizado:!ex.realizado,data_realizado:ex.realizado?null:dataHoje(),status:ex.realizado?"agendado":"realizado"})}
                        style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${ex.realizado?T.green:T.border}`,background:ex.realizado?T.greenBg:T.surface,color:ex.realizado?T.green:T.inkMid,fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                        {ex.realizado?"✓ Exame realizado":"Marcar como realizado"}
                      </button>
                      {ex.realizado&&(
                        <button onClick={()=>atualizar(ex.id,{resultado_recebido:!ex.resultado_recebido,status:ex.resultado_recebido?"realizado":"resultado_recebido"})}
                          style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${ex.resultado_recebido?T.green:T.border}`,background:ex.resultado_recebido?T.greenBg:T.surface,color:ex.resultado_recebido?T.green:T.inkMid,fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                          {ex.resultado_recebido?"✓ Resultado recebido":"Registrar resultado recebido"}
                        </button>
                      )}
                      {ex.resultado_recebido&&(
                        <button onClick={()=>atualizar(ex.id,{retorno_medico:!ex.retorno_medico})}
                          style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${ex.retorno_medico?T.green:T.border}`,background:ex.retorno_medico?T.greenBg:T.surface,color:ex.retorno_medico?T.green:T.inkMid,fontSize:12,cursor:"pointer",fontFamily:T.f}}>
                          {ex.retorno_medico?"✓ Retorno ao médico":"Registrar retorno ao médico"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Aba Mensagens Admin ──────────────────────────────────────────
function AbaMensagensAdmin(){
  const[pacientes,setPacientes]=useState([]);
  const[pacSel,setPacSel]=useState("");
  const[medico,setMedico]=useState(null);
  const[msgsMedico,setMsgsMedico]=useState([]);
  const[msgsPaciente,setMsgsPaciente]=useState([]);
  const[inputMedico,setInputMedico]=useState("");
  const[inputPaciente,setInputPaciente]=useState("");
  const[loading,setLoading]=useState(true);
  const bottomMedicoRef=useRef(null);
  const bottomPacienteRef=useRef(null);

  useEffect(()=>{
    supabase.from("pacientes").select("id,nome,medico_id,medicos(id,nome)").order("nome")
      .then(({data})=>{setPacientes(data||[]);setLoading(false);});
  },[]);

  useEffect(()=>{
    if(!pacSel)return;
    const pac=pacientes.find(p=>p.id===pacSel);
    setMedico(pac?.medicos||null);
    // Carregar mensagens
    Promise.all([
      supabase.from("mensagens_admin").select("*").eq("paciente_id",pacSel).eq("destinatario_tipo","medico").order("created_at"),
      supabase.from("mensagens_admin").select("*").eq("paciente_id",pacSel).eq("destinatario_tipo","paciente").order("created_at"),
    ]).then(([{data:m},{data:p}])=>{setMsgsMedico(m||[]);setMsgsPaciente(p||[]);});
  },[pacSel]);

  useEffect(()=>{bottomMedicoRef.current?.scrollIntoView({behavior:"smooth"});},[msgsMedico]);
  useEffect(()=>{bottomPacienteRef.current?.scrollIntoView({behavior:"smooth"});},[msgsPaciente]);

  const enviarMensagem=async(tipo,conteudo,setter,setInput)=>{
    if(!conteudo.trim()||!pacSel)return;
    const pac=pacientes.find(p=>p.id===pacSel);
    const destId=tipo==="medico"?pac?.medico_id:pacSel;
    if(!destId)return;
    await supabase.from("mensagens_admin").insert({
      paciente_id:pacSel,
      destinatario_tipo:tipo,
      destinatario_id:destId,
      remetente_tipo:"admin",
      remetente_id:"00000000-0000-0000-0000-000000000000", // admin fixo por ora
      conteudo:conteudo.trim(),
    });
    setInput("");
    const{data}=await supabase.from("mensagens_admin").select("*").eq("paciente_id",pacSel).eq("destinatario_tipo",tipo).order("created_at");
    setter(data||[]);
  };

  const ChatBox=({titulo,msgs,input,setInput,onEnviar,bottomRef})=>(
    <div style={{flex:1,display:"flex",flexDirection:"column",border:`0.5px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:`0.5px solid ${T.border}`,background:T.bgWarm,fontSize:13,fontWeight:500,color:T.ink}}>{titulo}</div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",minHeight:200,maxHeight:320,display:"flex",flexDirection:"column",gap:8}}>
        {msgs.length===0&&<div style={{fontSize:12,color:T.inkFaint,textAlign:"center",paddingTop:20}}>Nenhuma mensagem ainda</div>}
        {msgs.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:m.remetente_tipo==="admin"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"75%",padding:"8px 12px",borderRadius:10,fontSize:12,lineHeight:1.5,
              background:m.remetente_tipo==="admin"?T.green:T.bgWarm,
              color:m.remetente_tipo==="admin"?"#FFF":T.ink}}>
              {m.conteudo}
              <div style={{fontSize:9,opacity:0.7,marginTop:2,textAlign:"right"}}>
                {new Date(m.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"10px 12px",borderTop:`0.5px solid ${T.border}`,display:"flex",gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&onEnviar()}
          placeholder="Digite sua mensagem..."
          style={{flex:1,padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:13,outline:"none"}}/>
        <Btn small onClick={onEnviar} disabled={!input.trim()}>Enviar</Btn>
      </div>
    </div>
  );

  if(loading)return<Spinner/>;
  return(
    <div>
      <div style={{marginBottom:16}}>
        <Select label="SELECIONAR PACIENTE" value={pacSel} onChange={setPacSel}
          options={[{value:"",label:"Selecionar paciente..."},...pacientes.map(p=>({value:p.id,label:p.nome}))]}/>
      </div>
      {!pacSel?(
        <Card style={{padding:"40px",textAlign:"center",color:T.inkFaint}}>
          <div style={{fontSize:32,marginBottom:8}}>💬</div>
          <div>Selecione um paciente para ver as mensagens</div>
        </Card>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <ChatBox
            titulo={"💬 Médico — "+(medico?.nome||"—")}
            msgs={msgsMedico}
            input={inputMedico}
            setInput={setInputMedico}
            onEnviar={()=>enviarMensagem("medico",inputMedico,setMsgsMedico,setInputMedico)}
            bottomRef={bottomMedicoRef}/>
          <ChatBox
            titulo={"💬 Paciente — "+(pacientes.find(p=>p.id===pacSel)?.nome||"—")}
            msgs={msgsPaciente}
            input={inputPaciente}
            setInput={setInputPaciente}
            onEnviar={()=>enviarMensagem("paciente",inputPaciente,setMsgsPaciente,setInputPaciente)}
            bottomRef={bottomPacienteRef}/>
        </div>
      )}
    </div>
  );
}