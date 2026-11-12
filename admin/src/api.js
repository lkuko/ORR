const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'

async function request(path, options = {}) {
  const token = localStorage.getItem('adminToken')
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: options.data ? JSON.stringify(options.data) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || '请求失败')
  return data
}

export const api = {
  login: (username, password) => request('/auth/admin-login', { method: 'POST', data: { username, password } }),
  reports: status => request(`/admin/reports?status=${status}`),
  content: (type, id) => request(`/admin/content/${type}/${id}`),
  resolveReport: (id, status, resolution) => request(`/admin/reports/${id}/resolve`, { method: 'POST', data: { status, resolution } }),
  hide: (type, id, reason) => request(`/admin/content/${type}/${id}/hide`, { method: 'POST', data: { reason } }),
  cancellations: () => request('/admin/cancellations'),
  resolveCancellation: (id, cancelled, reason) => request(`/admin/tasks/${id}/cancellation`, { method: 'POST', data: { cancelled, reason } }),
  users: query => request(`/admin/users?q=${encodeURIComponent(query || '')}`),
  setUserStatus: (id, status, reason) => request(`/admin/users/${id}/status`, { method: 'PATCH', data: { status, reason } }),
  actions: () => request('/admin/actions')
}
