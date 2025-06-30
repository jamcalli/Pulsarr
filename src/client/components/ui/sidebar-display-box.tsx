import type React from 'react'
import CRTOverlay from './crt-overlay'
import { cn } from '@/lib/utils'

interface SidebarDisplayBoxProps {
  children: React.ReactNode
  className?: string
}

const SidebarDisplayBox = ({ children, className }: SidebarDisplayBoxProps) => {
  return (
    <div
      className={cn(
        'border-2 border-border rounded-md overflow-hidden min-h-[2rem] flex items-center justify-center relative',
        className
      )}
    >
      <div className="absolute inset-0 overflow-hidden">
        <CRTOverlay intensity="medium" className="w-full h-full">
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-secondary-black)' }}
          >
            <div 
              className="text-lg tracking-tighter text-center overflow-hidden w-full"
              style={{
                color: 'var(--static-text)',
                textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
              }}
            >
              {children}
            </div>
          </div>
        </CRTOverlay>
      </div>
    </div>
  )
}

export default SidebarDisplayBox