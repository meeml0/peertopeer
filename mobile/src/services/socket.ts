import { io, Socket } from 'socket.io-client';

// Canlı 7/24 Bulut Sinyalleşme Sunucusu (Render.com)
const SIGNALING_SERVER_URL =
  process.env.EXPO_PUBLIC_SIGNALING_URL || 'https://peertopeer-wtu1.onrender.com';

class SocketService {
  private socket: Socket | null = null;

  connect(userId: string) {
    if (this.socket?.connected) return;

    this.socket = io(SIGNALING_SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('Signaling sunucusuna bağlanıldı:', this.socket?.id);
      this.socket?.emit('register_user', userId);
    });

    this.socket.on('disconnect', () => {
      console.log('Signaling sunucusu bağlantısı koptu.');
    });
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
