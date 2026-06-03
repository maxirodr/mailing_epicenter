import { useEffect } from 'react';

interface ShortcutActions {
  onCompose?: () => void;
  onNextThread?: () => void;
  onPrevThread?: () => void;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onStar?: () => void;
  onFocusSearch?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      switch (e.key) {
        case 'n': actions.onCompose?.(); break;
        case 'j': actions.onNextThread?.(); break;
        case 'k': actions.onPrevThread?.(); break;
        case 'r': actions.onReply?.(); break;
        case 'a': actions.onReplyAll?.(); break;
        case 'f': if (!e.ctrlKey && !e.metaKey) actions.onForward?.(); break;
        case 'e': actions.onArchive?.(); break;
        case '#': actions.onTrash?.(); break;
        case 's': actions.onStar?.(); break;
        case '/': e.preventDefault(); actions.onFocusSearch?.(); break;
        case '?': actions.onShowHelp?.(); break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
