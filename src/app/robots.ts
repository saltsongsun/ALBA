import type { MetadataRoute } from 'next'

/** 공고는 검색에 보이게, 로그인해야 보이는 화면(개인정보)은 로봇이 들어가지 않게 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI 학습·검색용 수집 로봇은 전부 금지 (실제로도 src/proxy.ts에서 막음)
      {
        userAgent: [
          'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'CCBot', 'Google-Extended',
          'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'cohere-ai', 'Diffbot', 'meta-externalagent',
          'ImagesiftBot', 'Omgilibot', 'YouBot', 'Timpibot', 'AI2Bot', 'DuckAssistBot', 'MistralAI-User', 'PetalBot', 'GoogleOther',
        ],
        disallow: '/',
      },
      { userAgent: '*', allow: '/', disallow: ['/admin', '/me', '/docs', '/print', '/photo', '/api', '/login', '/signup', '/setup'] },
    ],
  }
}
