import { createRoot } from 'react-dom/client'
import { Button } from "@/components/ui/button"

function Home() {
  return (
    <div>
      <Button>Click me</Button>
    </div>
  )
}

const rootElement = 
  document.getElementById('root') || document.createElement('div');

// Create a React root and render your component
const root = createRoot(rootElement);
root.render(<Home />);