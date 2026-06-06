import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

export const dashboardAPI = {
  admin: () => api.get('/dashboard/admin'),
  hod: () => api.get('/dashboard/hod'),
  faculty: () => api.get('/dashboard/faculty'),
}

export const hodAPI = {
  dashboard: () => api.get('/hod/dashboard'),
  listFaculty: () => api.get('/hod/faculty'),
  addFaculty: (data) => api.post('/hod/faculty', data),
  addCourse: (data) => api.post('/hod/courses', data),
  updateFacultyAccess: (id, isActive) =>
    api.patch(`/hod/faculty/${id}/access`, { is_active: isActive }),
  deleteAssignment: (id) => api.delete(`/hod/assignments/${id}`),
  listCoSubmissions: () => api.get('/hod/co-submissions'),
  getCoSubmission: (id) => api.get(`/hod/co-submissions/${id}`),
}

export const facultyAPI = {
  dashboardStats: (params) => api.get('/faculty/dashboard-stats', { params }),
  marksheetConfig: () => api.get('/faculty/marksheet-config'),
  previewStudents: (params) => api.get('/faculty/students', { params }),
  listMarksheets: () => api.get('/faculty/marksheets'),
  getMarksheet: (id) => api.get(`/faculty/marksheets/${id}`),
  createMarksheet: (data) => api.post('/faculty/marksheets', data),
  updateMarksheet: (id, data) => api.put(`/faculty/marksheets/${id}`, data),
  deleteMarksheet: (id) => api.delete(`/faculty/marksheets/${id}`),
  submitCoAttainment: (id, data) => api.post(`/faculty/marksheets/${id}/submit-co-attainment`, data),
}

export const adminAPI = {
  listDepartments: () => api.get('/admin/departments'),
  getDepartment: (id) => api.get(`/admin/departments/${id}`),
  addDepartment: (data) => api.post('/admin/departments', data),
  updateDepartment: (id, data) => api.put(`/admin/departments/${id}`, data),
  deleteDepartment: (id) => api.delete(`/admin/departments/${id}`),

  listHods: () => api.get('/admin/hods'),
  getHod: (id) => api.get(`/admin/hods/${id}`),
  addHod: (data) => api.post('/admin/hod', data),
  updateHod: (id, data) => api.put(`/admin/hods/${id}`, data),
  deleteHod: (id) => api.delete(`/admin/hods/${id}`),

  listFaculty: () => api.get('/admin/faculty-list'),
  getFaculty: (id) => api.get(`/admin/faculty/${id}`),
  addFaculty: (data) => api.post('/admin/faculty', data),
  updateFaculty: (id, data) => api.put(`/admin/faculty/${id}`, data),
  deleteFaculty: (id) => api.delete(`/admin/faculty/${id}`),

  listCourses: () => api.get('/admin/courses'),
  getCourse: (id) => api.get(`/admin/courses/${id}`),
  addCourse: (data) => api.post('/admin/course', data),
  updateCourse: (id, data) => api.put(`/admin/courses/${id}`, data),
  deleteCourse: (id) => api.delete(`/admin/courses/${id}`),
}

export default api
