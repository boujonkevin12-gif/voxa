// Service Worker para sincronizar música en background
const CACHE_NAME = 'voxa-cache-v1';
const MUSIC_SYNC_TAG = 'voxa-music-sync';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    self.clients.claim();
});

// Sincronizar estado de música cuando la app se abre
self.addEventListener('sync', (event) => {
    if (event.tag === MUSIC_SYNC_TAG) {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'MUSIC_SYNC_REQUEST',
                        timestamp: Date.now()
                    });
                });
            })
        );
    }
});

// Manejar notificaciones de música
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        if (data.type === 'music-update') {
            event.waitUntil(
                self.registration.showNotification('Voxa - Música actualizada', {
                    body: `${data.title} - ${data.artist}`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23ff7a1a"/><path d="M50 25v50M40 35v30M60 30v40" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>',
                    tag: 'music-update',
                    requireInteraction: false
                })
            );
        }
    } catch (e) {
        console.error('Error en push notification:', e);
    }
});

// Responder a mensajes desde el cliente
self.addEventListener('message', (event) => {
    if (event.data.type === 'MUSIC_STATE_UPDATE') {
        // Guardar estado en IndexedDB para recuperar después
        const dbRequest = indexedDB.open('VoxaDB', 1);
        dbRequest.onsuccess = (e) => {
            const db = e.target.result;
            const transaction = db.transaction(['musicState'], 'readwrite');
            const store = transaction.objectStore('musicState');
            store.put({
                id: 'current',
                ...event.data.payload,
                timestamp: Date.now()
            });
        };
    }
});

// Notificar a los clientes sobre cambios
function broadcastToClients(data) {
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage(data);
        });
    });
}

// Exportar función para usar en chat-script.js
self.broadcastToClients = broadcastToClients;
