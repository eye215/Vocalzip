const fs = require('node:fs');
const vm = require('node:vm');
const files = [...fs.readdirSync('.').filter(name => name.endsWith('.js')), ...fs.readdirSync('app').filter(name => name.endsWith('.js')).map(name => 'app/' + name), ...fs.readdirSync('practice-room').filter(name => name.endsWith('.js')).map(name => 'practice-room/' + name)];
for (const file of files) new vm.Script(fs.readFileSync(file, 'utf8'), {filename:file});
for (const page of ['index.html', 'legacy.html']) {
  const html = fs.readFileSync(page, 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], {filename:page});
}
console.log('Application JavaScript syntax checks passed');
