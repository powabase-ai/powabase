export interface ConnectionParts {
  host: string
  port: string
  user: string
  password: string
  database: string
}

export function parsePostgresUrl(url: string | undefined): ConnectionParts {
  const empty: ConnectionParts = { host: '', port: '5432', user: '', password: '', database: '' }
  if (!url) return empty

  try {
    const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)$/)
    if (!match) return empty

    return {
      user: match[1],
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: match[4] || '5432',
      database: match[5],
    }
  } catch {
    return empty
  }
}

export const CONNECTION_FORMATS: Array<{
  id: string
  label: string
  format: (parts: ConnectionParts) => string
}> = [
  {
    id: 'uri',
    label: 'URI',
    format: (p) => `postgresql://${p.user}:${p.password}@${p.host}:${p.port}/${p.database}`,
  },
  {
    id: 'psql',
    label: 'PSQL',
    format: (p) => `psql "postgresql://${p.user}:${p.password}@${p.host}:${p.port}/${p.database}"`,
  },
  {
    id: 'nodejs',
    label: 'Node.js',
    format: (p) =>
      `const { Pool } = require('pg')\n\nconst pool = new Pool({\n  host: '${p.host}',\n  port: ${p.port},\n  database: '${p.database}',\n  user: '${p.user}',\n  password: '${p.password}',\n})`,
  },
  {
    id: 'python',
    label: 'Python',
    format: (p) =>
      `import psycopg2\n\nconn = psycopg2.connect(\n    host="${p.host}",\n    port=${p.port},\n    dbname="${p.database}",\n    user="${p.user}",\n    password="${p.password}"\n)`,
  },
  {
    id: 'golang',
    label: 'Golang',
    format: (p) =>
      `import "database/sql"\nimport _ "github.com/lib/pq"\n\ndb, err := sql.Open("postgres", "host=${p.host} port=${p.port} user=${p.user} password=${p.password} dbname=${p.database} sslmode=disable")`,
  },
  {
    id: 'jdbc',
    label: 'JDBC',
    format: (p) => `jdbc:postgresql://${p.host}:${p.port}/${p.database}?user=${p.user}&password=${p.password}`,
  },
  {
    id: 'dotnet',
    label: '.NET',
    format: (p) =>
      `Host=${p.host};Port=${p.port};Database=${p.database};Username=${p.user};Password=${p.password}`,
  },
  {
    id: 'php',
    label: 'PHP',
    format: (p) =>
      `$conn = pg_connect("host=${p.host} port=${p.port} dbname=${p.database} user=${p.user} password=${p.password}");`,
  },
  {
    id: 'sqlalchemy',
    label: 'SQLAlchemy',
    format: (p) =>
      `from sqlalchemy import create_engine\n\nengine = create_engine("postgresql://${p.user}:${p.password}@${p.host}:${p.port}/${p.database}")`,
  },
]

export interface ProjectConnectionInfo {
  kong_url: string
  anon_key: string
  service_role_key: string
  jwt_secret?: string
  postgres_url?: string
}
