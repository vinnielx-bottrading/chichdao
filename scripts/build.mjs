import {build} from 'esbuild';
await build({entryPoints:['src/api.js'],bundle:true,format:'esm',outfile:'dist/api.js',target:['es2022'],minify:true,legalComments:'eof'});
await build({entryPoints:['worker/index.js'],bundle:true,format:'esm',outfile:'build/worker.js',target:['es2022'],platform:'browser',minify:false});
