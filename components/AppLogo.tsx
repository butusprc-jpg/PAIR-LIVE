type AppLogoProps={context?:'ADMIN'|'OWNER';large?:boolean};

export default function AppLogo({context,large=false}:AppLogoProps){
 return <div className={'brand app-logo'+(large?' app-logo-large':'')}>
  <img src="/bo-kung-chiangmai-logo.webp" alt="บ่อกุ้งเชียงใหม่" width={1536} height={1024}/>
  {context&&<small className="brand-demo">{context}</small>}
 </div>;
}
