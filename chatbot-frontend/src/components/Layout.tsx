import type { PropsWithChildren } from 'react'
import Sidebar from './Sidebar'

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-calisto-canvas text-calisto-ink">
      <Sidebar />
      <main className="min-h-screen lg:pl-60">{children}</main>
    </div>
  )
}
