import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import api from './api';

// Make Pusher available globally for Echo
(window as any).Pusher = Pusher;

const echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'nexosmart-mail-key',
    wsHost: import.meta.env.VITE_REVERB_HOST || 'localhost',
    wsPort: import.meta.env.VITE_REVERB_PORT || 8080,
    wssPort: import.meta.env.VITE_REVERB_PORT || 8080,
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel: { name: string }) => ({
        authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
            api.post('/broadcasting/auth', {
                socket_id: socketId,
                channel_name: channel.name,
            })
                .then(response => callback(null, response.data))
                .catch(error => callback(error instanceof Error ? error : new Error(String(error)), null));
        },
    }),
});

type ChannelAuthorizationCallback = (error: Error | null, authData: { auth: string; channel_data?: string; shared_secret?: string } | null) => void;

export default echo;
