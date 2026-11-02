const fs = require('node:fs');
const vm = require('node:vm');
for (const file of fs.readdirSync('.').filter(name => name.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(file, 'utf8'), {filename:file});
}
const html = fs.readFileSync('index.html','utf8');
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
console.log('Application JavaScript syntax checks passed');
