import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminAPI } from '../../services/api'

const ROLE_STYLES = {
  admin: 'bg-blue-100 text-blue-800',
  hod: 'bg-indigo-100 text-indigo-800',
  faculty: 'bg-emerald-100 text-emerald-800',
}

const AVATAR_STYLES = {
  admin: 'bg-blue-500',
  hod: 'bg-indigo-500',
  faculty: 'bg-emerald-500',
}

function roleLabel(role) {
  if (role === 'hod') return 'HOD'
  if (role === 'faculty') return 'Faculty'
  if (role === 'admin') return 'Admin'
  return role || '—'
}

function formatLastLogin(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function UserAvatar({ name, role }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
        AVATAR_STYLES[role] || 'bg-slate-500'
      }`}
    >
      {initial}
    </span>
  )
}

function ActionButton({ tone, icon, label, onClick, disabled }) {
  const tones = {
    view: 'border-blue-200 text-blue-600 hover:bg-blue-50',
    reset: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    danger: 'border-red-200 text-red-600 hover:bg-red-50',
    success: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
  }
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-xs ${tones[tone]}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

export default function AdminUserManagement({ onView, onAddUser, onDelete, refreshKey = 0 }) {
  const [draftSearch, setDraftSearch] = useState('')
  const [draftRole, setDraftRole] = useState('all')
  const [draftStatus, setDraftStatus] = useState('all')
  const [filters, setFilters] = useState({ q: '', role: 'all', status: 'all' })
  const [page, setPage] = useState(1)
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({ page: 1, per_page: 10, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)

  const perPage = 10

  const loadUsers = useCallback(() => {
    setLoading(true)
    setError('')
    return adminAPI
      .listUsers({
        q: filters.q,
        role: filters.role,
        status: filters.status,
        page,
        per_page: perPage,
      })
      .then((res) => {
        setUsers(res.data.users || [])
        setPagination(res.data.pagination || { page: 1, per_page: perPage, total: 0, total_pages: 1 })
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load users.')
      })
      .finally(() => setLoading(false))
  }, [filters, page, refreshKey])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const applyFilters = () => {
    setPage(1)
    setFilters({
      q: draftSearch.trim(),
      role: draftRole,
      status: draftStatus,
    })
  }

  const handleResetPassword = async (user) => {
    const password = window.prompt(
      `Set a new password for ${user.full_name} (min 6 characters):`,
    )
    if (!password) return
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setBusyId(user.id)
    setError('')
    setMessage('')
    try {
      const res = await adminAPI.resetUserPassword(user.id, password)
      setMessage(res.data.message || 'Password reset successfully.')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset password.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteUser = async (user) => {
    if (user.role === 'admin') {
      setError('Admin accounts cannot be deleted.')
      return
    }
    setBusyId(user.id)
    setError('')
    setMessage('')
    try {
      await onDelete?.(user)
      setMessage(`${user.full_name} deleted successfully.`)
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete user.')
    } finally {
      setBusyId(null)
    }
  }

  const handleToggleStatus = async (user) => {
    const next = !user.is_active
    const verb = next ? 'activate' : 'deactivate'
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${user.full_name}?`)) {
      return
    }
    setBusyId(user.id)
    setError('')
    setMessage('')
    try {
      const res = await adminAPI.setUserStatus(user.id, next)
      setMessage(res.data.message || `User ${verb}d.`)
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || `Could not ${verb} user.`)
    } finally {
      setBusyId(null)
    }
  }

  const pageNumbers = useMemo(() => {
    const total = pagination.total_pages || 1
    const current = pagination.page || 1
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1)
    }
    const nums = new Set([1, total, current, current - 1, current + 1])
    return [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  }, [pagination])

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.per_page + 1
  const rangeEnd = Math.min(pagination.page * pagination.per_page, pagination.total)

  return (
    <section className="rounded-2xl bg-white shadow-md">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">User Management</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Search, filter, and manage HODs, faculty, and admin accounts
            </p>
          </div>
          <button
            type="button"
            onClick={onAddUser}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Add User
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {message && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
              </svg>
            </span>
            <input
              type="search"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search users by name, email or username..."
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="hod">HOD</option>
            <option value="faculty">Faculty</option>
          </select>
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M10 12h4M12 16h0" />
            </svg>
            Filter
          </button>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[24%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[34%]" />
          </colgroup>
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 lg:px-6">ID</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Last Login</th>
              <th className="px-4 py-3 lg:px-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No users found. Try changing filters or add a new user.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-slate-500 lg:px-6">{user.id}</td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={user.full_name} role={user.role} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{user.full_name}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        ROLE_STYLES[user.role] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        user.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="truncate px-3 py-3 text-slate-600">
                    {formatLastLogin(user.last_login_at)}
                  </td>
                  <td className="px-4 py-3 lg:px-6">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <ActionButton
                        tone="view"
                        label="View"
                        disabled={busyId === user.id}
                        onClick={() => onView?.(user)}
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        }
                      />
                      {onDelete && user.role !== 'admin' && (
                        <ActionButton
                          tone="danger"
                          label="Delete"
                          disabled={busyId === user.id}
                          onClick={() => handleDeleteUser(user)}
                          icon={
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          }
                        />
                      )}
                      <ActionButton
                        tone="reset"
                        label="Reset Password"
                        disabled={busyId === user.id}
                        onClick={() => handleResetPassword(user)}
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                        }
                      />
                      <ActionButton
                        tone={user.is_active ? 'danger' : 'success'}
                        label={user.is_active ? 'Deactivate' : 'Activate'}
                        disabled={busyId === user.id}
                        onClick={() => handleToggleStatus(user)}
                        icon={
                          user.is_active ? (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Showing {rangeStart} to {rangeEnd} of {pagination.total} users
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          {pageNumbers.map((num, idx) => {
            const prev = pageNumbers[idx - 1]
            const showEllipsis = prev && num - prev > 1
            return (
              <span key={num} className="inline-flex items-center gap-1">
                {showEllipsis && <span className="px-1 text-slate-400">…</span>}
                <button
                  type="button"
                  onClick={() => setPage(num)}
                  className={`min-w-[2rem] rounded-md px-3 py-1.5 text-sm ${
                    pagination.page === num
                      ? 'bg-blue-600 font-semibold text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {num}
                </button>
              </span>
            )
          })}
          <button
            type="button"
            disabled={pagination.page >= pagination.total_pages}
            onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
