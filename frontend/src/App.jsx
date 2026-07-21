import React from 'react';
import { Routes,Route,Navigate,useNavigate } from 'react-router-dom';
import {useAuth} from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import SalesOperations from './pages/SalesOperations.jsx';

function Shell(){const{user,logout}=useAuth();const navigate=useNavigate();return <div className="app"><nav className="sidebar"><h1>Governed Sales Operations</h1><div className="side-note">CRM lifecycle, consent, review, delivery, and conversion evidence</div><div className="user-box"><div>Signed in as</div><strong>{user?.name||user?.email}</strong><div>{user?.role}</div><button onClick={()=>{logout();navigate('/login');}}>Sign out</button></div></nav><main className="main"><SalesOperations/></main></div>}
export default function App(){const{user,ready}=useAuth();if(!ready)return <div className="loading-page">Checking session…</div>;return <Routes><Route path="/login" element={user?<Navigate to="/" replace/>:<Login/>}/><Route path="/" element={user?<Shell/>:<Navigate to="/login" replace/>}/><Route path="*" element={<Navigate to={user?'/':'/login'} replace/>}/></Routes>}
