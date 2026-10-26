const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map of userId -> socketId and socketId -> userId
const onlineUsers = new Map(); // userId -> socketId
const socketToUser = new Map(); // socketId -> userId
const activeStreams = new Map(); // streamId -> { hostId, hostSocketId }
const socketToStream = new Map(); // socketId -> streamId

app.get('/', (req, res) => {
  res.send({ status: 'Signaling Server Running', onlineCount: onlineUsers.size });
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Register user with their Supabase/App User ID
  socket.on('register_user', (userId) => {
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    console.log(`[User Registered] User ID: ${userId} -> Socket: ${socket.id}`);
    
    // Kendisine mevcut tüm online kullanıcıların listesini gönder
    socket.emit('online_users_list', Array.from(onlineUsers.keys()));

    // Herkese bu kullanıcının online olduğunu bildir
    io.emit('user_status_changed', { userId, status: 'online' });
  });

  // Call Request (Caller initiates to Callee)
  socket.on('call_user', ({ toUserId, callerName, callerAvatar, callType, offer }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    const callerUserId = socketToUser.get(socket.id);

    console.log(`[Call Attempt] From: ${callerUserId} (${callerName}) -> To: ${toUserId}`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        fromUserId: callerUserId,
        callerName,
        callerAvatar,
        callType: callType || 'video', // 'video' or 'audio'
        offer
      });
    } else {
      socket.emit('call_failed', {
        reason: 'USER_OFFLINE',
        message: 'Kullanıcı şu anda çevrimdışı.'
      });
    }
  });

  // Answer Call (Callee accepts and sends back SDP Answer)
  socket.on('answer_call', ({ toUserId, answer }) => {
    const calleeUserId = socketToUser.get(socket.id);
    const targetSocketId = onlineUsers.get(toUserId);
    console.log(`[Call Answered] From Callee: ${calleeUserId} -> To Caller: ${toUserId} (Socket: ${targetSocketId})`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('call_answered', {
        fromUserId: calleeUserId,
        answer
      });
    } else {
      console.warn(`[Answer Failed] Caller socket bulunamadi: ${toUserId}`);
    }
  });

  // Reject Call
  socket.on('reject_call', ({ toUserId }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', {
        fromUserId: socketToUser.get(socket.id)
      });
    }
  });

  // End / Hangup Call
  socket.on('end_call', ({ toUserId }) => {
    const senderUserId = socketToUser.get(socket.id);
    const targetSocketId = onlineUsers.get(toUserId);
    console.log(`[Call Ended] Sender: ${senderUserId} -> Target: ${toUserId} (Socket: ${targetSocketId})`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended', {
        fromUserId: senderUserId
      });
    }
  });

  // ICE Candidate exchange
  socket.on('ice_candidate', ({ toUserId, candidate }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice_candidate', {
        fromUserId: socketToUser.get(socket.id),
        candidate
      });
    }
  });

  // ========================================================
  // CANLI YAYIN (LIVE STREAM) SİNYALLEŞME ODALARI (P2P Mesh)
  // ========================================================

  // 1. Yayın Başlatma Bildirimi (Host odayı oluşturur)
  socket.on('start_live_stream', ({ streamId, hostId }) => {
    const roomName = `stream_${streamId}`;
    socket.join(roomName);
    activeStreams.set(streamId, { hostId, hostSocketId: socket.id });
    socketToStream.set(socket.id, streamId);
    console.log(`[Live Stream Started] Stream: ${streamId} by Host: ${hostId} (Socket: ${socket.id})`);
    
    // Tüm kullanıcılara yeni bir canlı yayın başladığını duyur (UI'da kırmızı canlı halkası için)
    io.emit('live_stream_status_changed', { streamId, hostId, status: 'started' });
  });

  // 1.1 Yayıncının Canlı Video Karesi Göndermesi (Expo Go / Cross-Platform Anlık Akış)
  socket.on('stream_frame', ({ streamId, frameData }) => {
    const roomName = `stream_${streamId}`;
    // Odaya yayıncının karesini anında fırlat (yayıncının kendisi hariç)
    socket.to(roomName).emit('stream_frame_received', { frameData });
  });

  // 2. İzleyicinin Yayın Odasına Katılması
  socket.on('join_live_stream', ({ streamId, viewerId, hostId }) => {
    const roomName = `stream_${streamId}`;
    socket.join(roomName);
    console.log(`[Viewer Joined] Viewer: ${viewerId} joined ${roomName}`);

    // Yayıncıya bu izleyicinin katıldığını bildir ki yayıncı ona WebRTC Offer gönderebilsin
    const hostSocketId = onlineUsers.get(hostId);
    if (hostSocketId) {
      io.to(hostSocketId).emit('new_stream_viewer', {
        streamId,
        viewerId,
        viewerSocketId: socket.id
      });
    }

    // Odadaki izleyici sayısını güncelle
    const room = io.sockets.adapter.rooms.get(roomName);
    const viewerCount = room ? Math.max(0, room.size - 1) : 0; // Host hariç
    io.to(roomName).emit('stream_viewer_count', { streamId, count: viewerCount });
  });

  // 3. Yayıncının İzleyiciye WebRTC Offer Göndermesi
  socket.on('stream_offer_to_viewer', ({ streamId, viewerSocketId, hostSocketId, offer }) => {
    const hostUserId = socketToUser.get(socket.id);
    io.to(viewerSocketId).emit('stream_offer_received', {
      streamId,
      hostUserId,
      hostSocketId: hostSocketId || socket.id,
      offer
    });
  });

  // 4. İzleyicinin Yayıncıya WebRTC Answer Göndermesi
  socket.on('stream_answer_from_viewer', ({ streamId, hostId, answer }) => {
    const hostSocketId = onlineUsers.get(hostId);
    if (hostSocketId) {
      io.to(hostSocketId).emit('stream_answer_received', {
        streamId,
        viewerSocketId: socket.id,
        answer
      });
    }
  });

  // 5. Canlı Yayın ICE Candidate Değişimi
  socket.on('stream_ice_candidate', ({ targetSocketId, candidate }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit('stream_ice_candidate', {
        fromSocketId: socket.id,
        candidate
      });
    }
  });

  // 6. Canlı Yayın İçi Yorum / Beğeni Mesajlaşması
  socket.on('stream_send_chat', ({ streamId, message, senderName, senderAvatar, isHeart }) => {
    const roomName = `stream_${streamId}`;
    io.to(roomName).emit('stream_chat_received', {
      streamId,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      message,
      senderName,
      senderAvatar,
      isHeart: !!isHeart,
      created_at: new Date().toISOString()
    });
  });

  // 7. İzleyicinin Odadan Ayrılması
  socket.on('leave_live_stream', ({ streamId }) => {
    const roomName = `stream_${streamId}`;
    socket.leave(roomName);
    const room = io.sockets.adapter.rooms.get(roomName);
    const viewerCount = room ? Math.max(0, room.size - 1) : 0;
    io.to(roomName).emit('stream_viewer_count', { streamId, count: viewerCount });
  });

  // 8. Yayıncının Yayını Sonlandırması
  socket.on('end_live_stream', ({ streamId }) => {
    const roomName = `stream_${streamId}`;
    console.log(`[Live Stream Ended] Stream: ${streamId}`);
    activeStreams.delete(streamId);
    socketToStream.delete(socket.id);
    io.to(roomName).emit('stream_ended', { streamId });
    io.sockets.adapter.rooms.delete(roomName);
    io.emit('live_stream_status_changed', { streamId, status: 'ended' });
  });

  // Disconnect
  socket.on('disconnect', () => {
    // Eğer yayıncı bağlantıyı kopardıysa (uygulamayı kapattıysa) yayını otomatik bitir!
    const activeStreamId = socketToStream.get(socket.id);
    if (activeStreamId) {
      console.log(`[Host Disconnected] Canlı yayın otomatik bitiriliyor: ${activeStreamId}`);
      activeStreams.delete(activeStreamId);
      socketToStream.delete(socket.id);
      io.to(`stream_${activeStreamId}`).emit('stream_ended', { streamId: activeStreamId });
      io.emit('live_stream_status_changed', { streamId: activeStreamId, status: 'ended' });
    }

    const userId = socketToUser.get(socket.id);
    if (userId) {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      console.log(`[User Disconnected] User ID: ${userId}`);
      io.emit('user_status_changed', { userId, status: 'offline' });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Signaling Server listening on port ${PORT}`);
});
