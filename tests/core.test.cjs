const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../prototype-src.js'), 'utf8');
// Load only the pure helpers and model/schema validation, without a browser DOM.
const helpers = src.slice(0,src.indexOf('function renderFilters()'));
const validate = src.slice(src.indexOf('function validateImport('),src.indexOf('async function exportBackup()'));
const ctx = { console, setTimeout, clearTimeout, URLSearchParams, location: {search: ''} };
const api = vm.runInNewContext(helpers+'\n'+validate+'\n({parseFreq,matches,validateImport,escapeHtml,demoData,labels,affiliationOf})',ctx);
assert.equal(api.parseFreq('2.4G'),2400);
assert.equal(api.parseFreq('2400000khz'),2400);
assert.equal(api.parseFreq('1575,42'),1575.42);
assert.equal(api.parseFreq('nonsense'),null);
assert.equal(api.matches(api.demoData.find(d=>d.id==='wifi'),'2450'),true);
assert.equal(api.matches(api.demoData.find(d=>d.id==='wifi'),'OFDM 2.4 GHz'),true);
assert.equal(api.matches(api.demoData.find(d=>d.id==='bt'),'OFDM'),false);
assert.equal(api.escapeHtml('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');
const candidate={id:'a',entityId:'obj',entity:'Test',band:'Band 1',cat:'other',a:100,b:200,tags:['test'],images:[]};
assert.equal(api.validateImport(candidate).band,'Band 1');
assert.equal(api.validateImport(candidate).affiliation,'neutral');
assert.equal(api.validateImport({...candidate,affiliation:'friendly'}).affiliation,'friendly');
assert.equal(api.validateImport({...candidate,affiliation:'hostile'}).affiliation,'hostile');
assert.equal(api.affiliationOf({affiliation:'hostile'}),'hostile');
assert.equal(api.affiliationOf({}),'neutral');
assert.throws(()=>api.validateImport({...candidate,affiliation:'unrecognized'}),/позначка/);
assert.equal(api.matches({...candidate,affiliation:'friendly'},'Дружній'),true);
assert.equal(api.matches({...candidate,affiliation:'hostile'},'Ворожий'),true);
assert.throws(()=>api.validateImport({...candidate,a:300}),/діапазон/);
assert.throws(()=>api.validateImport({...candidate,cat:'unknown'}),/категорія/);
assert.throws(()=>api.validateImport({...candidate,images:[{dataUrl:'data:text/html;base64,WA=='}]}),/зображення/);
assert.deepEqual(Object.keys(api.labels).sort(),['bluetooth','cellular','gnss','other','uav','uhf','vhf','wifi'].sort());
console.log('PASS: parse frequency, keyword/frequency search, import validation, safe HTML escaping and record affiliation');

// Render the spectrum and record card with a minimal DOM to check affiliation markup.
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {innerHTML:'',textContent:'',value:'',style:{}});
  return elements.get(selector);
}
const renderContext = {
  console, setTimeout, clearTimeout, URLSearchParams,
  location: {search:''},
  document: {querySelector: element, querySelectorAll: () => []},
};
const renderSource = src.slice(0,src.indexOf("$('#jumpBtn').onclick"));
const ui = vm.runInNewContext(renderSource+'\n({setTestRecords(records){data=records;selected=records[0]?.id??null},renderMap,renderDb,renderSelected})',renderContext);
ui.setTestRecords([
  {...candidate,id:'f',a:2400,b:2410,affiliation:'friendly'},
  {...candidate,id:'h',a:2420,b:2430,affiliation:'hostile'},
  {...candidate,id:'n',a:2440,b:2450},
]);
ui.renderMap();
assert.match(element('#bands').innerHTML,/data-affiliation="friendly"/);
assert.match(element('#bands').innerHTML,/data-affiliation="hostile"/);
assert.match(element('#bands').innerHTML,/data-affiliation="neutral"/);
ui.renderSelected();
assert.match(element('#selected').innerHTML,/Позначка: Дружній/);
ui.renderDb();
assert.match(element('#detail').innerHTML,/id="quickAffiliation"/);
assert.match(element('#detail').innerHTML,/<option value="friendly" selected>/);
assert.match(element('#list').innerHTML,/Позначка: Ворожий/);
const body = fs.readFileSync(path.join(__dirname, '../prototype-body.html'),'utf8');
const css = fs.readFileSync(path.join(__dirname, '../prototype-extra.css'),'utf8');
assert.match(body,/id="entityAffiliation"/);
assert.match(css,/\.band\[data-affiliation="friendly"\]\{border:3px solid #2bdb70\}/);
assert.match(css,/\.band\[data-affiliation="hostile"\]\{border:3px solid #fa5965\}/);
console.log('PASS: affiliation UI markup, colors, default status, record card and search list');
