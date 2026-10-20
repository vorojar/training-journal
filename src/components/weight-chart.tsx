'use client';
import { weeklyWeights, type SavedRecord } from '../lib/model';
export default function WeightChart({records,onAdd}:{records:SavedRecord[];onAdd:()=>void}){
 const weeks=weeklyWeights(records);const raw=records.filter(r=>r.kind==='weight').sort((a,b)=>a.payload.date.localeCompare(b.payload.date));
 if(!raw.length)return <div className="chart-empty"><div className="gridlines" aria-hidden="true"/><div><h3>添加第一条体重记录</h3><p>记录体重后，这里将显示你的体重变化趋势。</p><button className="button" onClick={onAdd}>记录体重</button></div></div>;
 const values=raw.map(r=>Number(r.payload.weight)),lo=Math.min(...values)-.5,hi=Math.max(...values)+.5,width=640,height=200;
 const start=Date.parse(raw[0]!.payload.date+'T00:00:00Z'),end=Date.parse(raw[raw.length-1]!.payload.date+'T00:00:00Z');
 const x=(i:number)=>48+(Date.parse(raw[i]!.payload.date+'T00:00:00Z')-start)*(width-76)/Math.max(end-start,86400000),y=(v:number)=>height-34-(v-lo)/(hi-lo)*(height-58);
 const points=raw.map((r,i)=>`${x(i)},${y(r.payload.weight)}`).join(' ');
 return <><div className="weight-summary"><strong>{raw[raw.length-1]?.payload.weight}<small>kg</small></strong><span>最近一次 · {raw[raw.length-1]?.payload.date}</span></div><svg className="weight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`体重趋势，共${raw.length}条记录，最近${raw[raw.length-1]?.payload.weight}kg`}>
 {[lo,(lo+hi)/2,hi].map(v=><g key={v}><line x1="46" x2="620" y1={y(v)} y2={y(v)} stroke="#e3e8eb" strokeDasharray="3 4"/><text x="3" y={y(v)+4} fill="#7b8790" fontSize="13">{v.toFixed(1)}</text></g>)}<polyline points={points} fill="none" stroke="#28574b" strokeWidth="2.5"/>{raw.map((r,i)=><circle key={r.id} cx={x(i)} cy={y(r.payload.weight)} r="4" fill="#28574b"><title>{r.payload.date}：{r.payload.weight}kg</title></circle>)}<text x="48" y="197" fontSize="12" fill="#7b8790">{raw[0]?.payload.date}</text><text x="620" y="197" fontSize="12" textAnchor="end" fill="#7b8790">{raw[raw.length-1]?.payload.date}</text></svg>
 <div className="weekly-weights">{weeks.slice(-4).map(w=><div key={w.date}><span>{w.date.slice(5)} 起一周</span><strong>{w.weight.toFixed(1)} kg</strong><small>{w.count}次记录的平均</small></div>)}</div><button className="text-button" onClick={onAdd}>添加体重记录</button></>;
}
