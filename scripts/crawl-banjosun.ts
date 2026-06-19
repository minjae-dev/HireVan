import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config()

async function main() {
  const { runPipeline } = await import('../lib/scrapers/banjosun')

  console.log('🚀 크롤링 시작...')
  try {
    const result = await runPipeline(2)
    console.log(`완료: 삽입=${result.inserted}, 스킵=${result.skipped}, 오류=${result.errors}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.error(`❌ 크롤링 실패: ${message}`)
    process.exit(1)
  }
}

main()
