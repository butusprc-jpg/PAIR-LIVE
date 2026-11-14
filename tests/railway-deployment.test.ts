import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import {readiness} from '../lib/server/readiness';

test('Railway web and existing round worker keep separate start paths',()=>{
 const web=JSON.parse(readFileSync('railway.web.json','utf8'));
 const worker=JSON.parse(readFileSync('railway.worker.json','utf8'));
 const docker=readFileSync('Dockerfile.railway-web','utf8');
 assert.equal(worker.deploy.startCommand,'npm run round:worker');
 assert.equal(existsSync('railway.json'),false);
 assert.equal(web.deploy.startCommand,'node server.js');
 assert.equal(worker.build.dockerfilePath,'Dockerfile.railway-worker');
 const workerDocker=readFileSync('Dockerfile.railway-worker','utf8');
 assert.match(workerDocker,/RUN --mount=type=secret,id=proxy_ca,required=false/);
 assert.match(workerDocker,/NODE_EXTRA_CA_CERTS=\/run\/secrets\/proxy_ca npm ci; else npm ci/);
 assert.match(workerDocker,/COPY --chown=node:node scripts \.\/scripts/);
 assert.doesNotMatch(workerDocker,/strict-ssl=false|NODE_TLS_REJECT_UNAUTHORIZED=0/);
 assert.match(workerDocker,/CMD \["npm", "run", "round:worker"\]/);
 assert.doesNotMatch(workerDocker,/--omit=dev|DATABASE_URL|CHANNEL_ACCESS_TOKEN/);
 assert.match(readFileSync('scripts/round-worker.ts','utf8'),/RAILWAY_STAGING_NO_LINE==='true'\)throw new Error\('round_worker_staging_gate_closed'\)/);
 assert.equal(web.build.dockerfilePath,'Dockerfile.railway-web');
 assert.equal(web.deploy.healthcheckPath,'/api/health/ready');
 assert.equal(web.deploy.numReplicas,1);
 assert.match(docker,/CMD \["node", "server\.js"\]/);
 assert.doesNotMatch(docker,/DATABASE_URL|CHANNEL_ACCESS_TOKEN|SECRET|npm run db:migrate/);
});

test('readiness fails closed and does not expose database errors',async()=>{
 assert.equal(await readiness({query:async()=>({rows:[{one:1}]})} as never),true);
 assert.equal(await readiness({query:async()=>{throw new Error('synthetic sensitive detail')}} as never),false);
});
test('one-shot staging migration cannot launch the round worker',()=>{
 const migration=readFileSync('Dockerfile.railway-migrate','utf8');
 assert.match(migration,/FROM node:22-bookworm-slim/);
 assert.match(migration,/CMD \["npm", "run", "db:migrate", "--", "--staging-apply"\]/);
 assert.doesNotMatch(migration,/round:worker/);
});
