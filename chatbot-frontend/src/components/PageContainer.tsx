import type { PropsWithChildren } from 'react'

export default function PageContainer({ children }: PropsWithChildren) {
  return <div className="w-full px-6 py-6 md:px-10 lg:px-12 lg:py-8">{children}</div>
}

