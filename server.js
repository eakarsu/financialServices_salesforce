const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');
const { loadConfig } = require('./config');

function createApp(){
  const config=loadConfig(); const app=express(); const counters=new Map();
  app.disable('x-powered-by'); app.set('trust proxy',false); app.use(helmet());
  app.use(cors({origin(origin,done){if(!origin||config.allowedOrigins.includes(origin))return done(null,true);return done(new Error('Origin is not allowed'));},credentials:false,methods:['GET','POST','PUT','DELETE']}));
  app.use(express.json({limit:'256kb',verify(req,_res,buffer){req.rawBody=buffer.toString('utf8');}}));
  app.use('/api',(req,res,next)=>{const bucket=`${req.ip}:${Math.floor(Date.now()/60000)}`;const count=(counters.get(bucket)||0)+1;counters.set(bucket,count);if(counters.size>5000)counters.clear();if(count>300)return res.status(429).json({error:'API rate limit exceeded'});next();});
  app.use('/api/auth',require('./routes/auth'));
  app.use('/api/sales',require('./routes/salesOperations'));
  app.use('/api/webhooks/outreach',require('./routes/providerWebhook'));
  app.all(['/api/ai/*','/api/salesforce-fsc/*','/api/goal-planning/*','/api/tax-rebalancer/*','/api/compliance-copilot/*','/api/meeting-prep/*','/api/beneficiary-review/*'],(_req,res)=>res.status(410).json({error:'Ungoverned prototype endpoint retired; use /api/sales'}));
  app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1 FROM sales_schema_migrations LIMIT 1');res.json({status:'ok',service:'governed-sales-operations'});}catch(_error){res.status(503).json({status:'unavailable',error:'Database schema is not ready'});}});
  app.use((_req,res)=>res.status(404).json({error:'Not found'}));
  app.use((error,_req,res,_next)=>{const status=error.statusCode||(/Origin is not allowed/.test(error.message)?403:500);if(status>=500)console.error('Request failed',error.message);res.status(status).json({error:status>=500?'Internal server error':error.message,code:error.code});});
  return app;
}

if(require.main===module){const rawPort=process.env.BACKEND_PORT||process.env.PORT;if(!/^\d+$/.test(rawPort||''))throw new Error('BACKEND_PORT or PORT must be an assigned numeric port');const port=Number(rawPort);const server=createApp().listen(port,'127.0.0.1',()=>console.log(`Governed sales API listening on ${port}`));const stop=()=>server.close(()=>pool.end().finally(()=>process.exit(0)));process.on('SIGTERM',stop);process.on('SIGINT',stop);}
module.exports={createApp};
