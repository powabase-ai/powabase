import { Admonition } from 'ui-patterns'

const PublicSchemaNotEnabledAlert = () => {
  return (
    <Admonition type="default">
      <p className="!mt-0 !mb-1.5">The public schema for this project is not exposed</p>
      <p className="!mt-0 !mb-1.5 text-foreground-light">
        You will not be able to query tables and views in the public schema via supabase-js or HTTP
        clients. Contact your project administrator to expose the public schema.
      </p>
    </Admonition>
  )
}

export default PublicSchemaNotEnabledAlert
