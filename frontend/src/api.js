import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const AUTH_TOKEN_KEY = 'copycat_dashboard_token'

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY)

export const setAuthToken = (token) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

export const apiClient = axios.create({
  baseURL: API_BASE,
})

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthToken()
    }
    return Promise.reject(error)
  }
)

// Dashboard auth
export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  me: () => apiClient.get('/auth/me'),
}

// Bot API calls
export const botApi = {
  list: () => apiClient.get('/bots'),
  create: (data) => apiClient.post('/bots', data),
  get: (id) => apiClient.get(`/bots/${id}`),
  update: (id, data) => apiClient.put(`/bots/${id}`, data),
  delete: (id) => apiClient.delete(`/bots/${id}`),
  toggle: (id) => apiClient.patch(`/bots/${id}/toggle`),
  getLogs: (id, limit = 100) => apiClient.get(`/bots/${id}/logs?limit=${limit}`),
  exportLogs: (id, days = 7) => apiClient.get(`/bots/${id}/logs/export?days=${days}`),
}

// Channel API calls
export const channelApi = {
  list: () => apiClient.get('/channels'),
  create: (data) => apiClient.post('/channels', data),
  get: (id) => apiClient.get(`/channels/${id}`),
  getLogs: (id, limit = 100) => apiClient.get(`/channels/${id}/logs?limit=${limit}`),
  postMessage: (id, message, destinationIds = []) =>
    apiClient.post(`/channels/${id}/post-message`, { message, destination_ids: destinationIds }),
  update: (id, data) => apiClient.put(`/channels/${id}`, data),
  delete: (id) => apiClient.delete(`/channels/${id}`),
}

// Rule preview
export const ruleApi = {
  preview: (data) => apiClient.post('/rules/preview', data),
}

// Bot-Channel linking
export const linkApi = {
  link: (botId, channelId) => apiClient.post(`/bots/${botId}/channels/${channelId}`),
  unlink: (botId, channelId) => apiClient.delete(`/bots/${botId}/channels/${channelId}`),
}

// Activity logs
export const logApi = {
  add: (botId, message, logType = 'info') =>
    apiClient.post(`/bots/${botId}/logs`, { message, log_type: logType }),
  notify: (botId, message, logType = 'info') =>
    apiClient.post(`/bots/${botId}/notify-log`, { message, log_type: logType }),
}

// Telegram user session login
export const telegramSessionApi = {
  status: () => apiClient.get('/telegram-session/status'),
  readerStatus: () => apiClient.get('/telegram-reader/status'),
  start: (data) => apiClient.post('/telegram-session/start', data),
  verify: (code) => apiClient.post('/telegram-session/verify', { code }),
  password: (password) => apiClient.post('/telegram-session/password', { password }),
  logout: () => apiClient.delete('/telegram-session'),
}
