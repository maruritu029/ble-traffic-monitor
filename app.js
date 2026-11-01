const COMPANY_ID = 0x09BD;
const state = {device:null, packets:[], selected:null, latestSim:null, intersections:[], specs:[]};
const $ = id => document.getElementById(id);
const hex = bytes => Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join(' ').toUpperCase();
const stamp = () => new Date().toLocaleTimeString('ja-JP',{hour12:false});
const u16le = (b,i) => b.length>=i+2 ? b[i] | (b[i+1]<<8) : null;
const u32le = (b,i) => b.length>=i+4 ? (b[i] + b[i+1]*256 + b[i+2]*65536 + b[i+3]*16777216) : null;

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.tab));
}));

function decodePics(companyId, payload, source='BLE'){
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  // Spec CSV includes Company ID at offsets 0-1. Web Bluetooth manufacturerData values
  // normally omit those two bytes because the company ID is the Map key.
  let full = bytes;
  let offset = 0;
  if(companyId===COMPANY_ID && bytes.length===24){ offset=-2; }
  const get = pos => pos+offset>=0 && pos+offset<bytes.length ? bytes[pos+offset] : null;
  const version=get(2), signal=get(3), seconds=get(4);
  const cross = (pos) => {
    const i=pos+offset;
    return i>=0 && bytes.length>=i+2 ? u16le(bytes,i) : null;
  };
  const direction=get(7);
  const lat=u32le(bytes,8+offset), lon=u32le(bytes,12+offset);
  const knownSignal = ({1:'青',2:'青点滅',3:'赤'})[signal] || '未知 / 未定義';
  return {
    source, companyId, isCandidate:companyId===COMPANY_ID,
    length:bytes.length, bytes, offset,
    version, signal, signalLabel:knownSignal, seconds,
    intersectionId:cross(5), direction,
    latitudeRaw:lat, longitudeRaw:lon,
    hasCore:bytes.length >= 5,
    note: companyId!==COMPANY_ID ? 'Company IDが資料記載値と一致しません' :
      bytes.length<24 ? '資料上の全フィールドを確認するにはデータ長が不足しています' :
      '仕様表の位置に基づく暫定パース。未確定フィールドは解釈していません'
  };
}
function addPacket(p){
  state.packets.unshift(p);
  if(state.packets.length>500) state.packets.pop();
  $('packetCount').textContent=state.packets.length;
  $('lastRssi').textContent=p.rssi==null?'—':`${p.rssi} dBm`;
  $('picsCount').textContent=state.packets.filter(x=>x.decoded?.isCandidate).length;
  renderPackets();
}
function renderPackets(){
  const body=$('packetRows');
  if(!state.packets.length){body.innerHTML='<tr><td colspan="5" class="empty">まだ受信していません</td></tr>';return;}
  body.innerHTML=state.packets.map((p,i)=>`<tr data-i="${i}"><td>${p.time}</td><td>${escapeHtml(p.kind)}</td><td>${p.rssi??'—'}</td><td>${p.bytes.length} B</td><td>${p.decoded?.isCandidate?'PICS候補':'その他'}</td></tr>`).join('');
  body.querySelectorAll('tr[data-i]').forEach(tr=>tr.addEventListener('click',()=>showDetail(state.packets[Number(tr.dataset.i)])));
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showDetail(p){
  const d=p.decoded; $('detailTag').textContent=d?.isCandidate?'PICS候補':'広告データ';
  $('packetDetail').innerHTML=`<div class="detail-grid">
    <span>受信元</span><b>${escapeHtml(p.name||'名称なし')}</b>
    <span>受信時刻</span><b>${p.time}</b>
    <span>RSSI</span><b>${p.rssi??'—'} dBm</b>
    <span>Company ID</span><b>${p.companyId==null?'不明':'0x'+p.companyId.toString(16).toUpperCase().padStart(4,'0')}</b>
    <span>データ長</span><b>${p.bytes.length} bytes</b>
    <span>信号状態</span><b>${d?.signal==null?'未取得':`${d.signalLabel} (0x${d.signal.toString(16).padStart(2,'0').toUpperCase()})`}</b>
    <span>残り時間</span><b>${d?.seconds==null?'未取得':d.seconds+' 秒'}</b>
    <span>交差点ID</span><b>${d?.intersectionId??'未取得'}</b>
    <span>方向コード</span><b>${d?.direction==null?'未取得':'0x'+d.direction.toString(16).padStart(2,'0').toUpperCase()}</b>
    <span>緯度 raw</span><b>${d?.latitudeRaw??'未取得'}</b>
    <span>経度 raw</span><b>${d?.longitudeRaw??'未取得'}</b>
  </div><p class="muted tiny">${escapeHtml(d?.note||'PICS仕様への一致は未確認です')}</p><h4>HEX</h4><pre class="hex">${hex(p.bytes)}</pre>`;
}
async function startScan(){
  if(!('bluetooth' in navigator)){alert('このブラウザーはWeb Bluetoothに対応していません。対応するデスクトップ版Chrome / Edgeなどをお試しください。');return;}
  try{
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[]});
    state.device=device; $('deviceName').textContent=device.name||'名称なし'; $('scanBtn').disabled=true; $('stopBtn').disabled=false;
    device.addEventListener('advertisementreceived',ev=>{
      const records=[];
      if(ev.manufacturerData){
        for(const [companyId,view] of ev.manufacturerData.entries()){
          const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
          records.push({companyId,bytes,kind:'Manufacturer',decoded:decodePics(companyId,bytes)});
        }
      }
      if(ev.serviceData){
        for(const [uuid,view] of ev.serviceData.entries()){
          const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
          records.push({companyId:null,bytes,kind:`Service ${uuid}`,decoded:null});
        }
      }
      if(!records.length) records.push({companyId:null,bytes:new Uint8Array(),kind:'広告（解析対象なし）',decoded:null});
      records.forEach(r=>addPacket({time:stamp(),name:device.name||'',rssi:ev.rssi, ...r}));
    });
    if(typeof device.watchAdvertisements!=='function') throw new Error('watchAdvertisements()がこのブラウザーで利用できません。');
    await device.watchAdvertisements();
  }catch(err){$('scanBtn').disabled=false;$('stopBtn').disabled=true;alert(`受信を開始できませんでした: ${err.message}`);}
}
function stopScan(){
  try{state.device?.unwatchAdvertisements?.();}catch(e){}
  state.device=null;$('deviceName').textContent='停止';$('scanBtn').disabled=false;$('stopBtn').disabled=true;
}
$('scanBtn').addEventListener('click',startScan); $('stopBtn').addEventListener('click',stopScan);
$('clearLog').addEventListener('click',()=>{state.packets=[];$('packetCount').textContent='0';$('picsCount').textContent='0';$('lastRssi').textContent='—';renderPackets();$('packetDetail').textContent='受信ログの行を選択すると詳細を表示します。';});
$('exportCsv').addEventListener('click',()=>{
 const rows=[['time','name','kind','company_id','rssi','length','hex','pics_candidate','signal_raw','seconds','intersection_id','direction','latitude_raw','longitude_raw']];
 state.packets.slice().reverse().forEach(p=>{const d=p.decoded||{};rows.push([p.time,p.name,p.kind,p.companyId,p.rssi,p.bytes.length,hex(p.bytes),!!d.isCandidate,d.signal,d.seconds,d.intersectionId,d.direction,d.latitudeRaw,d.longitudeRaw]);});
 download('ble-packets.csv',rows.map(r=>r.map(csvCell).join(',')).join('\r\n'));
});
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}

function makeSim(){
 const signal=Number($('simState').value), seconds=Math.max(0,Math.min(255,Number($('simSeconds').value)||0)), cross=Math.max(0,Math.min(65535,Number($('simCross').value)||0));
 // 26-byte synthetic frame; reserved/system bytes remain zero placeholders.
 const b=new Uint8Array(26); b[0]=0xBD;b[1]=0x09;b[2]=0x01;b[3]=signal;b[4]=seconds;b[5]=cross&255;b[6]=(cross>>8)&255;b[7]=0;
 // Coordinates are intentionally zero placeholders: encoding/scaling is not established by the supplied sheet.
 const d=decodePics(COMPANY_ID,b,'SIM');
 state.latestSim={bytes:b,decoded:d,companyId:COMPANY_ID};
 $('simHex').textContent=hex(b);
 $('simDecoded').innerHTML=decodeCards(d,true);
 $('simToLog').disabled=false;
}
function decodeCards(d,sim=false){
 return `<div class="decode-item"><span>信号状態${sim?'（架空）':''}</span><b>${d.signalLabel}</b></div>
 <div class="decode-item"><span>残り時間${sim?'（架空）':''}</span><b>${d.seconds} 秒</b></div>
 <div class="decode-item"><span>交差点ID</span><b>${d.intersectionId}</b></div>
 <div class="decode-item"><span>方向コード</span><b>${d.direction??'未取得'}</b></div>
 <div class="decode-item"><span>緯度 raw</span><b>${d.latitudeRaw??'未取得'}</b></div>
 <div class="decode-item"><span>経度 raw</span><b>${d.longitudeRaw??'未取得'}</b></div>`;
}
$('makeSim').addEventListener('click',makeSim);
$('simToLog').addEventListener('click',()=>{if(!state.latestSim)return;const s=state.latestSim;addPacket({time:stamp(),name:'SIMULATOR（架空）',rssi:null,kind:'SIM',companyId:s.companyId,bytes:s.bytes,decoded:s.decoded});});
async function loadCsv(path){
 const res=await fetch(path); if(!res.ok) throw new Error(`読み込み失敗: ${path}`); const text=await res.text(); return parseCsv(text);
}
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}else cell+=c;}
 row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows;
}
function renderIntersections(list){
 const body=$('crossRows');$('crossCount').textContent=`${list.length}件表示`;
 body.innerHTML=list.slice(0,150).map(r=>`<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td><td>${escapeHtml(r[4])}</td><td>${escapeHtml(r[5])}</td><td>${escapeHtml(r[6])}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">該当する交差点がありません</td></tr>';
}
$('crossSearch').addEventListener('input',()=>{
 const q=$('crossSearch').value.trim().toLowerCase();
 renderIntersections(state.intersections.filter(r=>r.slice(0,7).join(' ').toLowerCase().includes(q)));
});
(async()=>{
 try{
  const rows=await loadCsv('data/250501-zenkoku-kousaten.csv');state.intersections=rows.slice(1).filter(r=>r.length>=7);renderIntersections(state.intersections);
 }catch(e){$('crossRows').innerHTML=`<tr><td colspan="6" class="empty">${escapeHtml(e.message)}（ローカルファイル直開きではなくGitHub Pagesで開いてください）</td></tr>`;}
 try{
  const rows=await loadCsv('data/picsinformation.csv');state.specs=rows.slice(1);
  $('specRows').innerHTML=state.specs.map(r=>`<tr>${r.slice(0,5).map(c=>`<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
 }catch(e){$('specRows').innerHTML=`<tr><td colspan="5" class="empty">${escapeHtml(e.message)}</td></tr>`;}
})();
