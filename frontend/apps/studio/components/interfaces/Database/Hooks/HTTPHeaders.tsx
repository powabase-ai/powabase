import { UseFormReturn } from 'react-hook-form'
import { KeyValueFieldArray } from 'ui-patterns/form/KeyValueFieldArray/KeyValueFieldArray'

import { WebhookFormValues } from './EditHookPanel.constants'
import {
  FormSection,
  FormSectionContent,
  FormSectionLabel,
} from '@/components/ui/Forms/FormSection'
import { uuidv4 } from '@/lib/helpers'

interface HTTPHeadersProps {
  form: UseFormReturn<WebhookFormValues>
}

export const HTTPHeaders = ({ form }: HTTPHeadersProps) => {
  return (
    <FormSection
      header={<FormSectionLabel className="lg:!col-span-4">HTTP Headers</FormSectionLabel>}
    >
      <FormSectionContent loading={false} className="lg:!col-span-8">
        <KeyValueFieldArray
          control={form.control}
          name="httpHeaders"
          keyFieldName="name"
          valueFieldName="value"
          createEmptyRow={() => ({ id: uuidv4(), name: '', value: '' })}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
          addLabel="Add a new header"
          addActions={[]}
        />
      </FormSectionContent>
    </FormSection>
  )
}
