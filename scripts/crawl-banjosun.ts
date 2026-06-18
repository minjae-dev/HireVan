import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const { runPipeline } = await import('../lib/scrapers/banjosun')
const result = await runPipeline(2)

console.log(`완료: 삽입=${result.inserted}, 스킵=${result.skipped}, 오류=${result.errors}`)
