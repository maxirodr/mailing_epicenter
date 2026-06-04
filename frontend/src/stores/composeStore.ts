import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ComposeInstance {
  id: string;
  isMinimized: boolean;
  mode: 'new' | 'reply' | 'forward';
  draftId: number | null;
  mailboxId: number | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  replyToEmailId: number | null;
  attachmentIds: number[];
}

interface ComposeStore {
  instances: ComposeInstance[];

  openNew: (mailboxId: number | null, signature?: string) => void;
  openDraft: (draft: { id: number; mailboxId: number; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; attachmentIds: number[]; replyToEmailId?: number | null }) => void;
  openReply: (mailboxId: number | null, emailId: number, to: string[], subject: string, body: string, signature?: string, cc?: string[]) => void;
  openForward: (mailboxId: number | null, emailId: number, subject: string, body: string) => void;
  updateInstance: (id: string, field: Partial<ComposeInstance>) => void;
  setMinimized: (id: string, min: boolean) => void;
  closeInstance: (id: string) => void;
  reset: () => void;

  // Legacy compat selectors
  isOpen: boolean;
}

let idCounter = 0;
function nextId(): string {
  return `compose-${Date.now()}-${++idCounter}`;
}

export const useComposeStore = create<ComposeStore>()(
  persist(
    (set, get) => ({
      instances: [],
      get isOpen() { return get().instances.length > 0; },

      openNew: (mailboxId, signature) => set((state) => ({
        instances: [...state.instances, {
          id: nextId(),
          isMinimized: false,
          mode: 'new',
          draftId: null,
          mailboxId,
          to: [],
          cc: [],
          bcc: [],
          subject: '',
          body: signature ? `<br><br><div class="signature">${signature}</div>` : '',
          replyToEmailId: null,
          attachmentIds: [],
        }],
      })),

      openDraft: (draft) => set((state) => ({
        instances: [...state.instances, {
          id: nextId(),
          isMinimized: false,
          mode: draft.replyToEmailId ? 'reply' : 'new',
          draftId: draft.id,
          mailboxId: draft.mailboxId,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          body: draft.body,
          replyToEmailId: draft.replyToEmailId ?? null,
          attachmentIds: draft.attachmentIds,
        }],
      })),

      openReply: (mailboxId, emailId, to, subject, body, signature, cc) => {
        const sigBlock = signature ? `<br><br><div class="signature">${signature}</div>` : '';
        set((state) => ({
          instances: [...state.instances, {
            id: nextId(),
            isMinimized: false,
            mode: 'reply' as const,
            draftId: null,
            mailboxId,
            to,
            cc: cc ?? [],
            bcc: [],
            subject: /^(Re|Fwd):/i.test(subject) ? subject : `Re: ${subject}`,
            body: sigBlock + body,
            replyToEmailId: emailId,
            attachmentIds: [],
          }],
        }));
      },

      openForward: (mailboxId, emailId, subject, body) => set((state) => ({
        instances: [...state.instances, {
          id: nextId(),
          isMinimized: false,
          mode: 'forward',
          draftId: null,
          mailboxId,
          to: [],
          cc: [],
          bcc: [],
          subject: subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`,
          body,
          replyToEmailId: emailId,
          attachmentIds: [],
        }],
      })),

      updateInstance: (id, field) => set((state) => ({
        instances: state.instances.map((inst) =>
          inst.id === id ? { ...inst, ...field } : inst
        ),
      })),

      setMinimized: (id, min) => set((state) => ({
        instances: state.instances.map((inst) =>
          inst.id === id ? { ...inst, isMinimized: min } : inst
        ),
      })),

      closeInstance: (id) => set((state) => ({
        instances: state.instances.filter((inst) => inst.id !== id),
      })),

      reset: () => set({ instances: [] }),
    }),
    {
      name: 'epicenter-compose',
      partialize: (state) => ({
        instances: state.instances,
      }),
    }
  )
);
