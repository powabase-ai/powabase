import { useFormContext } from 'react-hook-form'
import { FormLabel_Shadcn_, SheetSection } from 'ui'
import { KeyValueFieldArray } from 'ui-patterns/form/KeyValueFieldArray/KeyValueFieldArray'

import { CreateCronJobForm } from './CreateCronJobSheet/CreateCronJobSheet.constants'

export const HTTPHeaderFieldsSection = () => {
  const form = useFormContext<CreateCronJobForm>()

  return (
    <SheetSection>
      <FormLabel_Shadcn_>HTTP Headers</FormLabel_Shadcn_>
      <KeyValueFieldArray
        control={form.control}
        name="values.httpHeaders"
        keyFieldName="name"
        valueFieldName="value"
        createEmptyRow={() => ({ name: '', value: '' })}
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
        addLabel="Add a new header"
        addActions={[]}
      />
    </SheetSection>
  )
}
