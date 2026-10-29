import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto'

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY는 32바이트(base64) 값이어야 합니다.')
  return key
}

// AES-256-GCM. 저장 형식: "v1:" + base64(iv 12 | tag 16 | 암호문)
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

export function decrypt(token: string | null | undefined): string | null {
  if (!token) return null
  if (!token.startsWith('v1:')) throw new Error('알 수 없는 암호문 형식입니다.')
  const buf = Buffer.from(token.slice(3), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

// 암호문은 매번 달라지므로, 중복 가입 확인은 키를 섞은 해시로 합니다.
export function blindIndex(value: string): string {
  return createHmac('sha256', encryptionKey()).update('rrn-index:' + value).digest('base64url')
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(pin, salt)
  return `s1:${salt.toString('base64')}:${hash.toString('base64')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [ver, saltB64, hashB64] = stored.split(':')
  if (ver !== 's1' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(pin, Buffer.from(saltB64, 'base64'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
