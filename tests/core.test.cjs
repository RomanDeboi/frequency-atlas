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
const ui = vm.runInNewContext(renderSource+`\n({setTestRecords(records){data=records;selected=records[0]?.id??null},renderMap,renderDb,renderSelected,
    setBaseCategoryPriorities,setCategories,categoryPriority,planCategoryLanes})`,renderContext);
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

// Category-color palette: standard CSS-variable colors and personal colors share one picker.
const paletteBody = fs.readFileSync(path.join(__dirname, '../prototype-body.html'),'utf8');
const paletteCss = fs.readFileSync(path.join(__dirname, '../prototype-extra.css'),'utf8');
assert.match(paletteBody,/id="categoryPalette"/);
assert.match(paletteBody,/id="categoryColorUsage"/);
assert.match(paletteCss,/\.categoryPaletteOption\[aria-pressed="true"\]/);
const paletteUi = {
  '#categoryPalette': {innerHTML:''},
  '#categoryColor': {value:'#9c8df6'},
  '#categoryColorUsage': {textContent:''},
};
let paletteButtons = [], previousPaletteHtml = '';
const rootColors = {'--uav':'#ff6b6b','--wifi':'#59a8ff','--bluetooth':'#62e8ff',
  '--cellular':'#65d687','--gnss':'#ffd166','--vhf':'#b28dff','--uhf':'#ff9f5a','--other':'#93a0b2'};
const paletteContext = {
  console, setTimeout, clearTimeout, URLSearchParams, location:{search:''},
  getComputedStyle:()=>({getPropertyValue:key=>rootColors[key]||''}),
  document:{documentElement:{},querySelector:selector=>paletteUi[selector],
    querySelectorAll:selector=>{
      if (selector!=='#categoryPalette [data-palette-color]') return [];
      if (paletteUi['#categoryPalette'].innerHTML!==previousPaletteHtml) {
        previousPaletteHtml=paletteUi['#categoryPalette'].innerHTML;
        paletteButtons=[...previousPaletteHtml.matchAll(/data-palette-color="(#[0-9a-f]{6})"/g)]
          .map(([,paletteColor])=>({dataset:{paletteColor},attrs:{},setAttribute(key,value){this.attrs[key]=value;}}));
      }
      return paletteButtons;
    }},
};
const paletteApi=vm.runInNewContext(src.slice(0,src.indexOf('function select(id)'))+
  '\n({setCategories,categoryColorHex,renderCategoryPalette,updateCategoryPaletteSelection})',paletteContext);
assert.equal(paletteApi.categoryColorHex('uav'),'#ff6b6b');
const testCategory={id:'user-12345678-1234-1234-1234-1234567890ab',name:'Датчики IoT',color:'#aabbcc'};
paletteApi.setCategories([testCategory]);
paletteApi.renderCategoryPalette();
assert.equal(paletteButtons.length,9);
assert.match(paletteUi['#categoryPalette'].innerHTML,/БПЛА/);
assert.match(paletteUi['#categoryPalette'].innerHTML,/Датчики IoT/);
assert.match(paletteUi['#categoryPalette'].innerHTML,/role="unused"|aria-pressed="false"/);
const wifiPreset=paletteButtons.find(button=>button.dataset.paletteColor==='#59a8ff');
wifiPreset.onclick();
assert.equal(paletteUi['#categoryColor'].value,'#59a8ff');
assert.equal(wifiPreset.attrs['aria-pressed'],'true');
assert.match(paletteUi['#categoryColorUsage'].textContent,/Wi.Fi/);
paletteUi['#categoryColor'].value='#123456';
paletteApi.updateCategoryPaletteSelection();
assert.match(paletteUi['#categoryColorUsage'].textContent,/не використовується/);
assert.equal(wifiPreset.attrs['aria-pressed'],'false');
console.log('PASS: category palette shows labels and colors, CSS-variable resolution, preset selection and used-color hint');

// Category priority: migration of old categories, validation, and map lane/z-order.
const priorityApi = vm.runInNewContext(helpers+`
({validateCategories,validatePriority,validateBasePriorities,
  setBaseCategoryPriorities,categoryPriority,setCategories})`,{...ctx});
assert.equal(priorityApi.validateCategories([testCategory])[0].priority,0);
assert.equal(priorityApi.validateCategories([{...testCategory,priority:7}])[0].priority,7);
assert.throws(()=>priorityApi.validateCategories([{...testCategory,priority:11}]),/Пріоритет/);
assert.throws(()=>priorityApi.validatePriority(3.5),/Пріоритет/);
assert.throws(()=>priorityApi.validateBasePriorities({unknown:3}),/Невідома/);
assert.equal(priorityApi.validateBasePriorities({wifi:9}).wifi,9);
assert.equal(priorityApi.validateBasePriorities({wifi:0}).wifi,undefined);
priorityApi.setBaseCategoryPriorities({wifi:9});
assert.equal(priorityApi.categoryPriority('wifi'),9);
priorityApi.setCategories([{...testCategory,priority:5}]);
assert.equal(priorityApi.categoryPriority(testCategory.id),5);
assert.match(paletteBody,/id="categoryPriority"/);
assert.match(paletteBody,/id="standardCategoryPriorities"/);
ui.setBaseCategoryPriorities({wifi:10,other:0});
ui.setTestRecords([
  {...candidate,id:'low',cat:'other',a:2400,b:2500,affiliation:'friendly'},
  {...candidate,id:'high',cat:'wifi',a:2410,b:2490,affiliation:'hostile'},
]);
ui.renderMap();
assert.match(element('#bands').innerHTML,/data-id="high"[^>]*top:18px/);
assert.match(element('#bands').innerHTML,/data-id="low"[^>]*top:90px/);
assert.match(element('#bands').innerHTML,/data-id="high"[^>]*z-index:40/); // Highest level + selected-independent layer.
assert.match(element('#bands').innerHTML,/data-id="low"[^>]*z-index:21/); // Selected low band remains below high.
assert.match(element('#bands').innerHTML,/data-affiliation="hostile"/); // Red/green status preserved.
assert.match(paletteCss,/\.cursor\{z-index:100\}/); // Frequency cursor above all layers.
console.log('PASS: priority validation, built-in/custom defaults, and upper-lane/z-index ordering with affiliation intact');

// Touching frequency-band endpoints must share one lane, even when a higher
// priority band is processed first. Actual overlaps still use separate lanes.
const touching = [
  {...candidate,id:'touch-left',cat:'other',a:2400,b:2500},
  {...candidate,id:'touch-right',cat:'wifi',a:2500,b:2600},
];
const shared = ui.planCategoryLanes(touching,500);
assert.equal(shared.length,1,'exactly adjoining bands share a lane');
assert.deepEqual([...shared[0].map(d=>d.id)].sort(),['touch-left','touch-right']);
assert.equal(ui.planCategoryLanes([...touching].reverse(),500).length,1,'input order does not matter');
assert.equal(ui.planCategoryLanes([
  {...touching[0],id:'first',a:2300,b:2400},
  {...touching[0],id:'second',a:2400,b:2500},
  {...touching[1],id:'third',a:2500,b:2600},
],500).length,1,'a chain of touching bands shares one lane');
assert.equal(ui.planCategoryLanes([
  {...touching[0],a:0.1,b:0.1+0.2},
  {...touching[1],a:0.3,b:0.4},
],500).length,1,'floating-point rounding at a shared boundary is accepted');
assert.equal(ui.planCategoryLanes([
  touching[0], {...touching[1],a:2499.99},
],500).length,2,'genuinely overlapping bands stay in separate lanes');
assert.equal(ui.planCategoryLanes([
  touching[0], {...touching[1],a:2501},
],500).length,2,'the existing visual gap is retained for nearly separated bands');
assert.equal(ui.planCategoryLanes([
  touching[0], {...touching[1],a:2510},
],500).length,1,'clearly separated bands still share lanes');
ui.setTestRecords(touching);
ui.renderMap();
assert.match(element('#bands').innerHTML,/data-id="touch-left"[^>]*top:18px/);
assert.match(element('#bands').innerHTML,/data-id="touch-right"[^>]*top:18px/);
console.log('PASS: touching band edges share a row, overlap still separates rows, existing priority is preserved');
