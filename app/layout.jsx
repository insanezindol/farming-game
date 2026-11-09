import './styles.css'

export const metadata = {
  title: '무야호농장 · 나의 작은 농장',
  description: '씨앗을 심고, 익을 때 돌아오는 나의 작은 농장.',
  openGraph: { title: '무야호농장', description: '씨앗을 심고, 익을 때 돌아오는 나의 작은 농장.' },
  other: { 'page-type': 'software', 'site-kind': 'gaming' },
}

export const viewport = { viewportFit: 'cover' }

export default function Layout({ children }) {
  return (
    <html lang="ko" data-type="software">
      <body>
        <a className="skip-link" href="#main">본문으로 이동</a>
        {children}
      </body>
    </html>
  )
}

