/**
 * lib/sms.ts
 *
 * SMS 발송 헬퍼 (Twilio).
 * 환경변수에 TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER 가
 * 설정되어 있어야 동작한다. 설정되지 않으면 경고 로그만 남기고 건너뛴다.
 *
 * 사용 예:
 *   await sendSMS({
 *     to: '6041234567',
 *     body: '[HireVan] 지원자가 있습니다. http://...',
 *   })
 */

const log = (...args: unknown[]) => console.log('[sms]', ...args)

export async function sendSMS(input: {
  to: string
  body: string
}): Promise<{ ok: boolean }> {
  const { to, body } = input

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[sms] Twilio not configured — skipping SMS. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.')
    return { ok: false }
  }

  // @ts-expect-error - twilio is installed at runtime on the server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const twilioMod: any = await import('twilio')
  const client = twilioMod.default(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  )

  // 캐나다 번호에 +1 prefix 자동 추가
  const normalized = to.startsWith('+') ? to : `+1${to.replace(/[^0-9]/g, '')}`

  try {
    const result = await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
      body,
    })
    log('sent to', normalized, 'sid:', result.sid)
    return { ok: true }
  } catch (err) {
    console.error('[sms] send failed:', err)
    return { ok: false }
  }
}