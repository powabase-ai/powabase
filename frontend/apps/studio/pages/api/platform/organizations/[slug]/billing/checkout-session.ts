import { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from '@/lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res
        .status(405)
        .json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const slug = req.query.slug as string
  // Forward to CP backend. API_URL is process.env.API_URL on the server side
  // (NEXT_PUBLIC_API_URL on client). On the server, the env var Studio reads
  // for backend addressing is API_URL — fall back to localhost:5000 for dev.
  const baseUrl = process.env.API_URL || 'http://localhost:5000/api'
  const cpUrl = `${baseUrl}/platform/organizations/${slug}/billing/checkout-session`

  const response = await fetch(cpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Forward the user's bearer token so CP's @require_auth + owner-check apply.
      ...(req.headers.authorization
        ? { Authorization: req.headers.authorization }
        : {}),
    },
    body: JSON.stringify(req.body || {}),
  })

  const data = await response.json().catch(() => ({}))
  return res.status(response.status).json(data)
}
