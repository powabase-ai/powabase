import { zodResolver } from '@hookform/resolvers/zod'
import { SubmitHandler, useForm } from 'react-hook-form'
import { Button, Form_Shadcn_, FormControl_Shadcn_, FormField_Shadcn_, Input_Shadcn_ } from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import z from 'zod'

import {
  getInviteCodeErrorMessage,
  INVITE_CODE_INVALID_MESSAGE,
  type SignUpInviteAcceptance,
} from './SignUpInvite.utils'
import { useSignUpInviteValidateMutation } from '@/data/misc/signup-invite-validate-mutation'

const schema = z.object({
  code: z.string().trim().min(1, 'Invite code is required').max(200, 'Invite code is too long'),
})

const formId = 'sign-up-invite-code-form'

type SignUpInviteCodeFormProps = {
  /** Prefills the input, e.g. from an `?invite=` link. */
  defaultCode?: string
  /** Called once the invite step is done; see SignUpInviteAcceptance. */
  onAccepted: (acceptance: SignUpInviteAcceptance) => void
}

export const SignUpInviteCodeForm = ({
  defaultCode = '',
  onAccepted,
}: SignUpInviteCodeFormProps) => {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: defaultCode },
  })

  const { mutate: validateInvite, isPending: isValidating } = useSignUpInviteValidateMutation({
    onSuccess: ({ valid, required }, { code }) => {
      if (!required) return onAccepted({})
      if (valid) return onAccepted({ code })
      form.setError('code', { message: INVITE_CODE_INVALID_MESSAGE })
    },
    onError: (error) => {
      form.setError('code', { message: getInviteCodeErrorMessage(error) })
    },
  })

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = ({ code }) => {
    validateInvite({ code: code.trim() })
  }

  const code = form.watch('code')
  const isSubmitting = form.formState.isSubmitting || isValidating

  return (
    <Form_Shadcn_ {...form}>
      <form id={formId} className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField_Shadcn_
          key="code"
          name="code"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout
              name="code"
              label="Invite code"
              description="Sign-up is currently by invitation. Enter your invite code to continue."
            >
              <FormControl_Shadcn_>
                <Input_Shadcn_
                  id="code"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={isSubmitting}
                  {...field}
                  placeholder="Your invite code"
                />
              </FormControl_Shadcn_>
            </FormItemLayout>
          )}
        />

        <Button
          block
          form={formId}
          htmlType="submit"
          size="large"
          disabled={code.trim().length === 0 || isSubmitting}
          loading={isSubmitting}
        >
          Continue
        </Button>
      </form>
    </Form_Shadcn_>
  )
}
