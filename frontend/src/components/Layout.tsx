import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon, Video, LineChart, Bot, BookOpen, Beaker, Trash2 } from 'lucide-react'
import { clearAllUploads } from '../api/client'

const navItems = [
  { to: '/', icon: Video, label: 'Video Tracking' },
  { to: '/fit', icon: LineChart, label: 'Data Fitting' },
  { to: '/ai', icon: Bot, label: 'AI Assistant' },
  { to: '/notes', icon: BookOpen, label: 'Experiment Notes' },
]

export default function Layout() {
  const { theme, toggle } = useTheme()

  const handleClearUploads = async () => {
    if (!window.confirm('Are you sure you want to delete all uploaded files and tracking results? This action cannot be undone.')) return
    try {
      const res = await clearAllUploads()
      alert(`Cleared: ${res.deleted.videos} videos, ${res.deleted.frames} frames, ${res.deleted.results} tracking results`)
    } catch {
      alert('Clear failed')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Beaker className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
              EMS Viscometer
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Data Analysis Platform
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 space-y-1">
          <button
            onClick={handleClearUploads}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
          >
            <Trash2 className="h-4.5 w-4.5" />
            <span>Clear Uploads</span>
          </button>
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-4.5 w-4.5" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-4.5 w-4.5" />
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
