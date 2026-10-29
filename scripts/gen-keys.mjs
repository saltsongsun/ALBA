// .env.local / Vercel 환경변수에 넣을 비밀 값을 만듭니다.
import { randomBytes } from 'node:crypto'

console.log(`SESSION_SECRET=${randomBytes(32).toString('base64url')}`)
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`)
console.log(`ADMIN_SETUP_CODE=${randomBytes(4).toString('hex')}`)
