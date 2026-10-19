import { CredenzaBody, CredenzaFooter } from '@/components/credenza'
import { FieldRowSkeleton } from '@/components/settings/settings-page-skeleton'
import { FieldGroup } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { StepRail } from '@/features/setup/components/setup-step-list'
import { SETUP_STEPS } from '@/features/setup/lib/steps'

export function SetupDialogSkeleton() {
  return (
    <>
      <StepRail>
        <div
          aria-hidden
          className="flex gap-1 p-1 max-md:h-11 max-md:items-center max-md:overflow-hidden md:flex-col"
        >
          {SETUP_STEPS.map((id) => (
            <Skeleton key={id} className="h-8 w-24 shrink-0 md:w-full" />
          ))}
        </div>
      </StepRail>
      <CredenzaBody className="flex flex-col gap-5">
        <div aria-busy className="flex flex-col gap-1">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <StepFieldsSkeleton />
      </CredenzaBody>
      <CredenzaFooter className="flex-col md:col-span-2 md:flex-row md:items-center">
        <Skeleton className="h-10 w-28 max-md:w-full md:order-2" />
        <Skeleton className="h-10 w-20 max-md:w-full md:order-1 md:mr-auto" />
      </CredenzaFooter>
    </>
  )
}

export function StepFieldsSkeleton() {
  return (
    <FieldGroup aria-busy className="gap-6">
      <FieldRowSkeleton />
      <FieldRowSkeleton />
      <FieldRowSkeleton />
    </FieldGroup>
  )
}
