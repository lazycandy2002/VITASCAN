import { useEffect, useRef, useState } from 'react'
import { IconPerson } from './icons'

interface Props {
    open: boolean
    onClose: () => void
    onLogin: (username: string) => void
}

function IconLock({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    )
}

function IconEye({ className, off }: { className?: string; off?: boolean }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
            <circle cx="12" cy="12" r="3" />
            {off && <line x1="2" y1="2" x2="22" y2="22" />}
        </svg>
    )
}

function IconX({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
    )
}

// TODO: replace with a real call to your auth backend / device-paired admin store.
async function validateLogin(username: string, password: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 500))
    return username.trim().toLowerCase() === 'admin' && password === 'admin'
}

export default function LoginModal({ open, onClose, onLogin }: Props) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const firstFieldRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (open) {
            setUsername('')
            setPassword('')
            setShowPassword(false)
            setError('')
            setLoading(false)
            setTimeout(() => firstFieldRef.current?.focus(), 0)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!username.trim() || !password) {
            setError('Enter both username and password.')
            return
        }
        setLoading(true)
        setError('')
        const ok = await validateLogin(username, password)
        setLoading(false)
        if (ok) {
            onLogin(username.trim())
        } else {
            setError('Incorrect username or password.')
        }
    }

    return (
        <div
            className="login-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="login-card">
                <button type="button" className="login-close" onClick={onClose} aria-label="Close">
                    <IconX className="icon-sm" />
                </button>

                <div className="login-avatar">
                    <IconPerson className="icon-lg" />
                </div>

                <h2 id="login-title" className="login-title">
                    Staff Login
                </h2>
                <p className="login-subtitle">Sign in to access kiosk settings</p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="field-row">
                        <label className="field-label" htmlFor="login-username">
                            <IconPerson className="icon-sm" /> Username
                        </label>
                        <input
                            id="login-username"
                            ref={firstFieldRef}
                            className="field-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username..."
                            autoComplete="username"
                        />
                    </div>

                    <div className="field-row">
                        <label className="field-label" htmlFor="login-password">
                            <IconLock className="icon-sm" /> Password
                        </label>
                        <div className="login-password-wrap">
                            <input
                                id="login-password"
                                className="field-input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password..."
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="login-eye-btn"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <IconEye className="icon-sm" off={showPassword} />
                            </button>
                        </div>
                    </div>

                    {error && <p className="login-error">{error}</p>}

                    <div className="btn-row login-btn-row">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                            {loading ? 'Signing in…' : 'Sign In'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}