import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { type NavPage, pageHref } from '@/lib/navigation'

export function NavPageButton({ page }: { page: NavPage }) {
  return (
    <Button
      variant="neutral"
      size="sm"
      nativeButton={false}
      render={<Link to={pageHref(page)} />}
    >
      {page.label}
    </Button>
  )
}
