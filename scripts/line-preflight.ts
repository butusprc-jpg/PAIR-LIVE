import {linePreflight} from '../lib/line-preflight';
for(const [key,status] of Object.entries(linePreflight(process.env)))console.log(`${key}: ${status}`);
