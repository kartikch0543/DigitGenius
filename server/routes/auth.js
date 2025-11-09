import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { db } from '../lib/db.js'
const r=express.Router(); const SECRET=process.env.JWT_SECRET||'devsecret'

r.post('/signup', async (req,res)=>{ const {name,email,password}=req.body||{}; if(!name||!email||!password) return res.status(400).json({message:'Missing fields'}); await db.read(); if(db.data.users.find(u=>u.email===email)) return res.status(400).json({message:'Email exists'}); const hash=await bcrypt.hash(password,10); const u={id:Date.now().toString(),name,email,password:hash,provider:'local'}; db.data.users.push(u); await db.write(); const token=jwt.sign({id:u.id,name:u.name,email:u.email},SECRET,{expiresIn:'7d'}); res.json({token}) })
r.post('/login', async (req,res)=>{ const {email,password}=req.body||{}; await db.read(); const u=db.data.users.find(x=>x.email===email); if(!u) return res.status(400).json({message:'Invalid email or password'}); const ok=await bcrypt.compare(password,u.password); if(!ok) return res.status(400).json({message:'Invalid email or password'}); const token=jwt.sign({id:u.id,name:u.name,email:u.email},SECRET,{expiresIn:'7d'}); res.json({token}) })

const GID=process.env.GOOGLE_CLIENT_ID, GSECRET=process.env.GOOGLE_CLIENT_SECRET, CB=process.env.GOOGLE_CALLBACK_URL||'http://localhost:8080/api/auth/google/callback'
if(GID&&GSECRET){ passport.use(new GoogleStrategy({clientID:GID,clientSecret:GSECRET,callbackURL:CB}, async (a,b,profile,done)=>{ try{ await db.read(); const email=profile.emails?.[0]?.value; let u=db.data.users.find(x=>x.email===email); if(!u){ u={id:Date.now().toString(),name:profile.displayName,email,provider:'google'}; db.data.users.push(u); await db.write() } return done(null,u) }catch(e){ done(e) } })) 
  r.get('/google', passport.authenticate('google',{scope:['profile','email']}))
  r.get('/google/callback', passport.authenticate('google',{session:false,failureRedirect:'/auth-failed'}),(req,res)=>{ const token=jwt.sign({id:req.user.id,name:req.user.name,email:req.user.email},SECRET,{expiresIn:'7d'}); const to=(process.env.APP_ORIGIN||'http://localhost:5176')+'/auth/callback?token='+encodeURIComponent(token); res.redirect(to) })
}else{ r.get('/google',(req,res)=>res.status(503).send('Google OAuth not configured')) }
export default r
