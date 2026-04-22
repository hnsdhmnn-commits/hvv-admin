import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ScreenLogin, AppAdmin } from './Components';

const supabase = createClient(
  "https://ahznewkkcyakkilaatas.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoem5ld2trY3lha2tpbGFhdGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTQzMTIsImV4cCI6MjA5MTg3MDMxMn0.4nFFkuhRTNCXFnkSQDjc_JNi0yoHUBUfT4mgcQ2-3ak"
);

export default function App(){
  const[screen,setScreen]=useState("loading");
  const[admin,setAdmin]=useState(null);
  const[apiKey,setApiKey]=useState(localStorage.getItem("hvv_admin_api_key")||"");
  const[inputChave,setInputChave]=useState("");

  useEffect(()=>{
    supabase.auth.getSession().then(async({data:{session}})=>{
      if(session?.user){
        // Por ora, qualquer usuário autenticado pode acessar o admin
        // Futuramente: verificar tabela admins
        setAdmin({userId:session.user.id,email:session.user.email,nome:"Administrador HVV"});
        setScreen("app");
      }else{
        setScreen("login");
      }
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_OUT"){setAdmin(null);setScreen("login");}
    });
    return()=>subscription.unsubscribe();
  },[]);

  const handleLogin=async(email,senha)=>{
    const{error}=await supabase.auth.signInWithPassword({email,password:senha});
    if(error)return error.message;
    return null;
  };

  const handleLogout=async()=>{
    await supabase.auth.signOut();
    localStorage.removeItem("hvv_admin_api_key");
  };

  const handleConfirmarChave=(k)=>{
    localStorage.setItem("hvv_admin_api_key",k);
    setApiKey(k);
  };

  const T={green:"#00A868",ink:"#2C2C2A",inkMid:"#5F5E5A",border:"rgba(0,0,0,0.10)",surface:"#FFF",bg:"#F7F6F2",f:"system-ui"};

  if(screen==="loading")return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.f}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:36,height:36,borderRadius:10,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:18,margin:"0 auto 16px"}}>A</div>
        <div style={{fontSize:13,color:"#888"}}>Carregando...</div>
      </div>
    </div>
  );

  if(screen==="login")return<ScreenLogin onLogin={handleLogin} titulo="HVV Admin" subtitulo="Painel de administração"/>;

  if(!apiKey){
    return(
      <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.f,padding:24}}>
        <div style={{width:"100%",maxWidth:440}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32,justifyContent:"center"}}>
            <div style={{width:32,height:32,borderRadius:8,background:T.green,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:700,fontSize:15}}>A</div>
            <span style={{fontSize:17,fontWeight:500,color:T.ink}}>HVV Admin</span>
          </div>
          <div style={{background:T.surface,border:`0.5px solid ${T.border}`,borderRadius:12,padding:"28px"}}>
            <div style={{fontSize:18,fontWeight:500,color:T.ink,marginBottom:4}}>Configurar IA</div>
            <div style={{fontSize:13,color:"#888",marginBottom:20,lineHeight:1.6}}>
              Para usar sugestões automáticas de desfechos ICHOM e outras funcionalidades de IA, insira sua chave Anthropic.
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:"0.1em",marginBottom:6}}>CHAVE API ANTHROPIC</div>
              <input type="password" value={inputChave} onChange={e=>setInputChave(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&inputChave.startsWith("sk-")&&handleConfirmarChave(inputChave)}
                placeholder="sk-ant-..."
                style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontFamily:T.f,fontSize:13,color:T.ink,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <button onClick={()=>handleConfirmarChave(inputChave)} disabled={!inputChave.startsWith("sk-")}
              style={{width:"100%",padding:"10px",background:inputChave.startsWith("sk-")?T.green:"#ccc",color:"#FFF",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:inputChave.startsWith("sk-")?"pointer":"not-allowed",fontFamily:T.f}}>
              Entrar →
            </button>
            <button onClick={()=>handleConfirmarChave("skip")}
              style={{width:"100%",marginTop:10,padding:"8px",background:"transparent",border:"none",color:"#888",fontSize:12,cursor:"pointer",fontFamily:T.f}}>
              Pular — usar sem IA
            </button>
          </div>
        </div>
      </div>
    );
  }

  return<AppAdmin admin={admin} apiKey={apiKey!=="skip"?apiKey:""} onLogout={handleLogout}/>;
}
