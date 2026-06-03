import { useEffect, useCallback, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import echo from '../services/echo';
import { showNotificationToast } from '../components/ui/NotificationToast';

interface NewEmailEvent {
    email: {
        id: number;
        thread_id: number;
        from_address: string;
        from_name: string | null;
        subject: string;
        snippet: string;
        category: string;
        sent_at: string;
    };
}

interface ThreadUpdatedEvent {
    thread: {
        id: number;
        subject: string;
        snippet: string;
        last_message_at: string;
        message_count: number;
    };
}

export function useWebSocket(mailboxId: number | null, notificationCategories?: string[]) {
    const queryClient = useQueryClient();
    const [connected, setConnected] = useState(false);
    const mailboxIdRef = useRef(mailboxId);
    mailboxIdRef.current = mailboxId;
    const categoriesRef = useRef(notificationCategories);
    categoriesRef.current = notificationCategories;

    const subscribe = useCallback((mbId: number) => {
        const channel = echo.private(`mailbox.${mbId}`);

        channel
            .subscribed(() => setConnected(true))
            .error(() => setConnected(false));

        channel.listen('.NewEmailReceived', (event: NewEmailEvent) => {
            queryClient.invalidateQueries({ queryKey: ['threads', mbId] });
            queryClient.invalidateQueries({ queryKey: ['counts', mbId] });
            queryClient.invalidateQueries({
                queryKey: ['thread', mbId, event.email.thread_id]
            });
            queryClient.invalidateQueries({ queryKey: ['categoryCounts', mbId] });

            const allowedCategories = categoriesRef.current ?? ['primary', 'updates'];
            const emailCategory = event.email.category || 'primary';
            if (allowedCategories.includes(emailCategory)) {
                showNotificationToast(
                    `New email from ${event.email.from_name || event.email.from_address}`,
                    event.email.subject
                );
            }
        });

        channel.listen('.ThreadUpdated', (event: ThreadUpdatedEvent) => {
            queryClient.invalidateQueries({ queryKey: ['threads', mbId] });
            queryClient.invalidateQueries({ queryKey: ['counts', mbId] });
            queryClient.invalidateQueries({
                queryKey: ['thread', mbId, event.thread.id]
            });
            queryClient.invalidateQueries({ queryKey: ['categoryCounts', mbId] });
        });
    }, [queryClient]);

    useEffect(() => {
        if (!mailboxId) return;

        subscribe(mailboxId);

        return () => {
            echo.leave(`mailbox.${mailboxId}`);
            setConnected(false);
        };
    }, [mailboxId, subscribe]);

    const reconnect = useCallback(() => {
        const mbId = mailboxIdRef.current;
        if (!mbId) return;

        // Leave current channel and disconnect
        echo.leave(`mailbox.${mbId}`);
        setConnected(false);

        // Force reconnect the underlying connector
        try {
            echo.connector.pusher.disconnect();
            echo.connector.pusher.connect();
        } catch {
            // Fallback: just resubscribe
        }

        // Resubscribe after a short delay to let the connection establish
        setTimeout(() => {
            subscribe(mbId);
        }, 500);
    }, [subscribe]);

    return { connected, reconnect };
}
