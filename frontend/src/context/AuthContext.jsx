import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

const ROLE_ROUTES = {
  admin: '/admin/dashboard',
  hod: '/hod/dashboard',
  faculty: '/faculty/dashboard',
}

const LOGIN_ROLES = new Set(['admin', 'hod', 'faculty'])

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }

    authAPI
      .me()
      .then((res) => {
        const profile = res.data.user
        if (!LOGIN_ROLES.has(profile?.role)) {
          localStorage.removeItem('access_token')
          localStorage.removeItem('user')
          setUser(null)
          return
        }
        setUser(profile)
        localStorage.setItem('user', JSON.stringify(profile))
      })
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const res = await authAPI.login(username, password)
    const { access_token, user: loggedInUser } = res.data

    if (!LOGIN_ROLES.has(loggedInUser?.role)) {
      throw new Error('This account cannot sign in.')
    }

    localStorage.setItem('access_token', access_token)
    localStorage.setItem('user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)

    return ROLE_ROUTES[loggedInUser.role] || '/login'
  }

  const logout = async () => {
    try {
      await authAPI.logout()
    } catch {
      // Token may already be invalid; still clear client state
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      getDashboardPath: (role) => ROLE_ROUTES[role || user?.role] || '/login',
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
