const pool=require('./db');
const {processNextOutbox}=require('./services/sales');
let stopping=false;
async function main(){while(!stopping){const result=await processNextOutbox(`worker-${process.pid}`).catch((error)=>{console.error('Worker cycle failed',error.message);return null;});if(!result)await new Promise((resolve)=>setTimeout(resolve,1000));}}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
if(require.main===module)main().finally(()=>pool.end());
module.exports={main};
