import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export interface ToastMessage {
  id: number
  title: string
  detail?: string
}

const DURATION = 3000

interface ToastProps {
  message: ToastMessage
  onDismiss: (id: number) => void
}

function ToastItem({ message, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Double RAF ensures the initial opacity:0 is painted before transitioning
    let raf2: number
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true))
    })

    const hideTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(message.id), 320)
    }, DURATION)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(hideTimer)
    }
  }, [message.id, onDismiss])

  function dismiss() {
    setVisible(false)
    setTimeout(() => onDismiss(message.id), 320)
  }

  return (
    <div className={`toast ${visible ? 'toast--visible' : ''}`} role="status" aria-live="polite">
      <div className="toast__inner">
        <CheckCircle2 className="toast__icon" size={15} />
        <div className="toast__body">
          <span className="toast__title">{message.title}</span>
          {message.detail ? <span className="toast__detail">{message.detail}</span> : null}
        </div>
        <button className="toast__close" type="button" aria-label="关闭" onClick={dismiss}>
          <X size={12} />
        </button>
      </div>
      <div className="toast__progress">
        <div className="toast__progress-bar" />
      </div>
    </div>
  )
}

interface ToastContainerProps {
  messages: ToastMessage[]
  onDismiss: (id: number) => void
}

export function ToastContainer({ messages, onDismiss }: ToastContainerProps) {
  if (messages.length === 0) return null
  return (
    <div className="toast-container" aria-label="通知">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
