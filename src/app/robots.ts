import type { MetadataRoute } from 'next'

/** 공고는 검색에 보이게, 로그인해야 보이는 화면(개인정보)은 로봇이 들어가지 않게 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/me', '/docs', '/print', '/photo', '/api', '/login', '/signup', '/setup'] }],
  }
}
