const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const pool=require('../db');

async function main(){
  const slug=process.env.BOOTSTRAP_TENANT_SLUG||process.env.TENANT_ID;const name=process.env.BOOTSTRAP_TENANT_NAME;const email=process.env.BOOTSTRAP_MANAGER_EMAIL||process.env.BOOTSTRAP_ADMIN_EMAIL||process.env.ADMIN_EMAIL;const password=process.env.BOOTSTRAP_MANAGER_PASSWORD||process.env.BOOTSTRAP_ADMIN_PASSWORD||process.env.ADMIN_PASSWORD;
  if(!slug||!/^[a-z0-9-]{2,80}$/.test(slug)||!name||!email||!password||password.length<16)throw new Error('Set valid BOOTSTRAP_TENANT_SLUG, BOOTSTRAP_TENANT_NAME, BOOTSTRAP_MANAGER_EMAIL, and a 16+ character BOOTSTRAP_MANAGER_PASSWORD');
  const client=await pool.connect();try{await client.query('BEGIN');const tenantId=crypto.randomUUID();const tenant=(await client.query(`INSERT INTO sales_tenants(id,slug,name) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[tenantId,slug,name])).rows[0];const hash=await bcrypt.hash(password,12);await client.query(`INSERT INTO sales_identities(id,tenant_id,email,password_hash,display_name,role) VALUES($1,$2,lower($3),$4,$5,'manager') ON CONFLICT(tenant_id,email) DO UPDATE SET password_hash=EXCLUDED.password_hash,display_name=EXCLUDED.display_name,role='manager',active=true,token_version=sales_identities.token_version+1`,[crypto.randomUUID(),tenant.id,email,hash,name+' Manager']);await client.query('COMMIT');console.log('Tenant manager provisioned');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
if(require.main===module)main().then(()=>pool.end()).catch(async(error)=>{console.error(error.message);await pool.end();process.exitCode=1;});
