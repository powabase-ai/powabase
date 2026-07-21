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
  const baseUrl = process.env.API_URL || 'http://localhost:5000/api'
  const cpUrl = `${baseUrl}/platform/organizations/${slug}/billing/portal-session`

  const response = await fetch(cpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers.authorization
        ? { Authorization: req.headers.authorization }
        : {}),
    },
    body: JSON.stringify(req.body || {}),
  })

  const data = await response.json().catch(() => ({}))
  return res.status(response.status).json(data)
}
