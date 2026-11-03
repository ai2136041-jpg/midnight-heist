const fs = require('fs')
const p = process.env.USERPROFILE + '\\Desktop\\المشروع الافتراضي\\midnight-heist\\src\\i18n\\ar.json'
let raw = fs.readFileSync(p, 'utf8')
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
const obj = JSON.parse(raw)
function isArabic(s) { return /[\u0600-\u06FF]/.test(s) }
function fix(v) {
  if (typeof v === 'string') {
    if (isArabic(v)) return v
    try { return Buffer.from(v, 'latin1').toString('utf8') } catch (e) { return v }
  }
  if (Array.isArray(v)) return v.map(fix)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[fix(k)] = fix(v[k])
    return out
  }
  return v
}
const fixed = fix(obj)
fixed.mountHint = 'انقر على فتحة متوهجة لتركيب عظمها على الهيكل.'
const utf8NoBom = Buffer.from(JSON.stringify(fixed, null, 2) + '\n', 'utf8')
fs.writeFileSync(p, utf8NoBom)
console.log('title:', fixed.title)
console.log('mountHint:', fixed.mountHint)
console.log('valid:', (function(){try{JSON.parse(fs.readFileSync(p,'utf8'));return true}catch(e){return e.message}})())