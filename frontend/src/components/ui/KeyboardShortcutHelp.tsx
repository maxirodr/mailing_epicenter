import Modal from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['j'], description: 'Next conversation' },
      { keys: ['k'], description: 'Previous conversation' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['Esc'], description: 'Close / go back' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['e'], description: 'Archive' },
      { keys: ['#'], description: 'Move to trash' },
      { keys: ['s'], description: 'Star / unstar' },
      { keys: ['Shift', 'i'], description: 'Mark as read' },
      { keys: ['Shift', 'u'], description: 'Mark as unread' },
    ],
  },
  {
    title: 'Compose',
    shortcuts: [
      { keys: ['n'], description: 'New message' },
      { keys: ['r'], description: 'Reply' },
      { keys: ['a'], description: 'Reply all' },
      { keys: ['f'], description: 'Forward' },
      { keys: ['Ctrl', 'Enter'], description: 'Send message' },
    ],
  },
  {
    title: 'Other',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
    ],
  },
];

export default function KeyboardShortcutHelp({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts" wide>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <h4
              className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {group.title}
            </h4>
            <div className="space-y-2">
              {group.shortcuts.map((s) => (
                <div key={s.description} className="flex items-center justify-between gap-4">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {s.description}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex min-w-[24px] items-center justify-center rounded-md px-1.5 py-1 text-xs font-medium"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
