'use client'

import { useState } from 'react'
import { openResume } from '@/lib/resume'

/** 비공개 resumes 버킷의 이력서를 서명 URL 로 여는 링크 버튼 */
export default function ResumeLink({
  fileRef,
  className,
  children,
}: {
  fileRef: string
  className?: string
  children: React.ReactNode
}) {
  const [opening, setOpening] = useState(false)

  const handleClick = async () => {
    if (opening) return
    setOpening(true)
    try {
      await openResume(fileRef)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setOpening(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={opening} className={className}>
      {children}
    </button>
  )
}
