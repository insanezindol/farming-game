import { Jua } from 'next/font/google'
import './styles.css'

// 둥근 한글 글꼴 Jua (SIL Open Font License 1.1, Woowahan Brothers) — 제목·버튼·라벨에 쓴다
const cute = Jua({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-cute' })

export const metadata = {
  title: '무야호농장 · 나의 작은 농장',
  description: '씨앗을 심고, 익을 때 돌아오는 나의 작은 농장.',
  openGraph: { title: '무야호농장', description: '씨앗을 심고, 익을 때 돌아오는 나의 작은 농장.' },
  other: { 'page-type': 'software', 'site-kind': 'gaming' },
}

export const viewport = { viewportFit: 'cover' }

export default function Layout({ children }) {
  return (
    <html lang="ko" data-type="software" className={cute.variable}>
      <body>
        <a className="skip-link" href="#main">본문으로 이동</a>
        {children}
      </body>
    </html>
  )
}
