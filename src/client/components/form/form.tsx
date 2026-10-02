import type { ComponentProps } from 'react'
import { useFormContext } from '@/lib/form-context'

type FormProps = Omit<ComponentProps<'form'>, 'onSubmit' | 'noValidate'>

export function Form(props: FormProps) {
  const form = useFormContext()

  return (
    <form
      {...props}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        // handleSubmit only blocks re-entry on the first attempt, so a submit in flight has to be ignored here.
        if (form.state.isSubmitting) return
        form.handleSubmit()
      }}
    />
  )
}
