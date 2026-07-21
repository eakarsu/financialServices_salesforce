import React,{createContext,useContext,useEffect,useState}from'react';
import{apiFetch,setToken,getToken}from'./api.js';
const AuthContext=createContext(null);
export function AuthProvider({children}){const[user,setUser]=useState(null);const[ready,setReady]=useState(false);
  useEffect(()=>{let live=true;(async()=>{if(!getToken())return;try{const data=await apiFetch('/api/auth/session');if(live)setUser(data.user);}catch{setToken(null);}})().finally(()=>{if(live)setReady(true);});if(!getToken())setReady(true);return()=>{live=false};},[]);
  async function login(tenant,email,password){const data=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({tenant,email,password})});setToken(data.token);setUser(data.user);return data.user;}
  function logout(){setToken(null);setUser(null);}return <AuthContext.Provider value={{user,ready,login,logout}}>{children}</AuthContext.Provider>}
export function useAuth(){return useContext(AuthContext)}
