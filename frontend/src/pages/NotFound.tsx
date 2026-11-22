import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

export function NotFound() {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-[#2a2a3d] bg-[#15151f] text-indigo-300">
        <Compass className="size-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-[#f0f1f6]">Page not found</h1>
      <p className="mt-1 text-xs leading-relaxed text-[#8b93a3]">
        This route does not exist in the workspace. Head back to the overview or start a new test.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/">
          <Button size="sm">Go to overview</Button>
        </Link>
        <Link to="/new">
          <Button size="sm" variant="secondary">
            New test
          </Button>
        </Link>
      </div>
    </Card>
  )
}
