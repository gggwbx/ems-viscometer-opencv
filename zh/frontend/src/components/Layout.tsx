import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon, Video, LineChart, Bot, BookOpen, Beaker } from 'lucide-react'

const navItems = [
  { to: '/', icon: Video, label: '视频跟踪' },
  { to: '/fit', icon: LineChart, label: '数据拟合' },
  { to: '/ai', icon: Bot, label: 'AI 助手' },
  { to: '/notes', icon: BookOpen, label: '实验说明' },
]

export default function Layout() {
  const { theme, toggle } = useTheme()

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Beaker className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
              EMS 粘度计
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              数据分析平台
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

        <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-150"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-4.5 w-4.5" />
                <span>浅色模式</span>
              </>
            ) : (
              <>
                <Moon className="h-4.5 w-4.5" />
                <span>深色模式</span>
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
