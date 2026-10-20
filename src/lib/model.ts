import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'日期无效');
const note=z.string().max(5000);
const optionalNumber=(min:number,max:number)=>z.number().finite().min(min).max(max).nullable();
export const kinds=['profile','assessment','plan','training','weight','review','adjustment'] as const;
export type Kind=typeof kinds[number];
export const schemas={
  profile:z.object({birthYear:z.number().int().min(1900).max(2026).nullable(),goal:note,height:optionalNumber(50,250),baselineWeight:optionalNumber(15,350),gainKg:z.number().min(0).max(50),startDate:date.or(z.literal('')),coach:z.string().max(100)}).strict(),
  assessment:z.object({topic:z.string().min(1).max(150),detail:note,status:z.enum(['待核实','已核实','需进一步评估']),owner:z.string().max(100),date:date.or(z.literal(''))}).strict(),
  plan:z.object({exerciseId:z.string().max(80),adopted:z.boolean(),sets:optionalNumber(1,30),quantity:optionalNumber(.1,300),load:z.string().max(150),rest:optionalNumber(0,1800),coach:z.string().max(100),notes:note}).strict(),
  training:z.object({date,session:z.enum(['A','B','C','轻活动','其他']),exercise:z.string().min(1).max(150),sets:optionalNumber(1,30),quantity:optionalNumber(.1,300),load:z.string().max(150),effort:optionalNumber(0,10),during:note,nextDay:note,notes:note}).strict(),
  weight:z.object({date,weight:z.number().finite().min(15).max(350),waist:optionalNumber(20,250),sleep:optionalNumber(0,24),appetite:note,food:note,notes:note}).strict(),
  review:z.object({date,stage:z.enum(['初始评估','每周回顾','第2周复查','第4周复查']),neck:optionalNumber(0,10),headControl:optionalNumber(0,300),balanceLeft:optionalNumber(0,600),balanceRight:optionalNumber(0,600),core:optionalNumber(0,300),lowerStrength:optionalNumber(0,300),upperStrength:optionalNumber(0,300),activityMinutes:optionalNumber(0,300),breath:optionalNumber(0,10),joint:optionalNumber(0,10),method:note,summary:note,nextDate:date.or(z.literal('')),coach:z.string().max(100)}).strict(),
  adjustment:z.object({date,topic:z.string().min(1).max(150),reason:note,before:note,after:note,coach:z.string().max(100),nextDate:date.or(z.literal(''))}).strict(),
};
export const mutation=z.object({kind:z.enum(kinds),version:z.number().int().nonnegative(),payload:z.unknown(),deleted:z.boolean().default(false)}).strict();
export interface SavedRecord {id:string;kind:Kind;payload:any;version:number;deleted:number;updatedAt:string}
export const initialProfile={birthYear:null,goal:'增肌增重 · 改善体态 · 提升力量',height:null,baselineWeight:null,gainKg:5,startDate:'',coach:''};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function addDays(d:string,n:number){const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
export function dayNumber(start:string,current=today()){return start?Math.floor((Date.parse(current+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000):null;}
export function weeklyWeights(records:SavedRecord[]){const weeks=new Map<string,{sum:number;count:number}>();for(const r of records.filter(r=>r.kind==='weight')){const d=new Date(r.payload.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=d.toISOString().slice(0,10);const a=weeks.get(key)||{sum:0,count:0};weeks.set(key,{sum:a.sum+r.payload.weight,count:a.count+1});}return [...weeks].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,weight:v.sum/v.count,count:v.count}));}
