const stripTrailingSlash = (value) => String(value || '').replace(/\/+$/, '')

const ensureApiSuffix = (value) => {
  const normalized = stripTrailingSlash(value || '/api')
  if (normalized.endsWith('/api')) return normalized
  return `${normalized}/api`
}

const readBase = () => (
  import.meta.env.VITE_API_BASE_URL
  || import.meta.env.VITE_API_URL
  || '/api'
)

const BASE = ensureApiSuffix(readBase())
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i

const getToken = () => localStorage.getItem('token')

const toApiPath = (path = '') => {
  const value = String(path || '')
  if (!value) return ''
  if (ABSOLUTE_URL_PATTERN.test(value)) return value

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  if (withLeadingSlash === '/api') return ''
  if (withLeadingSlash.startsWith('/api/')) return withLeadingSlash.slice(4)
  return withLeadingSlash
}

const buildUrl = (path = '') => {
  const normalized = toApiPath(path)
  if (ABSOLUTE_URL_PATTERN.test(normalized)) return normalized
  return `${BASE}${normalized}`
}

const handleUnauthorized = () => {
  localStorage.removeItem('token')
  window.location.href = '/login'
}

const buildHeaders = ({ withJson = true, headers = {} } = {}) => ({
  ...(withJson ? { 'Content-Type': 'application/json' } : {}),
  Accept: 'application/json',
  'ngrok-skip-browser-warning': 'true',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  ...headers,
})

const parseResponseData = async (res) => {
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    try {
      return await res.json()
    } catch {
      return null
    }
  }

  try {
    const text = await res.text()
    return text ? { message: text } : null
  } catch {
    return null
  }
}

const getErrorMessage = (data, fallback) => {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data === 'object') return data.error || data.message || fallback
  return fallback
}

const req = async (method, path, body) => {
  const res = await fetch(buildUrl(path), {
    method,
    headers: buildHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401) {
    handleUnauthorized()
    return null
  }

  const data = await parseResponseData(res)
  if (!res.ok) throw new Error(getErrorMessage(data, 'Request failed'))
  return data
}

const uploadReq = async (path, formData) => {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: buildHeaders({ withJson: false }),
    body: formData,
  })

  if (res.status === 401) {
    handleUnauthorized()
    return null
  }

  const data = await parseResponseData(res)
  if (!res.ok) throw new Error(getErrorMessage(data, 'Upload gagal'))
  return data
}

const parseDownloadFilename = (res, fallbackName) => {
  const disposition = res.headers.get('content-disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i)
  if (plainMatch?.[1]) return plainMatch[1]

  return fallbackName
}

const download = async (path, options = {}) => {
  const {
    method = 'GET',
    body,
    filename = 'download.bin',
    headers = {},
  } = options

  const res = await fetch(buildUrl(path), {
    method,
    headers: buildHeaders({ withJson: false, headers }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401) {
    handleUnauthorized()
    return null
  }

  if (!res.ok) {
    const data = await parseResponseData(res)
    throw new Error(getErrorMessage(data, 'Gagal download file'))
  }

  const blob = await res.blob()
  const finalFilename = parseDownloadFilename(res, filename)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = finalFilename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)

  return {
    filename: finalFilename,
    size: blob.size,
  }
}

export const api = {
  get: (path) => req('GET', path),
  post: (path, body) => req('POST', path, body),
  patch: (path, body) => req('PATCH', path, body),
  put: (path, body) => req('PUT', path, body),
  delete: (path) => req('DELETE', path),
  upload: (path, formData) => uploadReq(path, formData),
  download,
  buildUrl,
}
