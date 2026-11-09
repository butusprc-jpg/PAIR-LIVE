import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readiness} from '../lib/server/readiness';

test('Railway web and existing round worker keep separate start paths',()=>{
 const web=JSON.parse(readFileSync('railway.web.json','utf8'));
 const worker=JSON.parse(readFileSync('railway.json','utf8'));
 const docker=readFileSync('Dockerfile.railway-web','utf8');
 assert.equal(worker.deploy.startCommand,'npm run round:worker');
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
