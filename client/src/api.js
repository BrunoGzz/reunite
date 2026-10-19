// Small helpers around fetch. Errors carry the message from the server.
async function request(method, url, body) {
  const options = { method, headers: {} }
  if (body instanceof FormData) {
    options.body = body
  } else if (body) {
    options.headers['content-type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.')
    error.status = res.status
    throw error
  }
  return data
}

export const get = (url) => request('GET', url)
export const post = (url, body) => request('POST', url, body)
