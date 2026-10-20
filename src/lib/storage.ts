import { kinds, schemas, type SavedRecord, type Kind } from './model';
let connection:Promise<IDBDatabase>|undefined;
export function database(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('steady-training-journal',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('records'))r.result.createObjectStore('records',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{connection=undefined;reject(new Error('无法打开本机记录存储。请检查浏览器是否允许保存网站数据。'));};r.onblocked=()=>reject(new Error('请关闭此网站的其他旧窗口后重试。'));});}
export async function readRecords():Promise<SavedRecord[]>{const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('records','readonly').objectStore('records').getAll();r.onsuccess=()=>resolve((r.result as SavedRecord[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));r.onerror=()=>reject(new Error('读取记录失败，请重试。'));});}
export async function saveRecord(kind:Kind,id:string,payload:unknown,version:number,deleted=false):Promise<SavedRecord>{
 const checked=schemas[kind].safeParse(payload);if(!checked.success)throw new Error('请检查日期、必填内容与数值范围。');
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let result:SavedRecord;let error='保存失败。请检查浏览器可用空间，填写内容仍保留。';
 const get=store.get(id);get.onsuccess=()=>{const current=get.result as SavedRecord|undefined;
  if(current&&(current.kind!==kind||current.version!==version)){
   if(current.kind===kind&&current.version===version+1&&current.deleted===(deleted?1:0)&&JSON.stringify(current.payload)===JSON.stringify(checked.data)){result=current;return;}
   error='这条记录已在其他窗口修改。请先保留本次填写，关闭后重新打开最新记录，再核对保存。';tx.abort();return;
  }
  if(!current&&version!==0){error='原记录已不存在，请刷新列表后重试。';tx.abort();return;}
  result={id,kind,payload:checked.data,version:version+1,deleted:deleted?1:0,updatedAt:new Date().toISOString()};store.put(result);
 };
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(new Error(error));tx.onerror=()=>reject(new Error(error));});
}
export function parseBackup(text:string):SavedRecord[]{
 if(text.length>5_000_000)throw new Error('备份文件超过5MB，请分批导入。');
 let d:unknown;try{d=JSON.parse(text);}catch{throw new Error('这不是有效的JSON备份文件。');}
 if(typeof d!=='object'||d===null||!('records'in d)||!Array.isArray(d.records)||d.records.length>5000)throw new Error('备份格式不正确或记录超过5000条。');
 const ids=new Set<string>();return d.records.map((r:unknown)=>{if(typeof r!=='object'||!r)throw new Error('备份中有无效记录。');const a=r as SavedRecord;if(typeof a.id!=='string'||!(/^[a-zA-Z0-9_-]{1,100}$/).test(a.id)||ids.has(a.id)||!kinds.includes(a.kind)||!Number.isSafeInteger(a.version)||a.version<1||![0,1].includes(a.deleted)||typeof a.updatedAt!=='string'||!Number.isFinite(Date.parse(a.updatedAt)))throw new Error('备份中有无效或重复的记录编号。');const p=schemas[a.kind].safeParse(a.payload);if(!p.success)throw new Error('备份中有日期或字段格式不正确的记录。');ids.add(a.id);return {...a,payload:p.data};});
}
export async function importRecords(items:SavedRecord[]):Promise<number>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let added=0;for(const r of items){const get=store.get(r.id);get.onsuccess=()=>{if(!get.result){store.add(r);added++;}};}tx.oncomplete=()=>resolve(added);tx.onabort=()=>reject(new Error('导入未完成，原记录保持不变。请检查存储空间后重试。'));tx.onerror=()=>reject(new Error('导入失败，原记录保持不变。'));});}
