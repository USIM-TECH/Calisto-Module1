import type { PropsWithChildren } from 'react'

export default function PageContainer({ children }: PropsWithChildren) {
  return <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
}

