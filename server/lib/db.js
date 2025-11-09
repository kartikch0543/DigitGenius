import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { nanoid } from 'nanoid'
const __filename=fileURLToPath(import.meta.url); const __dirname=path.dirname(__filename)
const DB=path.join(__dirname,'..','db.json')
async function exists(p){ try{ await fs.access(p); return true }catch{ return false } }
export const db={ data:{users:[],orders:[]},
  async read(){ if(!(await exists(DB))){ await fs.writeFile(DB, JSON.stringify(this.data,null,2)) } const t=await fs.readFile(DB,'utf8'); this.data=t?JSON.parse(t):this.data },
  async write(){ await fs.writeFile(DB, JSON.stringify(this.data,null,2)) } }
await db.read()
export function createOrder({userId,items,address}){ const o={id:nanoid(),userId,items,address,status:'Placed',createdAt:Date.now(),statusHistory:[{status:'Placed',at:Date.now()}]}; db.data.orders.push(o); return o }
