import express from 'express'
import jwt from 'jsonwebtoken'
import { db, createOrder } from '../lib/db.js'
const r=express.Router(); const SECRET=process.env.JWT_SECRET||'devsecret'
function auth(req,res,next){ const h=req.headers.authorization||''; const t=h.startsWith('Bearer ')?h.slice(7):''; if(!t) return res.status(401).json({message:'Unauthorized'}); try{ req.user=jwt.verify(t,SECRET); next() }catch{ res.status(401).json({message:'Unauthorized'}) } }
r.post('/checkout', auth, async (req,res)=>{ const {items,address}=req.body||{}; if(!Array.isArray(items)||!items.length) return res.status(400).json({message:'Empty cart'}); await db.read(); const o=createOrder({userId:req.user.id,items,address}); await db.write(); res.json({ok:true,orderId:o.id}) })
r.get('/my', auth, async (req,res)=>{ await db.read(); const mine=(db.data.orders||[]).filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt-a.createdAt); res.json({orders:mine}) })
export default r
